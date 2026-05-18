import { Router, type Request, type Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  historicalUsageTable,
  importBatchesTable,
  analyticsResultsTable,
  standardReferenceTable,
} from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { STANDARD_DATA } from "./boqStandardData.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(/,/g, "").replace(/٪/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function percentile(sorted: number[], p: number): number {
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
  const variance = arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function removeOutliersIQR(arr: number[]): { clean: number[]; nOutliers: number } {
  if (arr.length < 4) return { clean: arr, nOutliers: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const clean = arr.filter((v) => v >= lo && v <= hi);
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
    n: data.length,
    nOutliers,
    mean: m,
    median: percentile(sorted, 50),
    std: sd,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p80: percentile(sorted, 80),
    p90: percentile(sorted, 90),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    iqr: q3 - q1,
  };
}

router.post("/seed-standard", async (_req: Request, res: Response) => {
  try {
    await db.delete(standardReferenceTable);
    const rows: {
      boqItemId: string;
      boqItemName: string;
      boqItemNumber: string | null;
      sheet: string | null;
      boqUnit: string | null;
      elementName: string;
      elementUnit: string | null;
      standardQty: string;
      standardPrice: string;
    }[] = [];
    for (const item of STANDARD_DATA) {
      for (const el of item["العناصر"] as Array<{ "اسم الصنف": string; "الوحدة": string; "الكمية": number; "سعر الوحدة": number }>) {
        rows.push({
          boqItemId: item["id"] as string,
          boqItemName: item["اسم البند"] as string,
          boqItemNumber: (item["رقم البند"] as string) || null,
          sheet: (item["الورقة"] as string) || null,
          boqUnit: (item["الوحدة"] as string) || null,
          elementName: el["اسم الصنف"],
          elementUnit: el["الوحدة"] || null,
          standardQty: String(el["الكمية"] ?? 0),
          standardPrice: String(el["سعر الوحدة"] ?? 0),
        });
      }
    }
    if (rows.length > 0) {
      await db.insert(standardReferenceTable).values(rows);
    }
    res.json({ success: true, inserted: rows.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/standard", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(standardReferenceTable);
    const grouped: Record<string, { item: { id: string; name: string; number: string; sheet: string; unit: string }; elements: unknown[] }> = {};
    for (const r of rows) {
      const key = r.boqItemId;
      if (!grouped[key]) {
        grouped[key] = {
          item: { id: r.boqItemId, name: r.boqItemName, number: r.boqItemNumber || "", sheet: r.sheet || "", unit: r.boqUnit || "" },
          elements: [],
        };
      }
      grouped[key].elements.push({
        name: r.elementName,
        unit: r.elementUnit,
        qty: parseFloat(r.standardQty || "0"),
        price: parseFloat(r.standardPrice || "0"),
      });
    }
    res.json({ items: Object.values(grouped) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Column index constants matching the actual Excel format (merged-cell, every-other-column blank)
const COL = {
  projectId:       0,   // رقم المشروع
  projectName:     2,   // اسم المشروع
  projectType:     4,   // النوع
  projectStatus:   6,   // الحالة
  boqItemCode:    14,   // م البند
  boqItemName:    18,   // الكلفة (2nd occurrence = item name)
  elementCodeBoq: 20,   // البند (1st occurrence = BOQ element code)
  elementNameBoq: 22,   // البند (2nd occurrence = BOQ element name)
  branch:         24,   // الفرع
  unit:           26,   // الوحدة
  qty:            28,   // الكمية
  unitPrice:      30,   // سعر الوحدة
  totalValue:     32,   // القيمة
  totalRequests:  34,   // اجمالي الطلبات (element-level)
  totalCleared:   36,   // اجمالي ما تم اخلاؤه (element-level)
  elementCode:    50,   // رمز الصنف (ERP/material code)
  elementName:    52,   // اسم الصنف (ERP/material name)
  requestedQty:   54,   // كمية الطلب
  requestedAmount:56,   // مبلغ الطلبات
  clearedQty:     58,   // كمية الاخلاء
  clearedAmount:  60,   // مبلغ الاخلاء
} as const;

function detectColumns(headerRow: unknown[]): typeof COL {
  // If the file matches expected header keywords at the known positions, use defaults.
  // Otherwise, fall back to scanning for keywords to build a dynamic map.
  const h = (i: number) => String(headerRow[i] ?? "").trim();

  const looksLikeKnownFormat =
    h(COL.projectId).includes("رقم المشروع") &&
    h(COL.elementName).includes("اسم الصنف");

  if (looksLikeKnownFormat) return COL;

  // Fallback: scan all headers and map by keyword
  const map = { ...COL };
  const occurrences: Record<string, number[]> = {};
  headerRow.forEach((cell, i) => {
    const v = String(cell ?? "").trim();
    if (!v) return;
    if (!occurrences[v]) occurrences[v] = [];
    occurrences[v].push(i);
  });

  const first = (k: string) => (occurrences[k] ?? [])[0] ?? -1;
  const second = (k: string) => (occurrences[k] ?? [])[1] ?? -1;

  if (first("رقم المشروع") >= 0)        map.projectId       = first("رقم المشروع");
  if (first("اسم المشروع") >= 0)        map.projectName     = first("اسم المشروع");
  if (first("النوع") >= 0)              map.projectType     = first("النوع");
  if (first("الحالة") >= 0)             map.projectStatus   = first("الحالة");
  if (first("م البند") >= 0)            map.boqItemCode     = first("م البند");
  if (second("الكلفة") >= 0)            map.boqItemName     = second("الكلفة");
  if (first("البند") >= 0)              map.elementCodeBoq  = first("البند");
  if (second("البند") >= 0)             map.elementNameBoq  = second("البند");
  if (first("الفرع") >= 0)              map.branch          = first("الفرع");
  if (first("الوحدة") >= 0)             map.unit            = first("الوحدة");
  if (first("الكمية") >= 0)             map.qty             = first("الكمية");
  if (first("سعر الوحدة") >= 0)         map.unitPrice       = first("سعر الوحدة");
  if (first("القيمة") >= 0)             map.totalValue      = first("القيمة");
  if (second("اجمالي الطلبات") >= 0)    map.totalRequests   = second("اجمالي الطلبات");
  if (second("اجمالي ما تم اخلاؤه") >= 0) map.totalCleared = second("اجمالي ما تم اخلاؤه");
  if (first("رمز الصنف") >= 0)          map.elementCode     = first("رمز الصنف");
  if (first("اسم الصنف") >= 0)          map.elementName     = first("اسم الصنف");
  if (first("كمية الطلب") >= 0)         map.requestedQty    = first("كمية الطلب");
  if (first("مبلغ الطلبات") >= 0)       map.requestedAmount = first("مبلغ الطلبات");
  if (first("كمية الاخلاء") >= 0 || first("كمية الإخلاء") >= 0)
    map.clearedQty = first("كمية الاخلاء") >= 0 ? first("كمية الاخلاء") : first("كمية الإخلاء");
  if (first("مبلغ الاخلاء") >= 0 || first("مبلغ الإخلاء") >= 0)
    map.clearedAmount = first("مبلغ الاخلاء") >= 0 ? first("مبلغ الاخلاء") : first("مبلغ الإخلاء");

  return map;
}

router.post("/import", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: "لم يتم رفع أي ملف" }); return; }
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Read as raw arrays — avoids duplicate-header key collisions
    const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (allRows.length < 2) { res.status(400).json({ error: "الملف لا يحتوي على بيانات" }); return; }

    const headerRow = allRows[0];
    const dataRows  = allRows.slice(1);
    const C = detectColumns(headerRow);

    const g = (row: unknown[], idx: number): string => String(row[idx] ?? "").trim();

    const [batch] = await db
      .insert(importBatchesTable)
      .values({ filename: req.file.originalname, rowCount: dataRows.length, status: "processing" })
      .returning();

    const toInsert = dataRows
      .filter(row => g(row, C.elementName) !== "")
      .map(row => ({
        batchId:         batch.id,
        projectId:       g(row, C.projectId)    || null,
        projectName:     g(row, C.projectName)   || null,
        projectType:     g(row, C.projectType)   || null,
        projectStatus:   g(row, C.projectStatus) || null,
        boqItemCode:     g(row, C.boqItemCode)   || null,
        boqItemName:     g(row, C.boqItemName)   || null,
        branch:          g(row, C.branch)         || null,
        unit:            g(row, C.unit)           || null,
        qty:             parseNum(row[C.qty])           !== null ? String(parseNum(row[C.qty]))           : null,
        unitPrice:       parseNum(row[C.unitPrice])     !== null ? String(parseNum(row[C.unitPrice]))     : null,
        totalValue:      parseNum(row[C.totalValue])    !== null ? String(parseNum(row[C.totalValue]))    : null,
        elementCode:     g(row, C.elementCode)   || null,
        elementName:     g(row, C.elementName)   || null,
        requestedQty:    parseNum(row[C.requestedQty])  !== null ? String(parseNum(row[C.requestedQty]))  : null,
        requestedAmount: parseNum(row[C.requestedAmount])!== null? String(parseNum(row[C.requestedAmount])): null,
        clearedQty:      parseNum(row[C.clearedQty])    !== null ? String(parseNum(row[C.clearedQty]))    : null,
        clearedAmount:   parseNum(row[C.clearedAmount]) !== null ? String(parseNum(row[C.clearedAmount])) : null,
        totalRequests:   parseNum(row[C.totalRequests]) !== null ? String(parseNum(row[C.totalRequests])) : null,
        totalCleared:    parseNum(row[C.totalCleared])  !== null ? String(parseNum(row[C.totalCleared]))  : null,
      }));

    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await db.insert(historicalUsageTable).values(toInsert.slice(i, i + CHUNK));
    }

    await db.update(importBatchesTable)
      .set({ status: "done", rowCount: toInsert.length })
      .where(eq(importBatchesTable.id, batch.id));

    res.json({
      success: true,
      batchId: batch.id,
      rowsImported: toInsert.length,
      totalRows: dataRows.length,
      columnsUsed: C,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/batches", async (_req: Request, res: Response) => {
  try {
    const batches = await db.select().from(importBatchesTable).orderBy(sql`imported_at DESC`);
    res.json({ batches });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/batches/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(historicalUsageTable).where(eq(historicalUsageTable.batchId, id));
    await db.delete(importBatchesTable).where(eq(importBatchesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/run-analytics", async (_req: Request, res: Response) => {
  try {
    const [allRows, allStandard] = await Promise.all([
      db.select().from(historicalUsageTable),
      db.select().from(standardReferenceTable),
    ]);

    if (allRows.length === 0) {
      res.status(400).json({ error: "لا توجد بيانات تاريخية. يرجى رفع ملف Excel أولاً." });
      return;
    }

    // Build standard reference lookup map (boqItemName|||elementName → row)
    const standardMap = new Map<string, typeof allStandard[0]>();
    for (const s of allStandard) {
      standardMap.set(`${s.boqItemName.trim().toLowerCase()}|||${s.elementName.trim().toLowerCase()}`, s);
    }

    // Group historical rows by (boqItemName + elementName)
    const groups: Record<string, typeof allRows> = {};
    for (const row of allRows) {
      if (!row.boqItemName || !row.elementName) continue;
      const key = `${row.boqItemName}|||${row.elementName}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];

    for (const [key, rows] of Object.entries(groups)) {
      const [boqItemName, elementName] = key.split("|||");
      const elementCode = rows.find(r => r.elementCode)?.elementCode || null;

      // ── LAYER 2a: Consumption Factor (cleared/requested) ─────────────
      const cfs: number[] = [];
      for (const row of rows) {
        const req = parseNum(row.requestedQty);
        const clr = parseNum(row.clearedQty);
        if (req && req > 0 && clr !== null && clr >= 0) cfs.push(clr / req);
      }
      const cfStats = cfs.length > 0 ? computeStats(cfs) : null;

      // ── LAYER 2b: Cleared Quantity stats (raw absolute values) ────────
      const clearedQtys = rows
        .map(r => parseNum(r.clearedQty))
        .filter((v): v is number => v !== null && v > 0);
      const clrQtyStats = clearedQtys.length > 0 ? computeStats(clearedQtys) : null;

      // ── LAYER 2c: Actual Unit Price = clearedAmount / clearedQty ──────
      const actualPrices: number[] = [];
      for (const row of rows) {
        const clrAmt = parseNum(row.clearedAmount);
        const clrQty = parseNum(row.clearedQty);
        if (clrAmt != null && clrQty != null && clrQty > 0)
          actualPrices.push(clrAmt / clrQty);
      }
      const priceStats = actualPrices.length > 0 ? computeStats(actualPrices) : null;

      // ── LAYER 2d: Cleared Amount stats ───────────────────────────────
      const clearedAmounts = rows
        .map(r => parseNum(r.clearedAmount))
        .filter((v): v is number => v !== null && v > 0);
      const amtStats = clearedAmounts.length > 0 ? computeStats(clearedAmounts) : null;

      // Requested qty stats (for legacy fields)
      const requestedQtys = rows
        .map(r => parseNum(r.requestedQty))
        .filter((v): v is number => v !== null && v > 0);
      const reqStats = requestedQtys.length > 0 ? computeStats(requestedQtys) : null;

      // Over-allocation percentages
      const overAllocPcts: number[] = [];
      for (const row of rows) {
        const req = parseNum(row.requestedQty);
        const clr = parseNum(row.clearedQty);
        if (req && req > 0 && clr !== null)
          overAllocPcts.push(((req - clr) / Math.max(clr, 0.0001)) * 100);
      }
      const overAllocStats = overAllocPcts.length > 0 ? computeStats(overAllocPcts) : null;

      if (clearedQtys.length === 0 && cfs.length === 0) continue;

      // ── LAYER 3: Adaptive Recommended Standard ────────────────────────
      // Threshold selection is stability-adaptive:
      //   CV < 0.15 → very stable → P75 is sufficient
      //   CV 0.15–0.30 → moderate variance → use P80
      //   CV > 0.30 → high volatility → use P90 as safety margin
      let adaptiveQty: number | null = null;
      if (clrQtyStats && clrQtyStats.n > 0) {
        const cv = clrQtyStats.mean > 0 ? clrQtyStats.std / clrQtyStats.mean : 0;
        if (cv < 0.15)      adaptiveQty = clrQtyStats.p75;
        else if (cv < 0.30) adaptiveQty = clrQtyStats.p80;
        else                adaptiveQty = clrQtyStats.p90;
      }
      // Adaptive price = median of historically observed unit prices
      const adaptiveUnitPrice = priceStats ? priceStats.median : null;
      // Adaptive amount = adaptive qty × adaptive price
      const adaptiveAmount = adaptiveQty != null && adaptiveUnitPrice != null
        ? adaptiveQty * adaptiveUnitPrice : null;

      // ── LAYER 1: Original Standard Reference (denormalized) ───────────
      const stdKey = `${boqItemName.trim().toLowerCase()}|||${elementName.trim().toLowerCase()}`;
      const stdRef = standardMap.get(stdKey);
      const origStdQty   = stdRef ? parseNum(stdRef.standardQty)   : null;
      const origStdPrice = stdRef ? parseNum(stdRef.standardPrice)  : null;
      const origStdAmount = origStdQty != null && origStdPrice != null
        ? origStdQty * origStdPrice : null;

      // Correction ratio: adaptive ÷ original — tells how much standard needs adjusting
      const correctionRatio = adaptiveQty != null && origStdQty != null && origStdQty > 0
        ? adaptiveQty / origStdQty : null;

      // Efficiency rating (based on CV of consumption factor)
      let efficiencyRating = "غير محدد";
      if (cfStats && cfStats.mean > 0) {
        const cv = cfStats.std / cfStats.mean;
        if      (cv < 0.15) efficiencyRating = "ممتاز";
        else if (cv < 0.30) efficiencyRating = "جيد جداً";
        else if (cv < 0.50) efficiencyRating = "جيد";
        else if (cv < 0.80) efficiencyRating = "متوسط";
        else                efficiencyRating = "ضعيف";
      }

      const stabilityScore = cfStats && cfStats.std >= 0 && cfStats.mean > 0
        ? Math.max(0, 1 - cfStats.std / cfStats.mean) : null;

      const nFinal = cfStats ? cfStats.n : (clrQtyStats?.n ?? 0);
      const confidenceLevel = nFinal >= 10 ? "عالية" : nFinal >= 5 ? "متوسطة" : "منخفضة";

      results.push({
        boqItemName,
        elementName,
        elementCode,
        nProjects:            nFinal,
        nOutliers:            cfStats ? cfStats.nOutliers : 0,
        // CF stats
        meanCf:               cfStats ? cfStats.mean.toFixed(6)   : null,
        medianCf:             cfStats ? cfStats.median.toFixed(6) : null,
        stdCf:                cfStats ? cfStats.std.toFixed(6)    : null,
        p50Cf:                cfStats ? cfStats.p50.toFixed(6)    : null,
        p75Cf:                cfStats ? cfStats.p75.toFixed(6)    : null,
        p80Cf:                cfStats ? cfStats.p80.toFixed(6)    : null,
        p90Cf:                cfStats ? cfStats.p90.toFixed(6)    : null,
        minCf:                cfStats ? cfStats.min.toFixed(6)    : null,
        maxCf:                cfStats ? cfStats.max.toFixed(6)    : null,
        iqrCf:                cfStats ? cfStats.iqr.toFixed(6)    : null,
        // Over-alloc
        avgOverAllocPct:      overAllocStats ? overAllocStats.mean.toFixed(4)   : null,
        medianOverAllocPct:   overAllocStats ? overAllocStats.median.toFixed(4) : null,
        recommendedFactor:    cfStats ? cfStats.p80.toFixed(6) : null,
        // Cleared qty stats (Layer 2b)
        meanClearedQty:       clrQtyStats ? clrQtyStats.mean.toFixed(6)   : null,
        medianClearedQty:     clrQtyStats ? clrQtyStats.median.toFixed(6) : null,
        stdClearedQty:        clrQtyStats ? clrQtyStats.std.toFixed(6)    : null,
        p75ClearedQty:        clrQtyStats ? clrQtyStats.p75.toFixed(6)    : null,
        p80ClearedQty:        clrQtyStats ? clrQtyStats.p80.toFixed(6)    : null,
        p90ClearedQty:        clrQtyStats ? clrQtyStats.p90.toFixed(6)    : null,
        minClearedQty:        clrQtyStats ? clrQtyStats.min.toFixed(6)    : null,
        maxClearedQty:        clrQtyStats ? clrQtyStats.max.toFixed(6)    : null,
        // Actual price stats (Layer 2c)
        meanActualPrice:      priceStats ? priceStats.mean.toFixed(4)   : null,
        medianActualPrice:    priceStats ? priceStats.median.toFixed(4) : null,
        stdActualPrice:       priceStats ? priceStats.std.toFixed(4)    : null,
        p80ActualPrice:       priceStats ? priceStats.p80.toFixed(4)    : null,
        // Cleared amount stats (Layer 2d)
        medianClearedAmount:  amtStats ? amtStats.median.toFixed(2) : null,
        p80ClearedAmount:     amtStats ? amtStats.p80.toFixed(2)    : null,
        // Legacy
        avgAllocQty:          reqStats    ? reqStats.mean.toFixed(6)       : null,
        avgUsedQty:           clrQtyStats ? clrQtyStats.mean.toFixed(6)   : null,
        medianUsedQty:        clrQtyStats ? clrQtyStats.median.toFixed(6) : null,
        avgClearedAmount:     clearedAmounts.length > 0 ? mean(clearedAmounts).toFixed(2) : null,
        // Adaptive Layer 3
        adaptiveQty:          adaptiveQty      != null ? adaptiveQty.toFixed(6)      : null,
        adaptiveUnitPrice:    adaptiveUnitPrice != null ? adaptiveUnitPrice.toFixed(4) : null,
        adaptiveAmount:       adaptiveAmount    != null ? adaptiveAmount.toFixed(2)   : null,
        correctionRatio:      correctionRatio   != null ? correctionRatio.toFixed(6)  : null,
        // Layer 1 denormalized
        origStdQty:           origStdQty    != null ? origStdQty.toFixed(6)    : null,
        origStdPrice:         origStdPrice  != null ? origStdPrice.toFixed(4)  : null,
        origStdAmount:        origStdAmount != null ? origStdAmount.toFixed(2) : null,
        // Quality
        efficiencyRating,
        stabilityScore:       stabilityScore != null ? stabilityScore.toFixed(4) : null,
        confidenceLevel,
      });
    }

    if (results.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < results.length; i += CHUNK) {
        await db.insert(analyticsResultsTable)
          .values(results.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: [analyticsResultsTable.boqItemName, analyticsResultsTable.elementName],
            set: {
              elementCode:          sql`excluded.element_code`,
              nProjects:            sql`excluded.n_projects`,
              nOutliers:            sql`excluded.n_outliers`,
              meanCf:               sql`excluded.mean_cf`,
              medianCf:             sql`excluded.median_cf`,
              stdCf:                sql`excluded.std_cf`,
              p50Cf:                sql`excluded.p50_cf`,
              p75Cf:                sql`excluded.p75_cf`,
              p80Cf:                sql`excluded.p80_cf`,
              p90Cf:                sql`excluded.p90_cf`,
              minCf:                sql`excluded.min_cf`,
              maxCf:                sql`excluded.max_cf`,
              iqrCf:                sql`excluded.iqr_cf`,
              avgOverAllocPct:      sql`excluded.avg_over_alloc_pct`,
              medianOverAllocPct:   sql`excluded.median_over_alloc_pct`,
              recommendedFactor:    sql`excluded.recommended_factor`,
              meanClearedQty:       sql`excluded.mean_cleared_qty`,
              medianClearedQty:     sql`excluded.median_cleared_qty`,
              stdClearedQty:        sql`excluded.std_cleared_qty`,
              p75ClearedQty:        sql`excluded.p75_cleared_qty`,
              p80ClearedQty:        sql`excluded.p80_cleared_qty`,
              p90ClearedQty:        sql`excluded.p90_cleared_qty`,
              minClearedQty:        sql`excluded.min_cleared_qty`,
              maxClearedQty:        sql`excluded.max_cleared_qty`,
              meanActualPrice:      sql`excluded.mean_actual_price`,
              medianActualPrice:    sql`excluded.median_actual_price`,
              stdActualPrice:       sql`excluded.std_actual_price`,
              p80ActualPrice:       sql`excluded.p80_actual_price`,
              medianClearedAmount:  sql`excluded.median_cleared_amount`,
              p80ClearedAmount:     sql`excluded.p80_cleared_amount`,
              avgAllocQty:          sql`excluded.avg_alloc_qty`,
              avgUsedQty:           sql`excluded.avg_used_qty`,
              medianUsedQty:        sql`excluded.median_used_qty`,
              avgClearedAmount:     sql`excluded.avg_cleared_amount`,
              adaptiveQty:          sql`excluded.adaptive_qty`,
              adaptiveUnitPrice:    sql`excluded.adaptive_unit_price`,
              adaptiveAmount:       sql`excluded.adaptive_amount`,
              correctionRatio:      sql`excluded.correction_ratio`,
              origStdQty:           sql`excluded.orig_std_qty`,
              origStdPrice:         sql`excluded.orig_std_price`,
              origStdAmount:        sql`excluded.orig_std_amount`,
              efficiencyRating:     sql`excluded.efficiency_rating`,
              stabilityScore:       sql`excluded.stability_score`,
              confidenceLevel:      sql`excluded.confidence_level`,
              computedAt:           sql`now()`,
            },
          });
      }
    }

    res.json({ success: true, analyzedGroups: results.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Adaptive standards endpoint — returns full 3-layer data for every element
router.get("/adaptive-standards", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(analyticsResultsTable)
      .orderBy(analyticsResultsTable.boqItemName, analyticsResultsTable.elementName);
    res.json({ standards: rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [analyticsRows, batchRows] = await Promise.all([
      db.select().from(analyticsResultsTable),
      db.select().from(importBatchesTable),
    ]);

    const totalProjects = await db
      .select({ count: sql<number>`count(distinct project_id)` })
      .from(historicalUsageTable);
    const totalRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(historicalUsageTable);

    const effDist: Record<string, number> = {};
    let totalCf = 0, cfCount = 0;
    for (const r of analyticsRows) {
      const rating = r.efficiencyRating || "غير محدد";
      effDist[rating] = (effDist[rating] || 0) + 1;
      if (r.medianCf) { totalCf += parseFloat(r.medianCf); cfCount++; }
    }

    const worstOverAllocated = [...analyticsRows]
      .sort((a, b) => parseFloat(b.avgOverAllocPct || "0") - parseFloat(a.avgOverAllocPct || "0"))
      .slice(0, 10);
    const mostStable = [...analyticsRows]
      .filter(r => r.stabilityScore)
      .sort((a, b) => parseFloat(b.stabilityScore || "0") - parseFloat(a.stabilityScore || "0"))
      .slice(0, 10);
    const mostVolatile = [...analyticsRows]
      .filter(r => r.stdCf)
      .sort((a, b) => parseFloat(b.stdCf || "0") - parseFloat(a.stdCf || "0"))
      .slice(0, 10);

    res.json({
      kpis: {
        totalItemsAnalyzed: analyticsRows.length,
        totalProjects: Number(totalProjects[0]?.count ?? 0),
        totalRowsImported: Number(totalRows[0]?.count ?? 0),
        totalBatches: batchRows.length,
        overallMedianCf: cfCount > 0 ? (totalCf / cfCount).toFixed(4) : null,
        efficiencyDistribution: effDist,
      },
      insights: { worstOverAllocated, mostStable, mostVolatile },
      hasData: analyticsRows.length > 0,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/boq-items", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .selectDistinct({ boqItemName: analyticsResultsTable.boqItemName })
      .from(analyticsResultsTable)
      .orderBy(analyticsResultsTable.boqItemName);
    res.json({ items: rows.map(r => r.boqItemName) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/item-analytics", async (req: Request, res: Response) => {
  const itemName = req.query.item as string;
  if (!itemName) { res.status(400).json({ error: "اسم البند مطلوب" }); return; }
  try {
    const analytics = await db.select().from(analyticsResultsTable)
      .where(eq(analyticsResultsTable.boqItemName, itemName));

    const standard = await db.select().from(standardReferenceTable)
      .where(sql`LOWER(boq_item_name) = LOWER(${itemName})`);

    const merged = analytics.map(a => {
      const stdRef = standard.find(s => s.elementName.trim() === a.elementName.trim());
      const stdQty = stdRef ? parseFloat(stdRef.standardQty || "0") : null;
      const stdPrice = stdRef ? parseFloat(stdRef.standardPrice || "0") : null;
      const medianUsedQty = a.medianUsedQty ? parseFloat(a.medianUsedQty) : null;
      const p80Cf = a.p80Cf ? parseFloat(a.p80Cf) : null;
      const recommendedQty = stdQty && p80Cf ? stdQty * p80Cf : medianUsedQty;
      const recommendedAmount = recommendedQty && stdPrice ? recommendedQty * stdPrice : null;
      return { ...a, standardQty: stdQty, standardPrice: stdPrice, elementUnit: stdRef?.elementUnit || null, recommendedQty, recommendedAmount };
    });

    // Historical per-project data for this item
    const historical = await db.select({
      projectName: historicalUsageTable.projectName,
      elementName: historicalUsageTable.elementName,
      requestedQty: historicalUsageTable.requestedQty,
      clearedQty: historicalUsageTable.clearedQty,
      requestedAmount: historicalUsageTable.requestedAmount,
      clearedAmount: historicalUsageTable.clearedAmount,
    }).from(historicalUsageTable)
      .where(eq(historicalUsageTable.boqItemName, itemName))
      .limit(500);

    res.json({ analytics: merged, historical });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/analytics", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(analyticsResultsTable).orderBy(analyticsResultsTable.boqItemName);
    res.json({ analytics: rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
