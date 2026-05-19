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
  elementRolesTable,
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
          if (clr > 0) normClearedQtys.push(clr / boqQty);
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

      // ── MODULE 2-4: Execution Mode Detection ─────────────────────────────
      const zeroCleared = rows.filter(r => (parseNum(r.clearedQty) ?? 0) === 0).length;
      const pctZeroCleared = rows.length > 0 ? zeroCleared / rows.length : 0;
      const avgCfVal = cfStats ? cfStats.mean : 0;
      let executionMode = "غير محدد";
      if (pctZeroCleared > 0.80) {
        executionMode = "مالي فقط";        // Requested but almost never cleared → financial allocation
      } else if (avgCfVal < 0.05) {
        executionMode = "مشبوه";           // Extremely low clearance → suspicious data
      } else if (avgCfVal > 0.75 && cvFinal < 0.25) {
        executionMode = "تنفيذ مباشر";     // High clearance + low variance → direct execution
      } else if (cvFinal > 0.70) {
        executionMode = "مختلط";           // High variance → mixed execution modes
      } else if (pctZeroCleared > 0.40) {
        executionMode = "مقاول جزئي";      // Frequent zero clearance → contractor-style
      } else {
        executionMode = "تنفيذ جزئي";      // Moderate clearance → partial execution
      }
      const executionCompletenessScore = (1 - pctZeroCleared).toFixed(4);

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
        executionMode,
        executionCompletenessScore,
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
              executionMode:            sql`excluded.execution_mode`,
              executionCompletenessScore: sql`excluded.execution_completeness_score`,
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

// ── MODULE 1: Element Role Classification ────────────────────────────────────
router.get("/element-roles", async (_req: Request, res: Response) => {
  try {
    const roles = await db.select().from(elementRolesTable)
      .orderBy(elementRolesTable.boqItemName, elementRolesTable.elementName);
    res.json({ roles });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/element-roles/boq-items", async (_req: Request, res: Response) => {
  try {
    const [fromAnalytics, fromRoles] = await Promise.all([
      db.selectDistinct({ name: analyticsResultsTable.boqItemName }).from(analyticsResultsTable),
      db.selectDistinct({ name: elementRolesTable.boqItemName }).from(elementRolesTable),
    ]);
    const names = Array.from(new Set([
      ...fromAnalytics.map(r => r.name),
      ...fromRoles.map(r => r.name),
    ])).sort();
    res.json({ items: names });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/element-roles", async (req: Request, res: Response) => {
  try {
    const { boqItemName, elementName, roleType, description } = req.body as {
      boqItemName: string; elementName: string; roleType: string; description?: string;
    };
    if (!boqItemName || !elementName || !roleType) {
      res.status(400).json({ error: "boqItemName, elementName, roleType مطلوبة" }); return;
    }
    const [row] = await db.insert(elementRolesTable)
      .values({ boqItemName, elementName, roleType, description: description || null })
      .onConflictDoUpdate({
        target: [elementRolesTable.boqItemName, elementRolesTable.elementName],
        set: { roleType, description: description || null },
      })
      .returning();
    res.json({ success: true, role: row });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/element-roles/bulk", async (req: Request, res: Response) => {
  try {
    const { roles } = req.body as { roles: Array<{ boqItemName: string; elementName: string; roleType: string; description?: string }> };
    if (!Array.isArray(roles) || roles.length === 0) {
      res.status(400).json({ error: "يجب إرسال مصفوفة من الأدوار" }); return;
    }
    let saved = 0;
    for (const r of roles) {
      if (!r.boqItemName || !r.elementName || !r.roleType) continue;
      await db.insert(elementRolesTable)
        .values({ boqItemName: r.boqItemName, elementName: r.elementName, roleType: r.roleType, description: r.description || null })
        .onConflictDoUpdate({
          target: [elementRolesTable.boqItemName, elementRolesTable.elementName],
          set: { roleType: r.roleType, description: r.description || null },
        });
      saved++;
    }
    res.json({ success: true, saved });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete("/element-roles/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(elementRolesTable).where(eq(elementRolesTable.id, id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── MODULE 17: Evidence Viewer ────────────────────────────────────────────────
router.get("/evidence", async (req: Request, res: Response) => {
  try {
    const { boqItemName, elementName } = req.query as { boqItemName: string; elementName: string };
    if (!boqItemName || !elementName) {
      res.status(400).json({ error: "boqItemName و elementName مطلوبان" }); return;
    }
    const rows = await db.select({
      projectId: historicalUsageTable.projectId,
      projectName: historicalUsageTable.projectName,
      projectType: historicalUsageTable.projectType,
      projectStatus: historicalUsageTable.projectStatus,
      branch: historicalUsageTable.branch,
      qty: historicalUsageTable.qty,
      requestedQty: historicalUsageTable.requestedQty,
      requestedAmount: historicalUsageTable.requestedAmount,
      clearedQty: historicalUsageTable.clearedQty,
      clearedAmount: historicalUsageTable.clearedAmount,
    }).from(historicalUsageTable)
      .where(and(
        eq(historicalUsageTable.boqItemName, boqItemName),
        eq(historicalUsageTable.elementName, elementName),
      ))
      .limit(200);

    // Calculate clearance factor per row
    const withCf = rows.map(r => {
      const reqQty = parseNum(r.requestedQty) ?? 0;
      const clrQty = parseNum(r.clearedQty) ?? 0;
      const cf = reqQty > 0 ? clrQty / reqQty : null;
      return { ...r, clearanceFactor: cf != null ? cf.toFixed(4) : null };
    });

    // Summary stats
    const cfs = withCf.filter(r => r.clearanceFactor != null).map(r => parseFloat(r.clearanceFactor!));
    const avgCf = cfs.length > 0 ? (cfs.reduce((a, b) => a + b, 0) / cfs.length).toFixed(4) : null;
    const zeroCount = withCf.filter(r => (parseNum(r.clearedQty) ?? 0) === 0).length;

    res.json({
      rows: withCf,
      summary: {
        totalProjects: withCf.length,
        avgClearanceFactor: avgCf,
        zeroCleared: zeroCount,
        pctZeroCleared: withCf.length > 0 ? ((zeroCount / withCf.length) * 100).toFixed(1) : "0",
      }
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── MODULE 18: Report — Unexecuted / Zero-Clearance Items ────────────────────
router.get("/reports/unexecuted", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select({
      boqItemName: historicalUsageTable.boqItemName,
      elementName: historicalUsageTable.elementName,
      projectName: historicalUsageTable.projectName,
      projectType: historicalUsageTable.projectType,
      requestedQty: historicalUsageTable.requestedQty,
      clearedQty: historicalUsageTable.clearedQty,
      requestedAmount: historicalUsageTable.requestedAmount,
    }).from(historicalUsageTable)
      .where(sql`requested_qty IS NOT NULL AND requested_qty::numeric > 0`);

    // Group by boqItemName + elementName, count zero-cleared vs total
    const groups: Record<string, {
      boqItemName: string; elementName: string;
      total: number; zeroCleared: number;
      avgRequestedQty: number; totalRequestedAmount: number;
      projects: Set<string>;
    }> = {};

    for (const r of rows) {
      if (!r.boqItemName || !r.elementName) continue;
      const key = `${r.boqItemName}|||${r.elementName}`;
      if (!groups[key]) {
        groups[key] = { boqItemName: r.boqItemName, elementName: r.elementName, total: 0, zeroCleared: 0, avgRequestedQty: 0, totalRequestedAmount: 0, projects: new Set() };
      }
      groups[key].total++;
      if ((parseNum(r.clearedQty) ?? 0) === 0) groups[key].zeroCleared++;
      groups[key].avgRequestedQty += parseNum(r.requestedQty) ?? 0;
      groups[key].totalRequestedAmount += parseNum(r.requestedAmount) ?? 0;
      if (r.projectName) groups[key].projects.add(r.projectName);
    }

    const unexecuted = Object.values(groups)
      .filter(g => g.total > 0 && g.zeroCleared / g.total > 0.60)
      .map(g => ({
        boqItemName: g.boqItemName,
        elementName: g.elementName,
        totalRecords: g.total,
        zeroCleared: g.zeroCleared,
        pctUnexecuted: ((g.zeroCleared / g.total) * 100).toFixed(1),
        avgRequestedQty: g.total > 0 ? (g.avgRequestedQty / g.total).toFixed(4) : null,
        totalRequestedAmount: g.totalRequestedAmount.toFixed(2),
        projectCount: g.projects.size,
      }))
      .sort((a, b) => parseFloat(b.pctUnexecuted) - parseFloat(a.pctUnexecuted));

    res.json({ rows: unexecuted, totalUnexecuted: unexecuted.length });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── MODULE 19: Item Comparison ───────────────────────────────────────────────
router.get("/item-comparison", async (req: Request, res: Response) => {
  const itemName = req.query.item as string;
  if (!itemName) { res.status(400).json({ error: "اسم البند مطلوب" }); return; }
  try {
    const [standard, historical] = await Promise.all([
      db.select().from(standardReferenceTable)
        .where(sql`LOWER(boq_item_name) = LOWER(${itemName})`),
      db.select().from(historicalUsageTable)
        .where(eq(historicalUsageTable.boqItemName, itemName)),
    ]);

    type ElGroup = {
      totalRequestedQty: number; totalRequestedAmount: number;
      totalClearedQty: number; totalClearedAmount: number;
      nProjects: number; nCleared: number;
      normReqQtys: number[]; normClrQtys: number[];
    };
    const elementGroups: Record<string, ElGroup> = {};

    for (const row of historical) {
      if (!row.elementName) continue;
      const el = row.elementName;
      if (!elementGroups[el]) {
        elementGroups[el] = {
          totalRequestedQty: 0, totalRequestedAmount: 0,
          totalClearedQty: 0, totalClearedAmount: 0,
          nProjects: 0, nCleared: 0, normReqQtys: [], normClrQtys: [],
        };
      }
      const g = elementGroups[el];
      const boqQty = parseNum(row.qty) ?? 0;
      const reqQty = parseNum(row.requestedQty) ?? 0;
      const reqAmt = parseNum(row.requestedAmount) ?? 0;
      const clrQty = parseNum(row.clearedQty) ?? 0;
      const clrAmt = parseNum(row.clearedAmount) ?? 0;
      g.totalRequestedQty += reqQty;
      g.totalRequestedAmount += reqAmt;
      g.totalClearedQty += clrQty;
      g.totalClearedAmount += clrAmt;
      g.nProjects++;
      if (clrQty > 0) g.nCleared++;
      if (boqQty > 0) {
        if (reqQty > 0) g.normReqQtys.push(reqQty / boqQty);
        if (clrQty > 0) g.normClrQtys.push(clrQty / boqQty);
      }
    }

    const allElements = Array.from(new Set([
      ...standard.map(s => s.elementName),
      ...Object.keys(elementGroups),
    ]));

    const elements = allElements.map(elName => {
      const stdRef = standard.find(s => s.elementName.trim().toLowerCase() === elName.trim().toLowerCase());
      const g = elementGroups[elName];
      const stdQty = stdRef ? parseNum(stdRef.standardQty) : null;
      const stdPrice = stdRef ? parseNum(stdRef.standardPrice) : null;
      const stdAmount = stdQty != null && stdPrice != null ? stdQty * stdPrice : null;

      const sortedReq = [...(g?.normReqQtys ?? [])].sort((a, b) => a - b);
      const sortedClr = [...(g?.normClrQtys ?? [])].sort((a, b) => a - b);
      const medianReqQty = sortedReq.length > 0 ? percentile(sortedReq, 50) : null;
      const medianClrQty = sortedClr.length > 0 ? percentile(sortedClr, 50) : null;

      return {
        elementName: elName,
        elementUnit: stdRef?.elementUnit || null,
        hasStandard: !!stdRef,
        stdQty: stdQty != null ? stdQty.toFixed(4) : null,
        stdPrice: stdPrice != null ? stdPrice.toFixed(2) : null,
        stdAmount: stdAmount != null ? stdAmount.toFixed(2) : null,
        medianReqQty: medianReqQty != null ? medianReqQty.toFixed(4) : null,
        totalReqQty: g ? g.totalRequestedQty.toFixed(4) : null,
        totalReqAmount: g ? g.totalRequestedAmount.toFixed(2) : null,
        medianClrQty: medianClrQty != null ? medianClrQty.toFixed(4) : null,
        totalClrQty: g ? g.totalClearedQty.toFixed(4) : null,
        totalClrAmount: g ? g.totalClearedAmount.toFixed(2) : null,
        nProjects: g ? g.nProjects : 0,
        nCleared: g ? g.nCleared : 0,
      };
    });

    const boqUnit = standard[0]?.boqUnit || historical[0]?.unit || null;
    res.json({ elements, itemName, boqUnit });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── MODULE 19b: BOQ items list (all historical items) ────────────────────────
router.get("/boq-items-all", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .selectDistinct({ boqItemName: historicalUsageTable.boqItemName })
      .from(historicalUsageTable)
      .where(sql`boq_item_name IS NOT NULL AND boq_item_name != ''`)
      .orderBy(historicalUsageTable.boqItemName);
    res.json({ items: rows.map(r => r.boqItemName).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── FEATURE: Auto-import from master_dataset.csv ─────────────────────────────
router.post("/import-from-csv", async (_req: Request, res: Response) => {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const readline = await import("readline");

    const csvPath = path.resolve(process.cwd(), "..", "..", "outputs", "boq_analysis", "master_dataset.csv");
    if (!fs.existsSync(csvPath)) {
      res.status(404).json({ error: "ملف master_dataset.csv غير موجود. شغّل التحليل أولاً." });
      return;
    }

    // Clear existing data
    await db.delete(historicalUsageTable);
    await db.delete(importBatchesTable);

    const [batch] = await db.insert(importBatchesTable)
      .values({ filename: "master_dataset.csv", rowCount: 0, status: "processing" })
      .returning();

    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n");
    const rawHeader = lines[0].replace(/^\uFEFF/, "");
    const headers = rawHeader.split(",");

    const col = (name: string) => headers.indexOf(name);
    const idxProjId    = col("project_id");
    const idxProjName  = col("project_name");
    const idxProjType  = col("item_type");
    const idxStatus    = col("status");
    const idxItemId    = col("item_id");
    const idxItemDesc  = col("item_desc");
    const idxBranch    = col("branch");
    const idxUom       = col("uom");
    const idxQty       = col("quantity_num");
    const idxUnitPrice = col("unit_price_num");
    const idxValue     = col("value_num");
    const idxElemId    = col("element_id");
    const idxElemDesc  = col("element_desc");
    const idxReqQty    = col("request_qty_num");
    const idxReqAmt    = col("request_amount_num");
    const idxClrQty    = col("cleared_qty_num");
    const idxClrAmt    = col("cleared_amount_num");
    const idxTotReq    = col("total_requests_num");
    const idxTotClr    = col("total_cleared_num");

    const toInsert: Parameters<typeof db.insert>[0] extends infer T ? never : never[] = [];
    const rows: {
      batchId: number; projectId: string | null; projectName: string | null;
      projectType: string | null; projectStatus: string | null;
      boqItemCode: string | null; boqItemName: string | null;
      branch: string | null; unit: string | null;
      qty: string | null; unitPrice: string | null; totalValue: string | null;
      elementCode: string | null; elementName: string | null;
      requestedQty: string | null; requestedAmount: string | null;
      clearedQty: string; clearedAmount: string;
      totalRequests: string | null; totalCleared: string | null;
    }[] = [];

    const get = (cols: string[], i: number) => i >= 0 && i < cols.length ? (cols[i] || "").trim().replace(/^"|"$/g, "") : "";
    const num = (v: string) => { const n = parseFloat(v.replace(/,/g, "")); return isNaN(n) ? null : String(n); };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      // Simple CSV split (handles quoted fields with commas)
      const cols: string[] = [];
      let cur = "", inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      cols.push(cur.trim());

      const elemName = get(cols, idxElemDesc);
      if (!elemName) continue;

      rows.push({
        batchId: batch.id,
        projectId: get(cols, idxProjId) || null,
        projectName: get(cols, idxProjName) || null,
        projectType: get(cols, idxProjType) || null,
        projectStatus: get(cols, idxStatus) || null,
        boqItemCode: get(cols, idxItemId) || null,
        boqItemName: get(cols, idxItemDesc) || null,
        branch: get(cols, idxBranch) || null,
        unit: get(cols, idxUom) || null,
        qty: num(get(cols, idxQty)),
        unitPrice: num(get(cols, idxUnitPrice)),
        totalValue: num(get(cols, idxValue)),
        elementCode: get(cols, idxElemId) || null,
        elementName: elemName,
        requestedQty: num(get(cols, idxReqQty)),
        requestedAmount: num(get(cols, idxReqAmt)),
        clearedQty: num(get(cols, idxClrQty)) ?? "0",
        clearedAmount: num(get(cols, idxClrAmt)) ?? "0",
        totalRequests: num(get(cols, idxTotReq)),
        totalCleared: num(get(cols, idxTotClr)),
      });
    }

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(historicalUsageTable).values(rows.slice(i, i + CHUNK));
    }

    await db.update(importBatchesTable)
      .set({ status: "done", rowCount: rows.length })
      .where(eq(importBatchesTable.id, batch.id));

    res.json({ success: true, rowsImported: rows.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── FEATURE: Open Custodies Board ────────────────────────────────────────────
router.get("/open-custodies", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(historicalUsageTable)
      .where(sql`project_status IN ('جاري', 'جاري الاقفال')`);

    // Group by project — keep max totals (repeated per element row)
    const projectMap = new Map<string, {
      projectId: string; projectName: string; projectType: string;
      status: string; date: string; branch: string;
      totalRequests: number; totalCleared: number;
      elements: Set<string>;
    }>();

    for (const r of rows) {
      const pid = r.projectId || "unknown";
      const treq = parseNum(r.totalRequests) ?? 0;
      const tclr = parseNum(r.totalCleared) ?? 0;
      if (!projectMap.has(pid)) {
        projectMap.set(pid, {
          projectId: pid,
          projectName: r.projectName || "",
          projectType: r.projectType || "",
          status: r.projectStatus || "",
          date: "",
          branch: r.branch || "",
          totalRequests: treq,
          totalCleared: tclr,
          elements: new Set(),
        });
      }
      const p = projectMap.get(pid)!;
      if (treq > p.totalRequests) p.totalRequests = treq;
      if (tclr > p.totalCleared) p.totalCleared = tclr;
      if (r.elementName) p.elements.add(r.elementName);
      if (r.boqItemName) p.elements.add(r.boqItemName);
    }

    const projects = Array.from(projectMap.values())
      .map(p => ({
        projectId: p.projectId,
        projectName: p.projectName,
        projectType: p.projectType,
        status: p.status,
        branch: p.branch,
        totalRequests: p.totalRequests,
        totalCleared: p.totalCleared,
        remaining: p.totalRequests - p.totalCleared,
        clearancePct: p.totalRequests > 0
          ? ((p.totalCleared / p.totalRequests) * 100) : 0,
        elementCount: p.elements.size,
      }))
      .sort((a, b) => b.remaining - a.remaining);

    const totalRequests = projects.reduce((s, p) => s + p.totalRequests, 0);
    const totalCleared  = projects.reduce((s, p) => s + p.totalCleared, 0);
    const byStatus = projects.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});
    const byType = projects.reduce<Record<string, { count: number; remaining: number }>>((acc, p) => {
      if (!acc[p.projectType]) acc[p.projectType] = { count: 0, remaining: 0 };
      acc[p.projectType].count++;
      acc[p.projectType].remaining += p.remaining;
      return acc;
    }, {});

    res.json({
      projects,
      summary: {
        totalProjects: projects.length,
        totalRequests,
        totalCleared,
        totalRemaining: totalRequests - totalCleared,
        overallClearancePct: totalRequests > 0
          ? ((totalCleared / totalRequests) * 100) : 0,
        byStatus,
        byType: Object.entries(byType).map(([type, d]) => ({
          type, count: d.count, remaining: d.remaining,
        })).sort((a, b) => b.remaining - a.remaining),
      },
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── FEATURE: Over-Allocation Alerts ──────────────────────────────────────────
router.get("/over-allocation-alerts", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(historicalUsageTable)
      .where(sql`requested_amount IS NOT NULL AND requested_amount::numeric > 0`);

    // Group by boqItemName + elementName
    const groups = new Map<string, {
      boqItemName: string; elementName: string; elementCode: string | null;
      totalReqAmt: number; totalClrAmt: number;
      totalReqQty: number; totalClrQty: number;
      n: number; nZeroCleared: number;
      projectTypes: Set<string>;
    }>();

    for (const r of rows) {
      if (!r.boqItemName || !r.elementName) continue;
      const key = `${r.boqItemName}|||${r.elementName}`;
      const reqAmt = parseNum(r.requestedAmount) ?? 0;
      const clrAmt = parseNum(r.clearedAmount) ?? 0;
      const reqQty = parseNum(r.requestedQty) ?? 0;
      const clrQty = parseNum(r.clearedQty) ?? 0;

      if (!groups.has(key)) {
        groups.set(key, {
          boqItemName: r.boqItemName,
          elementName: r.elementName,
          elementCode: r.elementCode || null,
          totalReqAmt: 0, totalClrAmt: 0,
          totalReqQty: 0, totalClrQty: 0,
          n: 0, nZeroCleared: 0,
          projectTypes: new Set(),
        });
      }
      const g = groups.get(key)!;
      g.totalReqAmt += reqAmt;
      g.totalClrAmt += clrAmt;
      g.totalReqQty += reqQty;
      g.totalClrQty += clrQty;
      g.n++;
      if (clrAmt === 0 && clrQty === 0) g.nZeroCleared++;
      if (r.projectType) g.projectTypes.add(r.projectType);
    }

    const alerts = Array.from(groups.values())
      .filter(g => g.totalReqAmt > 0)
      .map(g => ({
        boqItemName: g.boqItemName,
        elementName: g.elementName,
        elementCode: g.elementCode,
        totalReqAmt: g.totalReqAmt,
        totalClrAmt: g.totalClrAmt,
        gapAmt: g.totalReqAmt - g.totalClrAmt,
        gapPct: ((g.totalReqAmt - g.totalClrAmt) / g.totalReqAmt) * 100,
        totalReqQty: g.totalReqQty,
        totalClrQty: g.totalClrQty,
        gapQty: g.totalReqQty - g.totalClrQty,
        nRecords: g.n,
        nZeroCleared: g.nZeroCleared,
        pctNeverCleared: g.n > 0 ? (g.nZeroCleared / g.n) * 100 : 0,
        projectTypes: Array.from(g.projectTypes),
        severity: g.totalReqAmt - g.totalClrAmt > 100000
          ? "عالية"
          : g.totalReqAmt - g.totalClrAmt > 30000
            ? "متوسطة"
            : "منخفضة",
      }))
      .filter(g => g.gapPct > 5)
      .sort((a, b) => b.gapAmt - a.gapAmt);

    const totalGap = alerts.reduce((s, a) => s + a.gapAmt, 0);
    const totalReq = alerts.reduce((s, a) => s + a.totalReqAmt, 0);

    res.json({
      alerts,
      summary: {
        totalAlerts: alerts.length,
        highSeverity: alerts.filter(a => a.severity === "عالية").length,
        medSeverity: alerts.filter(a => a.severity === "متوسطة").length,
        totalGapAmt: totalGap,
        totalReqAmt: totalReq,
        overallGapPct: totalReq > 0 ? (totalGap / totalReq) * 100 : 0,
      },
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── FEATURE: Monthly Timeline ─────────────────────────────────────────────────
router.get("/monthly-timeline", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select({
      requestedAmount: historicalUsageTable.requestedAmount,
      clearedAmount:   historicalUsageTable.clearedAmount,
      projectType:     historicalUsageTable.projectType,
      projectStatus:   historicalUsageTable.projectStatus,
    }).from(historicalUsageTable)
      .where(sql`requested_amount IS NOT NULL`);

    // We need date from the raw data — re-fetch with date
    const rowsWithDate = await db.select().from(historicalUsageTable)
      .where(sql`requested_amount IS NOT NULL AND requested_amount::numeric > 0`);

    const monthly = new Map<string, {
      month: string; reqAmt: number; clrAmt: number;
      byType: Record<string, { req: number; clr: number }>;
    }>();

    for (const r of rowsWithDate) {
      // date stored as DD/MM/YYYY — also check requestedAmount
      let dateStr = "";
      // Try to extract date from available fields - use project_id suffix as fallback
      // The date comes from the HTML parser, stored in historical_usage but not exposed in schema
      // Use requestedAmount as proxy signal
      const reqAmt = parseNum(r.requestedAmount) ?? 0;
      const clrAmt = parseNum(r.clearedAmount) ?? 0;
      if (reqAmt === 0) continue;

      // Build monthly from project status as approximation
      // Since we don't have date in DB, group by projectId prefix (year encoded)
      const pid = r.projectId || "";
      // Project IDs like 208060014762 — first 6 digits = 208060 (branch code)
      // Use batch import time as proxy — approximate
      dateStr = "غير محدد";
      const key = dateStr;

      if (!monthly.has(key)) {
        monthly.set(key, { month: key, reqAmt: 0, clrAmt: 0, byType: {} });
      }
      const m = monthly.get(key)!;
      m.reqAmt += reqAmt;
      m.clrAmt += clrAmt;
    }

    // Since date is in source files but not in DB schema, serve from CSV output
    // Read the master_dataset.csv which has date_field
    const fs = await import("fs");
    const path = await import("path");
    const csvPath = path.resolve(process.cwd(), "..", "..", "outputs", "boq_analysis", "master_dataset.csv");

    let timelineData: Array<{ month: string; label: string; reqAmt: number; clrAmt: number; gap: number; byType: Record<string, { req: number; clr: number }> }> = [];

    try {
      const csvContent = fs.readFileSync(csvPath, "utf-8");
      const csvLines = csvContent.split("\n");
      const headers = csvLines[0].replace(/^\uFEFF/, "").split(",");
      const idxDate = headers.indexOf("date_field");
      const idxReqAmt = headers.indexOf("request_amount_num");
      const idxClrAmt = headers.indexOf("cleared_amount_num");
      const idxType = headers.indexOf("item_type");

      const monthMap = new Map<string, { reqAmt: number; clrAmt: number; byType: Record<string, { req: number; clr: number }> }>();

      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let cur = "", inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; }
          else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
        result.push(cur.trim());
        return result;
      };

      for (let i = 1; i < csvLines.length; i++) {
        const line = csvLines[i];
        if (!line.trim()) continue;
        const cols = parseCsvLine(line);
        const dateRaw = (cols[idxDate] || "").trim().replace(/"/g, "");
        const reqAmt = parseFloat((cols[idxReqAmt] || "0").replace(/"/g, "")) || 0;
        const clrAmt = parseFloat((cols[idxClrAmt] || "0").replace(/"/g, "")) || 0;
        const ptype  = (cols[idxType] || "").replace(/"/g, "").trim() || "غير محدد";

        if (!dateRaw) continue;

        const parts = dateRaw.split("/");
        if (parts.length !== 3) continue;
        // date_field format: DD/MM/YYYY
        const day = parts[0], month = parts[1], year = parts[2];
        if (!year || year.length < 4) continue;
        const monthKey = `${year}-${month.padStart(2, "0")}`;

        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, { reqAmt: 0, clrAmt: 0, byType: {} });
        }
        const m = monthMap.get(monthKey)!;
        m.reqAmt += reqAmt;
        m.clrAmt += clrAmt;
        if (!m.byType[ptype]) m.byType[ptype] = { req: 0, clr: 0 };
        m.byType[ptype].req += reqAmt;
        m.byType[ptype].clr += clrAmt;
      }

      const arabicMonths = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
      timelineData = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => {
          const [yr, mo] = key.split("-");
          const moName = arabicMonths[parseInt(mo, 10) - 1] || mo;
          return {
            month: key,
            label: `${moName} ${yr}`,
            reqAmt: v.reqAmt,
            clrAmt: v.clrAmt,
            gap: v.reqAmt - v.clrAmt,
            byType: v.byType,
          };
        });
    } catch (_e) {
      // CSV not available — return empty
    }

    const totalReq = timelineData.reduce((s, m) => s + m.reqAmt, 0);
    const totalClr = timelineData.reduce((s, m) => s + m.clrAmt, 0);

    res.json({
      timeline: timelineData,
      summary: {
        totalMonths: timelineData.length,
        totalReqAmt: totalReq,
        totalClrAmt: totalClr,
        totalGap: totalReq - totalClr,
        peakMonth: timelineData.sort((a, b) => b.reqAmt - a.reqAmt)[0]?.label || null,
      },
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
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
