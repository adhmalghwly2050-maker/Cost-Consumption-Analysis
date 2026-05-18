import { Router, type Request, type Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  historicalUsageTable,
  importBatchesTable,
  analyticsResultsTable,
  standardReferenceTable,
  recommendationWorkflowTable,
  standardVersionsTable,
} from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
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

// ── Confidence Score Engine (Module 2+3) ──────────────────────────────────────
function computeConfidenceScore(n: number, stabilityScore: number, cv: number): number {
  // Sample size component (0-40 points)
  const sampleScore = n >= 20 ? 40 : n >= 10 ? 30 : n >= 5 ? 20 : n >= 3 ? 10 : 5;
  // Stability component (0-40 points)
  const stabilityComponent = Math.round(stabilityScore * 40);
  // Volatility component (0-20 points) — inverse of CV
  const volatilityComponent = cv < 0.15 ? 20 : cv < 0.30 ? 15 : cv < 0.50 ? 10 : cv < 0.80 ? 5 : 0;
  return Math.min(100, sampleScore + stabilityComponent + volatilityComponent);
}

function getVolatilityLevel(cv: number): string {
  if (cv < 0.15) return "مستقر جداً";
  if (cv < 0.30) return "مستقر";
  if (cv < 0.50) return "متذبذب";
  if (cv < 0.80) return "متذبذب جداً";
  return "غير مستقر";
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

const COL = {
  projectId:       0,
  projectName:     2,
  projectType:     4,
  projectStatus:   6,
  boqItemCode:    14,
  boqItemName:    18,
  elementCodeBoq: 20,
  elementNameBoq: 22,
  branch:         24,
  unit:           26,
  qty:            28,
  unitPrice:      30,
  totalValue:     32,
  totalRequests:  34,
  totalCleared:   36,
  elementCode:    50,
  elementName:    52,
  requestedQty:   54,
  requestedAmount:56,
  clearedQty:     58,
  clearedAmount:  60,
} as const;

function detectColumns(headerRow: unknown[]): typeof COL {
  const h = (i: number) => String(headerRow[i] ?? "").trim();
  const looksLikeKnownFormat =
    h(COL.projectId).includes("رقم المشروع") &&
    h(COL.elementName).includes("اسم الصنف");
  if (looksLikeKnownFormat) return COL;
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
        // CRITICAL FIX: empty cleared cells treated as 0 (not null)
        clearedQty:      String(parseNum(row[C.clearedQty]) ?? 0),
        clearedAmount:   String(parseNum(row[C.clearedAmount]) ?? 0),
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

// ── MODULE 1: Project Context Classification ──────────────────────────────────
router.get("/project-context", async (req: Request, res: Response) => {
  try {
    const { projectType, branch } = req.query as Record<string, string>;

    const [projectTypes, branches, statuses] = await Promise.all([
      db.selectDistinct({ val: historicalUsageTable.projectType })
        .from(historicalUsageTable)
        .where(sql`project_type IS NOT NULL AND project_type != ''`),
      db.selectDistinct({ val: historicalUsageTable.branch })
        .from(historicalUsageTable)
        .where(sql`branch IS NOT NULL AND branch != ''`),
      db.selectDistinct({ val: historicalUsageTable.projectStatus })
        .from(historicalUsageTable)
        .where(sql`project_status IS NOT NULL AND project_status != ''`),
    ]);

    // Build where conditions for filtered analytics
    const conditions = [];
    if (projectType && projectType !== "الكل") conditions.push(eq(historicalUsageTable.projectType, projectType));
    if (branch && branch !== "الكل") conditions.push(eq(historicalUsageTable.branch, branch));

    const filteredRows = conditions.length > 0
      ? await db.select().from(historicalUsageTable).where(and(...conditions))
      : await db.select().from(historicalUsageTable);

    // Count distinct projects per classification
    const projectGroups: Record<string, { count: number; elements: Set<string> }> = {};
    for (const row of filteredRows) {
      const key = row.projectType || "غير محدد";
      if (!projectGroups[key]) projectGroups[key] = { count: 0, elements: new Set() };
      if (row.projectId) projectGroups[key].count++;
      if (row.elementName) projectGroups[key].elements.add(row.elementName);
    }

    const summary = Object.entries(projectGroups).map(([type, data]) => ({
      projectType: type,
      projectCount: new Set(filteredRows.filter(r => (r.projectType || "غير محدد") === type).map(r => r.projectId)).size,
      recordCount: filteredRows.filter(r => (r.projectType || "غير محدد") === type).length,
      elementCount: data.elements.size,
    }));

    res.json({
      filters: {
        projectTypes: projectTypes.map(r => r.val).filter(Boolean),
        branches: branches.map(r => r.val).filter(Boolean),
        statuses: statuses.map(r => r.val).filter(Boolean),
      },
      summary,
      totalRecords: filteredRows.length,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/run-analytics", async (req: Request, res: Response) => {
  try {
    const { projectType, branch } = req.body as { projectType?: string; branch?: string };

    const [allStandard] = await Promise.all([
      db.select().from(standardReferenceTable),
    ]);

    // Apply context filter if provided
    const conditions = [];
    if (projectType && projectType !== "الكل") conditions.push(eq(historicalUsageTable.projectType, projectType));
    if (branch && branch !== "الكل") conditions.push(eq(historicalUsageTable.branch, branch));

    const allRows = conditions.length > 0
      ? await db.select().from(historicalUsageTable).where(and(...conditions))
      : await db.select().from(historicalUsageTable);

    if (allRows.length === 0) {
      res.status(400).json({ error: "لا توجد بيانات تاريخية. يرجى رفع ملف Excel أولاً." });
      return;
    }

    const standardMap = new Map<string, typeof allStandard[0]>();
    for (const s of allStandard) {
      standardMap.set(`${s.boqItemName.trim().toLowerCase()}|||${s.elementName.trim().toLowerCase()}`, s);
    }

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

      // CRITICAL FIX: treat null clearedQty as 0 per business rules
      const cfs: number[] = [];
      for (const row of rows) {
        const req = parseNum(row.requestedQty);
        const clr = parseNum(row.clearedQty) ?? 0;  // null → 0
        if (req && req > 0) cfs.push(clr / req);
      }
      const cfStats = cfs.length > 0 ? computeStats(cfs) : null;

      const normClearedQtys:   number[] = [];
      const normRequestedQtys: number[] = [];
      const normClearedAmounts: number[] = [];
      const actualPrices:       number[] = [];
      const overAllocPcts:      number[] = [];

      for (const row of rows) {
        const boqQty  = parseNum(row.qty);
        const clr     = parseNum(row.clearedQty) ?? 0;   // null → 0
        const req     = parseNum(row.requestedQty);
        const clrAmt  = parseNum(row.clearedAmount) ?? 0; // null → 0

        if (boqQty && boqQty > 0) {
          normClearedQtys.push(clr / boqQty);
          if (req !== null && req > 0) normRequestedQtys.push(req / boqQty);
          if (clrAmt > 0) normClearedAmounts.push(clrAmt / boqQty);
        }
        if (clrAmt > 0 && clr > 0) actualPrices.push(clrAmt / clr);
        if (req && req > 0) overAllocPcts.push(((req - clr) / Math.max(clr, 0.0001)) * 100);
      }

      const clrQtyStats  = normClearedQtys.length   > 0 ? computeStats(normClearedQtys)   : null;
      const reqQtyStats  = normRequestedQtys.length  > 0 ? computeStats(normRequestedQtys)  : null;
      const priceStats   = actualPrices.length        > 0 ? computeStats(actualPrices)        : null;
      const amtStats     = normClearedAmounts.length  > 0 ? computeStats(normClearedAmounts)  : null;
      const overAllocStats = overAllocPcts.length     > 0 ? computeStats(overAllocPcts)        : null;

      if (normClearedQtys.length === 0 && cfs.length === 0) continue;

      // ── LAYER 3: Adaptive Recommended Standard ────────────────────────────
      let adaptiveQty: number | null = null;
      let cv = 0;
      if (clrQtyStats && clrQtyStats.n > 0) {
        cv = clrQtyStats.mean > 0 ? clrQtyStats.std / clrQtyStats.mean : 0;
        if      (cv < 0.15) adaptiveQty = clrQtyStats.p75;
        else if (cv < 0.30) adaptiveQty = clrQtyStats.p80;
        else                adaptiveQty = clrQtyStats.p90;
      }

      const adaptiveUnitPrice = priceStats ? priceStats.median : null;
      const adaptiveAmount = adaptiveQty != null && adaptiveUnitPrice != null
        ? adaptiveQty * adaptiveUnitPrice : null;

      const stdKey = `${boqItemName.trim().toLowerCase()}|||${elementName.trim().toLowerCase()}`;
      const stdRef = standardMap.get(stdKey);
      const origStdQty    = stdRef ? parseNum(stdRef.standardQty)   : null;
      const origStdPrice  = stdRef ? parseNum(stdRef.standardPrice)  : null;
      const origStdAmount = origStdQty != null && origStdPrice != null
        ? origStdQty * origStdPrice : null;

      const correctionRatio = adaptiveQty != null && origStdQty != null && origStdQty > 0
        ? adaptiveQty / origStdQty : null;

      const medNormClr = clrQtyStats ? clrQtyStats.median : null;
      const stdOverAllocPct = origStdQty != null && medNormClr != null && medNormClr > 0
        ? ((origStdQty - medNormClr) / medNormClr) * 100 : null;

      let efficiencyRating = "غير محدد";
      if (cfStats && cfStats.mean > 0) {
        const cvCf = cfStats.std / cfStats.mean;
        if      (cvCf < 0.15) efficiencyRating = "ممتاز";
        else if (cvCf < 0.30) efficiencyRating = "جيد جداً";
        else if (cvCf < 0.50) efficiencyRating = "جيد";
        else if (cvCf < 0.80) efficiencyRating = "متوسط";
        else                  efficiencyRating = "ضعيف";
      }

      const stabilityScore = cfStats && cfStats.std >= 0 && cfStats.mean > 0
        ? Math.max(0, 1 - cfStats.std / cfStats.mean) : null;

      const nFinal = cfStats ? cfStats.n : (clrQtyStats?.n ?? 0);
      const confidenceLevel = nFinal >= 10 ? "عالية" : nFinal >= 5 ? "متوسطة" : "منخفضة";

      // ── MODULE 2+3: Enhanced Confidence & Stability ───────────────────────
      const stab = stabilityScore ?? 0;
      const cvFinal = cfStats && cfStats.mean > 0 ? cfStats.std / cfStats.mean : cv;
      const confidenceScore = computeConfidenceScore(nFinal, stab, cvFinal);
      const volatilityLevel = getVolatilityLevel(cvFinal);

      // Percentile spread (P90 - P10) / median as normalized volatility indicator
      const p10Cf = cfStats ? percentile([...cfs].sort((a,b)=>a-b), 10) : 0;
      const p90Cf = cfStats ? percentile([...cfs].sort((a,b)=>a-b), 90) : 0;
      const percentileSpread = cfStats && cfStats.median > 0
        ? (p90Cf - p10Cf) / cfStats.median : null;

      results.push({
        boqItemName,
        elementName,
        elementCode,
        nProjects:            nFinal,
        nOutliers:            cfStats ? cfStats.nOutliers : 0,
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
        avgOverAllocPct:      overAllocStats ? overAllocStats.mean.toFixed(4)   : null,
        medianOverAllocPct:   overAllocStats ? overAllocStats.median.toFixed(4) : null,
        recommendedFactor:    cfStats ? cfStats.p80.toFixed(6) : null,
        meanClearedQty:       clrQtyStats ? clrQtyStats.mean.toFixed(6)   : null,
        medianClearedQty:     clrQtyStats ? clrQtyStats.median.toFixed(6) : null,
        stdClearedQty:        clrQtyStats ? clrQtyStats.std.toFixed(6)    : null,
        p75ClearedQty:        clrQtyStats ? clrQtyStats.p75.toFixed(6)    : null,
        p80ClearedQty:        clrQtyStats ? clrQtyStats.p80.toFixed(6)    : null,
        p90ClearedQty:        clrQtyStats ? clrQtyStats.p90.toFixed(6)    : null,
        minClearedQty:        clrQtyStats ? clrQtyStats.min.toFixed(6)    : null,
        maxClearedQty:        clrQtyStats ? clrQtyStats.max.toFixed(6)    : null,
        meanActualPrice:      priceStats ? priceStats.mean.toFixed(4)   : null,
        medianActualPrice:    priceStats ? priceStats.median.toFixed(4) : null,
        stdActualPrice:       priceStats ? priceStats.std.toFixed(4)    : null,
        p80ActualPrice:       priceStats ? priceStats.p80.toFixed(4)    : null,
        medianClearedAmount:  amtStats ? amtStats.median.toFixed(2) : null,
        p80ClearedAmount:     amtStats ? amtStats.p80.toFixed(2)    : null,
        avgAllocQty:          reqQtyStats ? reqQtyStats.mean.toFixed(6)   : null,
        avgUsedQty:           clrQtyStats ? clrQtyStats.mean.toFixed(6)   : null,
        medianUsedQty:        clrQtyStats ? clrQtyStats.median.toFixed(6) : null,
        avgClearedAmount:     amtStats    ? amtStats.mean.toFixed(2)       : null,
        adaptiveQty:          adaptiveQty       != null ? adaptiveQty.toFixed(6)       : null,
        adaptiveUnitPrice:    adaptiveUnitPrice  != null ? adaptiveUnitPrice.toFixed(4)  : null,
        adaptiveAmount:       adaptiveAmount     != null ? adaptiveAmount.toFixed(2)    : null,
        correctionRatio:      correctionRatio    != null ? correctionRatio.toFixed(6)   : null,
        origStdQty:           origStdQty    != null ? origStdQty.toFixed(6)    : null,
        origStdPrice:         origStdPrice  != null ? origStdPrice.toFixed(4)  : null,
        origStdAmount:        origStdAmount != null ? origStdAmount.toFixed(2) : null,
        efficiencyRating,
        stabilityScore:           stabilityScore  != null ? stabilityScore.toFixed(4)  : null,
        confidenceLevel,
        confidenceScore:          confidenceScore.toFixed(4),
        volatilityLevel,
        coefficientOfVariation:   cvFinal.toFixed(4),
        percentileSpread:         percentileSpread != null ? percentileSpread.toFixed(4) : null,
        stdOverAllocPct:      stdOverAllocPct != null ? stdOverAllocPct.toFixed(4) : null,
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
              elementCode:              sql`excluded.element_code`,
              nProjects:                sql`excluded.n_projects`,
              nOutliers:                sql`excluded.n_outliers`,
              meanCf:                   sql`excluded.mean_cf`,
              medianCf:                 sql`excluded.median_cf`,
              stdCf:                    sql`excluded.std_cf`,
              p50Cf:                    sql`excluded.p50_cf`,
              p75Cf:                    sql`excluded.p75_cf`,
              p80Cf:                    sql`excluded.p80_cf`,
              p90Cf:                    sql`excluded.p90_cf`,
              minCf:                    sql`excluded.min_cf`,
              maxCf:                    sql`excluded.max_cf`,
              iqrCf:                    sql`excluded.iqr_cf`,
              avgOverAllocPct:          sql`excluded.avg_over_alloc_pct`,
              medianOverAllocPct:       sql`excluded.median_over_alloc_pct`,
              recommendedFactor:        sql`excluded.recommended_factor`,
              meanClearedQty:           sql`excluded.mean_cleared_qty`,
              medianClearedQty:         sql`excluded.median_cleared_qty`,
              stdClearedQty:            sql`excluded.std_cleared_qty`,
              p75ClearedQty:            sql`excluded.p75_cleared_qty`,
              p80ClearedQty:            sql`excluded.p80_cleared_qty`,
              p90ClearedQty:            sql`excluded.p90_cleared_qty`,
              minClearedQty:            sql`excluded.min_cleared_qty`,
              maxClearedQty:            sql`excluded.max_cleared_qty`,
              meanActualPrice:          sql`excluded.mean_actual_price`,
              medianActualPrice:        sql`excluded.median_actual_price`,
              stdActualPrice:           sql`excluded.std_actual_price`,
              p80ActualPrice:           sql`excluded.p80_actual_price`,
              medianClearedAmount:      sql`excluded.median_cleared_amount`,
              p80ClearedAmount:         sql`excluded.p80_cleared_amount`,
              avgAllocQty:              sql`excluded.avg_alloc_qty`,
              avgUsedQty:               sql`excluded.avg_used_qty`,
              medianUsedQty:            sql`excluded.median_used_qty`,
              avgClearedAmount:         sql`excluded.avg_cleared_amount`,
              adaptiveQty:              sql`excluded.adaptive_qty`,
              adaptiveUnitPrice:        sql`excluded.adaptive_unit_price`,
              adaptiveAmount:           sql`excluded.adaptive_amount`,
              correctionRatio:          sql`excluded.correction_ratio`,
              origStdQty:               sql`excluded.orig_std_qty`,
              origStdPrice:             sql`excluded.orig_std_price`,
              origStdAmount:            sql`excluded.orig_std_amount`,
              efficiencyRating:         sql`excluded.efficiency_rating`,
              stabilityScore:           sql`excluded.stability_score`,
              confidenceLevel:          sql`excluded.confidence_level`,
              confidenceScore:          sql`excluded.confidence_score`,
              volatilityLevel:          sql`excluded.volatility_level`,
              coefficientOfVariation:   sql`excluded.coefficient_of_variation`,
              percentileSpread:         sql`excluded.percentile_spread`,
              stdOverAllocPct:          sql`excluded.std_over_alloc_pct`,
              computedAt:               sql`now()`,
            },
          });
      }
    }

    res.json({ success: true, analyzedGroups: results.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

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

// ── MODULE 5+6: Recommendation Workflow ──────────────────────────────────────
router.post("/workflow/generate", async (_req: Request, res: Response) => {
  try {
    const analytics = await db.select().from(analyticsResultsTable);
    let generated = 0;
    for (const a of analytics) {
      if (!a.adaptiveQty) continue;
      const existing = await db.select().from(recommendationWorkflowTable)
        .where(and(
          eq(recommendationWorkflowTable.boqItemName, a.boqItemName),
          eq(recommendationWorkflowTable.elementName, a.elementName),
          eq(recommendationWorkflowTable.isLatest, true),
        ));
      if (existing.length > 0) continue;
      await db.insert(recommendationWorkflowTable).values({
        boqItemName: a.boqItemName,
        elementName: a.elementName,
        recommendedQty: a.adaptiveQty,
        recommendedPrice: a.adaptiveUnitPrice,
        recommendedAmount: a.adaptiveAmount,
        previousQty: a.origStdQty,
        previousPrice: a.origStdPrice,
        previousAmount: a.origStdAmount,
        nProjects: a.nProjects,
        confidenceScore: a.confidenceScore,
        stabilityScore: a.stabilityScore,
        volatilityLevel: a.volatilityLevel,
        status: "مسودة",
        isLatest: true,
        version: 1,
      });
      generated++;
    }
    res.json({ success: true, generated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/workflow", async (req: Request, res: Response) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = status && status !== "الكل"
      ? await db.select().from(recommendationWorkflowTable)
          .where(eq(recommendationWorkflowTable.status, status))
          .orderBy(desc(recommendationWorkflowTable.generatedAt))
      : await db.select().from(recommendationWorkflowTable)
          .orderBy(desc(recommendationWorkflowTable.generatedAt));
    res.json({ recommendations: rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/workflow/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { action, comment, approvedBy, overrideQty, overridePrice, overrideAmount, overrideJustification, rejectionReason } = req.body as {
      action: "approve" | "reject" | "review" | "apply" | "override";
      comment?: string;
      approvedBy?: string;
      overrideQty?: string;
      overridePrice?: string;
      overrideAmount?: string;
      overrideJustification?: string;
      rejectionReason?: string;
    };

    const existing = await db.select().from(recommendationWorkflowTable)
      .where(eq(recommendationWorkflowTable.id, id));
    if (!existing.length) { res.status(404).json({ error: "التوصية غير موجودة" }); return; }
    const rec = existing[0];

    const updates: Record<string, unknown> = {};

    if (action === "review") {
      updates.status = "قيد المراجعة";
      if (comment) updates.reviewerComment = comment;
    } else if (action === "approve") {
      updates.status = "معتمد";
      updates.approvedBy = approvedBy || "المستخدم";
      updates.approvedAt = new Date();
      if (comment) updates.reviewerComment = comment;
    } else if (action === "reject") {
      updates.status = "مرفوض";
      updates.rejectedBy = approvedBy || "المستخدم";
      updates.rejectedAt = new Date();
      updates.rejectionReason = rejectionReason || comment || "";
    } else if (action === "apply") {
      updates.status = "مُطبَّق";
      updates.appliedAt = new Date();
      // Create version record
      const finalQty = rec.overrideQty || rec.recommendedQty;
      const finalPrice = rec.overridePrice || rec.recommendedPrice;
      const finalAmount = rec.overrideAmount || rec.recommendedAmount;
      await db.insert(standardVersionsTable).values({
        boqItemName: rec.boqItemName,
        elementName: rec.elementName,
        version: rec.version,
        stdQty: finalQty,
        stdPrice: finalPrice,
        stdAmount: finalAmount,
        changeReason: rec.overrideJustification || "توصية تكيفية مبنية على البيانات التاريخية",
        changeType: rec.overrideQty ? "تجاوز هندسي" : "تكيف تلقائي",
        historicalEvidence: `مبني على ${rec.nProjects ?? 0} مشروع تاريخي، درجة الثقة: ${rec.confidenceScore ?? "—"}`,
        nProjectsAtChange: rec.nProjects,
        approvedBy: rec.approvedBy || "النظام",
        workflowId: rec.id,
      });
    } else if (action === "override") {
      updates.overrideQty = overrideQty || null;
      updates.overridePrice = overridePrice || null;
      updates.overrideAmount = overrideAmount || null;
      updates.overrideJustification = overrideJustification || "";
    }

    await db.update(recommendationWorkflowTable)
      .set(updates as Parameters<typeof db.update>[0])
      .where(eq(recommendationWorkflowTable.id, id));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── MODULE 7: Standard Version History ───────────────────────────────────────
router.get("/standard-versions", async (_req: Request, res: Response) => {
  try {
    const versions = await db.select().from(standardVersionsTable)
      .orderBy(desc(standardVersionsTable.effectiveDate));
    res.json({ versions });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── MODULE 8: Advanced Reports ────────────────────────────────────────────────
router.get("/reports/stability", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(analyticsResultsTable)
      .where(sql`stability_score IS NOT NULL`)
      .orderBy(desc(analyticsResultsTable.stabilityScore));
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/reports/volatility", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(analyticsResultsTable)
      .where(sql`std_cf IS NOT NULL`)
      .orderBy(desc(analyticsResultsTable.coefficientOfVariation));
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/reports/evolution", async (_req: Request, res: Response) => {
  try {
    const [versions, workflow] = await Promise.all([
      db.select().from(standardVersionsTable).orderBy(desc(standardVersionsTable.effectiveDate)),
      db.select().from(recommendationWorkflowTable)
        .where(sql`status IN ('معتمد','مُطبَّق')`)
        .orderBy(desc(recommendationWorkflowTable.approvedAt)),
    ]);
    res.json({ versions, approvedWorkflow: workflow });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
