import * as XLSX from 'xlsx';
import { boqDb, type HistoricalUsage, type StandardReference, type AnalyticsResult } from './db';

export function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/,/g, '').replace(/٪/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[], m: number): number {
  if (arr.length < 2) return 0;
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1));
}

function removeOutliersIQR(arr: number[]): { clean: number[]; nOutliers: number } {
  if (arr.length < 4) return { clean: arr, nOutliers: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const clean = arr.filter(v => v >= lo && v <= hi);
  return { clean, nOutliers: arr.length - clean.length };
}

function computeStats(values: number[]) {
  const { clean, nOutliers } = removeOutliersIQR(values);
  const data = clean.length > 0 ? clean : values;
  const sorted = [...data].sort((a, b) => a - b);
  const m = mean(data);
  const sd = stdDev(data, m);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  return {
    n: data.length, nOutliers,
    mean: m, median: percentile(sorted, 50), std: sd,
    p50: percentile(sorted, 50), p75: percentile(sorted, 75),
    p80: percentile(sorted, 80), p90: percentile(sorted, 90),
    min: sorted[0] ?? 0, max: sorted[sorted.length - 1] ?? 0,
    iqr: q3 - q1,
  };
}

function computeConfidenceScore(n: number, stabilityScore: number, cv: number): number {
  const sampleScore = n >= 20 ? 40 : n >= 10 ? 30 : n >= 5 ? 20 : n >= 3 ? 10 : 5;
  const stabilityComponent = Math.round(stabilityScore * 40);
  const volatilityComponent = cv < 0.15 ? 20 : cv < 0.30 ? 15 : cv < 0.50 ? 10 : cv < 0.80 ? 5 : 0;
  return Math.min(100, sampleScore + stabilityComponent + volatilityComponent);
}

export function getVolatilityLevel(cv: number): string {
  if (cv < 0.15) return 'مستقر جداً';
  if (cv < 0.30) return 'مستقر';
  if (cv < 0.50) return 'متذبذب';
  if (cv < 0.80) return 'متذبذب جداً';
  return 'غير مستقر';
}

// ── Excel column detection (ported from boq.ts) ──────────────────────────────

const COL_DEFAULT = {
  projectId: 0, projectName: 2, projectType: 4, projectStatus: 6,
  boqItemCode: 14, boqItemName: 18, elementCodeBoq: 20, elementNameBoq: 22,
  branch: 24, unit: 26, qty: 28, unitPrice: 30, totalValue: 32,
  totalRequests: 34, totalCleared: 36,
  elementCode: 50, elementName: 52, requestedQty: 54, requestedAmount: 56,
  clearedQty: 58, clearedAmount: 60,
} as const;

type ColMap = typeof COL_DEFAULT;

function detectColumns(headerRow: unknown[]): ColMap {
  const h = (i: number) => String(headerRow[i] ?? '').trim();
  if (h(COL_DEFAULT.projectId).includes('رقم المشروع') && h(COL_DEFAULT.elementName).includes('اسم الصنف')) {
    return COL_DEFAULT;
  }
  const map: Record<string, number> = { ...COL_DEFAULT };
  const occurrences: Record<string, number[]> = {};
  headerRow.forEach((cell, i) => {
    const v = String(cell ?? '').trim();
    if (!v) return;
    if (!occurrences[v]) occurrences[v] = [];
    occurrences[v].push(i);
  });
  const first = (k: string) => (occurrences[k] ?? [])[0] ?? -1;
  const second = (k: string) => (occurrences[k] ?? [])[1] ?? -1;
  if (first('رقم المشروع') >= 0) map.projectId = first('رقم المشروع');
  if (first('اسم المشروع') >= 0) map.projectName = first('اسم المشروع');
  if (first('النوع') >= 0) map.projectType = first('النوع');
  if (first('الحالة') >= 0) map.projectStatus = first('الحالة');
  if (first('م البند') >= 0) map.boqItemCode = first('م البند');
  if (second('الكلفة') >= 0) map.boqItemName = second('الكلفة');
  if (first('البند') >= 0) map.elementCodeBoq = first('البند');
  if (second('البند') >= 0) map.elementNameBoq = second('البند');
  if (first('الفرع') >= 0) map.branch = first('الفرع');
  if (first('الوحدة') >= 0) map.unit = first('الوحدة');
  if (first('الكمية') >= 0) map.qty = first('الكمية');
  if (first('سعر الوحدة') >= 0) map.unitPrice = first('سعر الوحدة');
  if (first('القيمة') >= 0) map.totalValue = first('القيمة');
  if (second('اجمالي الطلبات') >= 0) map.totalRequests = second('اجمالي الطلبات');
  if (second('اجمالي ما تم اخلاؤه') >= 0) map.totalCleared = second('اجمالي ما تم اخلاؤه');
  if (first('رمز الصنف') >= 0) map.elementCode = first('رمز الصنف');
  if (first('اسم الصنف') >= 0) map.elementName = first('اسم الصنف');
  if (first('كمية الطلب') >= 0) map.requestedQty = first('كمية الطلب');
  if (first('مبلغ الطلبات') >= 0) map.requestedAmount = first('مبلغ الطلبات');
  const clrQtyKey = first('كمية الاخلاء') >= 0 ? 'كمية الاخلاء' : 'كمية الإخلاء';
  if (first(clrQtyKey) >= 0) map.clearedQty = first(clrQtyKey);
  const clrAmtKey = first('مبلغ الاخلاء') >= 0 ? 'مبلغ الاخلاء' : 'مبلغ الإخلاء';
  if (first(clrAmtKey) >= 0) map.clearedAmount = first(clrAmtKey);
  return map as unknown as ColMap;
}

// ── Excel Import ──────────────────────────────────────────────────────────────

export async function importExcelFile(file: File): Promise<{ batchId: number; rowsImported: number; columnsDetected: string[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (allRows.length < 2) throw new Error('الملف لا يحتوي على بيانات');

  const headerRow = allRows[0];
  const dataRows = allRows.slice(1);
  const C = detectColumns(headerRow);
  const g = (row: unknown[], idx: number): string => String(row[idx] ?? '').trim();

  const batchId = await boqDb.importBatches.add({
    filename: file.name,
    importedAt: new Date().toISOString(),
    rowCount: 0,
    status: 'processing',
  });

  const toInsert: HistoricalUsage[] = dataRows
    .filter(row => g(row, C.elementName) !== '')
    .map(row => ({
      batchId,
      projectId: g(row, C.projectId) || null,
      projectName: g(row, C.projectName) || null,
      projectType: g(row, C.projectType) || null,
      projectStatus: g(row, C.projectStatus) || null,
      boqItemCode: g(row, C.boqItemCode) || null,
      boqItemName: g(row, C.boqItemName) || null,
      branch: g(row, C.branch) || null,
      unit: g(row, C.unit) || null,
      qty: parseNum(row[C.qty]) !== null ? String(parseNum(row[C.qty])) : null,
      unitPrice: parseNum(row[C.unitPrice]) !== null ? String(parseNum(row[C.unitPrice])) : null,
      totalValue: parseNum(row[C.totalValue]) !== null ? String(parseNum(row[C.totalValue])) : null,
      elementCode: g(row, C.elementCode) || null,
      elementName: g(row, C.elementName) || null,
      requestedQty: parseNum(row[C.requestedQty]) !== null ? String(parseNum(row[C.requestedQty])) : null,
      requestedAmount: parseNum(row[C.requestedAmount]) !== null ? String(parseNum(row[C.requestedAmount])) : null,
      clearedQty: String(parseNum(row[C.clearedQty]) ?? 0),
      clearedAmount: String(parseNum(row[C.clearedAmount]) ?? 0),
      totalRequests: parseNum(row[C.totalRequests]) !== null ? String(parseNum(row[C.totalRequests])) : null,
      totalCleared: parseNum(row[C.totalCleared]) !== null ? String(parseNum(row[C.totalCleared])) : null,
      createdAt: new Date().toISOString(),
    }));

  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    await boqDb.historicalUsage.bulkAdd(toInsert.slice(i, i + CHUNK));
  }

  await boqDb.importBatches.update(batchId, { status: 'done', rowCount: toInsert.length });
  return { batchId, rowsImported: toInsert.length, columnsDetected: Object.keys(C) };
}

// ── Main Analytics Engine ─────────────────────────────────────────────────────

export async function runAnalyticsEngine(opts?: { projectType?: string; branch?: string }): Promise<number> {
  const allStandard = await boqDb.standardReference.toArray();

  let allRows = await boqDb.historicalUsage.toArray();
  if (opts?.projectType && opts.projectType !== 'الكل') {
    allRows = allRows.filter(r => r.projectType === opts.projectType);
  }
  if (opts?.branch && opts.branch !== 'الكل') {
    allRows = allRows.filter(r => r.branch === opts.branch);
  }
  if (allRows.length === 0) throw new Error('لا توجد بيانات تاريخية. يرجى رفع ملف Excel أولاً.');

  const standardMap = new Map<string, StandardReference>();
  for (const s of allStandard) {
    standardMap.set(`${s.boqItemName.trim().toLowerCase()}|||${s.elementName.trim().toLowerCase()}`, s);
  }

  const groups: Record<string, HistoricalUsage[]> = {};
  for (const row of allRows) {
    if (!row.boqItemName || !row.elementName) continue;
    const key = `${row.boqItemName}|||${row.elementName}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const results: AnalyticsResult[] = [];

  for (const [key, rows] of Object.entries(groups)) {
    const [boqItemName, elementName] = key.split('|||');
    const elementCode = rows.find(r => r.elementCode)?.elementCode || null;

    const cfs: number[] = [];
    for (const row of rows) {
      const req = parseNum(row.requestedQty);
      const clr = parseNum(row.clearedQty) ?? 0;
      if (req && req > 0) cfs.push(clr / req);
    }
    const cfStats = cfs.length > 0 ? computeStats(cfs) : null;

    const normClearedQtys: number[] = [];
    const normRequestedQtys: number[] = [];
    const normClearedAmounts: number[] = [];
    const actualPrices: number[] = [];
    const overAllocPcts: number[] = [];

    for (const row of rows) {
      const boqQty = parseNum(row.qty);
      const clr = parseNum(row.clearedQty) ?? 0;
      const req = parseNum(row.requestedQty);
      const clrAmt = parseNum(row.clearedAmount) ?? 0;
      if (boqQty && boqQty > 0) {
        if (clr > 0) normClearedQtys.push(clr / boqQty);
        if (req !== null && req > 0) normRequestedQtys.push(req / boqQty);
        if (clrAmt > 0) normClearedAmounts.push(clrAmt / boqQty);
      }
      if (clrAmt > 0 && clr > 0) actualPrices.push(clrAmt / clr);
      if (req && req > 0) overAllocPcts.push(((req - clr) / Math.max(clr, 0.0001)) * 100);
    }

    const clrQtyStats  = normClearedQtys.length  > 0 ? computeStats(normClearedQtys)  : null;
    const reqQtyStats  = normRequestedQtys.length > 0 ? computeStats(normRequestedQtys) : null;
    const priceStats   = actualPrices.length      > 0 ? computeStats(actualPrices)      : null;
    const amtStats     = normClearedAmounts.length > 0 ? computeStats(normClearedAmounts): null;
    const overAllocStats = overAllocPcts.length   > 0 ? computeStats(overAllocPcts)     : null;

    if (normClearedQtys.length === 0 && cfs.length === 0) continue;

    let adaptiveQty: number | null = null;
    let cv = 0;
    if (clrQtyStats && clrQtyStats.n > 0) {
      cv = clrQtyStats.mean > 0 ? clrQtyStats.std / clrQtyStats.mean : 0;
      if      (cv < 0.15) adaptiveQty = clrQtyStats.p75;
      else if (cv < 0.30) adaptiveQty = clrQtyStats.p80;
      else                adaptiveQty = clrQtyStats.p90;
    }

    const adaptiveUnitPrice = priceStats ? priceStats.median : null;
    const adaptiveAmount = adaptiveQty != null && adaptiveUnitPrice != null ? adaptiveQty * adaptiveUnitPrice : null;

    const stdKey = `${boqItemName.trim().toLowerCase()}|||${elementName.trim().toLowerCase()}`;
    const stdRef = standardMap.get(stdKey);
    const origStdQty   = stdRef ? parseNum(stdRef.standardQty)  : null;
    const origStdPrice = stdRef ? parseNum(stdRef.standardPrice) : null;
    const origStdAmount = origStdQty != null && origStdPrice != null ? origStdQty * origStdPrice : null;
    const correctionRatio = adaptiveQty != null && origStdQty != null && origStdQty > 0 ? adaptiveQty / origStdQty : null;
    const medNormClr = clrQtyStats ? clrQtyStats.median : null;
    const stdOverAllocPct = origStdQty != null && medNormClr != null && medNormClr > 0 ? ((origStdQty - medNormClr) / medNormClr) * 100 : null;

    let efficiencyRating = 'غير محدد';
    if (cfStats && cfStats.mean > 0) {
      const cvCf = cfStats.std / cfStats.mean;
      if      (cvCf < 0.15) efficiencyRating = 'ممتاز';
      else if (cvCf < 0.30) efficiencyRating = 'جيد جداً';
      else if (cvCf < 0.50) efficiencyRating = 'جيد';
      else if (cvCf < 0.80) efficiencyRating = 'متوسط';
      else                  efficiencyRating = 'ضعيف';
    }

    const stabilityScore = cfStats && cfStats.std >= 0 && cfStats.mean > 0 ? Math.max(0, 1 - cfStats.std / cfStats.mean) : null;
    const nFinal = cfStats ? cfStats.n : (clrQtyStats?.n ?? 0);
    const confidenceLevel = nFinal >= 10 ? 'عالية' : nFinal >= 5 ? 'متوسطة' : 'منخفضة';
    const stab = stabilityScore ?? 0;
    const cvFinal = cfStats && cfStats.mean > 0 ? cfStats.std / cfStats.mean : cv;
    const confidenceScore = computeConfidenceScore(nFinal, stab, cvFinal);
    const volatilityLevel = getVolatilityLevel(cvFinal);
    const sortedCfs = [...cfs].sort((a, b) => a - b);
    const p10Cf = cfStats ? percentile(sortedCfs, 10) : 0;
    const p90Cf = cfStats ? percentile(sortedCfs, 90) : 0;
    const percentileSpread = cfStats && cfStats.median > 0 ? (p90Cf - p10Cf) / cfStats.median : null;

    const zeroCleared = rows.filter(r => (parseNum(r.clearedQty) ?? 0) === 0).length;
    const pctZeroCleared = rows.length > 0 ? zeroCleared / rows.length : 0;
    const avgCfVal = cfStats ? cfStats.mean : 0;
    let executionMode = 'غير محدد';
    if      (pctZeroCleared > 0.80)               executionMode = 'مالي فقط';
    else if (avgCfVal < 0.05)                      executionMode = 'مشبوه';
    else if (avgCfVal > 0.75 && cvFinal < 0.25)   executionMode = 'تنفيذ مباشر';
    else if (cvFinal > 0.70)                       executionMode = 'مختلط';
    else if (pctZeroCleared > 0.40)               executionMode = 'مقاول جزئي';
    else                                           executionMode = 'تنفيذ جزئي';
    const executionCompletenessScore = (1 - pctZeroCleared).toFixed(4);

    results.push({
      boqItemName, elementName, elementCode,
      nProjects: nFinal,
      nOutliers: cfStats ? cfStats.nOutliers : 0,
      meanCf:   cfStats ? cfStats.mean.toFixed(6)   : null,
      medianCf: cfStats ? cfStats.median.toFixed(6) : null,
      stdCf:    cfStats ? cfStats.std.toFixed(6)    : null,
      p50Cf:    cfStats ? cfStats.p50.toFixed(6)    : null,
      p75Cf:    cfStats ? cfStats.p75.toFixed(6)    : null,
      p80Cf:    cfStats ? cfStats.p80.toFixed(6)    : null,
      p90Cf:    cfStats ? cfStats.p90.toFixed(6)    : null,
      minCf:    cfStats ? cfStats.min.toFixed(6)    : null,
      maxCf:    cfStats ? cfStats.max.toFixed(6)    : null,
      iqrCf:    cfStats ? cfStats.iqr.toFixed(6)    : null,
      avgOverAllocPct:    overAllocStats ? overAllocStats.mean.toFixed(4)   : null,
      medianOverAllocPct: overAllocStats ? overAllocStats.median.toFixed(4) : null,
      recommendedFactor:  cfStats ? cfStats.p80.toFixed(6) : null,
      meanClearedQty:    clrQtyStats ? clrQtyStats.mean.toFixed(6)   : null,
      medianClearedQty:  clrQtyStats ? clrQtyStats.median.toFixed(6) : null,
      stdClearedQty:     clrQtyStats ? clrQtyStats.std.toFixed(6)    : null,
      p75ClearedQty:     clrQtyStats ? clrQtyStats.p75.toFixed(6)    : null,
      p80ClearedQty:     clrQtyStats ? clrQtyStats.p80.toFixed(6)    : null,
      p90ClearedQty:     clrQtyStats ? clrQtyStats.p90.toFixed(6)    : null,
      minClearedQty:     clrQtyStats ? clrQtyStats.min.toFixed(6)    : null,
      maxClearedQty:     clrQtyStats ? clrQtyStats.max.toFixed(6)    : null,
      meanActualPrice:   priceStats ? priceStats.mean.toFixed(4)   : null,
      medianActualPrice: priceStats ? priceStats.median.toFixed(4) : null,
      stdActualPrice:    priceStats ? priceStats.std.toFixed(4)    : null,
      p80ActualPrice:    priceStats ? priceStats.p80.toFixed(4)    : null,
      medianClearedAmount: amtStats ? amtStats.median.toFixed(2) : null,
      p80ClearedAmount:    amtStats ? amtStats.p80.toFixed(2)    : null,
      avgAllocQty:    reqQtyStats ? reqQtyStats.mean.toFixed(6)   : null,
      avgUsedQty:     clrQtyStats ? clrQtyStats.mean.toFixed(6)   : null,
      medianUsedQty:  clrQtyStats ? clrQtyStats.median.toFixed(6) : null,
      avgClearedAmount: amtStats ? amtStats.mean.toFixed(2) : null,
      adaptiveQty:       adaptiveQty       != null ? adaptiveQty.toFixed(6)       : null,
      adaptiveUnitPrice: adaptiveUnitPrice  != null ? adaptiveUnitPrice.toFixed(4) : null,
      adaptiveAmount:    adaptiveAmount     != null ? adaptiveAmount.toFixed(2)    : null,
      correctionRatio:   correctionRatio    != null ? correctionRatio.toFixed(6)   : null,
      origStdQty:        origStdQty    != null ? origStdQty.toFixed(6)    : null,
      origStdPrice:      origStdPrice  != null ? origStdPrice.toFixed(4)  : null,
      origStdAmount:     origStdAmount != null ? origStdAmount.toFixed(2) : null,
      efficiencyRating, stabilityScore: stabilityScore != null ? stabilityScore.toFixed(4) : null,
      confidenceLevel, confidenceScore: confidenceScore.toFixed(4),
      volatilityLevel, coefficientOfVariation: cvFinal.toFixed(4),
      percentileSpread: percentileSpread != null ? percentileSpread.toFixed(4) : null,
      stdOverAllocPct: stdOverAllocPct != null ? stdOverAllocPct.toFixed(4) : null,
      executionMode, executionCompletenessScore,
      computedAt: new Date().toISOString(),
    });
  }

  // Upsert analytics results
  for (const result of results) {
    const existing = await boqDb.analyticsResults
      .where('[boqItemName+elementName]')
      .equals([result.boqItemName, result.elementName])
      .first();
    if (existing?.id) {
      await boqDb.analyticsResults.update(existing.id, result);
    } else {
      await boqDb.analyticsResults.add(result);
    }
  }

  return results.length;
}
