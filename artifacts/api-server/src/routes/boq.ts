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

router.post("/import", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: "لم يتم رفع أي ملف" }); return; }
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

    if (rawRows.length === 0) { res.status(400).json({ error: "الملف لا يحتوي على بيانات" }); return; }

    const sampleRow = rawRows[0];
    const keys = Object.keys(sampleRow);

    const findCol = (...candidates: string[]): string | null => {
      for (const c of candidates) {
        const found = keys.find(k => k.includes(c) || c.includes(k));
        if (found) return found;
      }
      return null;
    };

    const colProjectId = findCol("رقم المشروع");
    const colProjectName = findCol("اسم المشروع");
    const colType = findCol("النوع");
    const colStatus = findCol("الحالة");
    const colBoqCode = findCol("م البند", "رقم البند");
    const colBoqName = findCol("البند", "اسم البند");
    const colBranch = findCol("الفرع");
    const colUnit = findCol("الوحدة");
    const colQty = findCol("الكمية");
    const colUnitPrice = findCol("سعر الوحدة");
    const colValue = findCol("القيمة");
    const colElementCode = findCol("رمز الصنف");
    const colElementName = findCol("اسم الصنف");
    const colReqQty = findCol("كمية الطلب");
    const colReqAmt = findCol("مبلغ الطلبات");
    const colClrQty = findCol("كمية الاخلاء", "كمية الإخلاء");
    const colClrAmt = findCol("مبلغ الاخلاء", "مبلغ الإخلاء");
    const colTotalReq = findCol("اجمالي الطلبات", "إجمالي الطلبات");
    const colTotalClr = findCol("اجمالي ما تم اخلاؤه", "إجمالي ما تم إخلاؤه");

    const [batch] = await db
      .insert(importBatchesTable)
      .values({ filename: req.file.originalname, rowCount: rawRows.length, status: "processing" })
      .returning();

    const toInsert = rawRows
      .filter(r => colElementName && r[colElementName])
      .map(r => ({
        batchId: batch.id,
        projectId: colProjectId ? String(r[colProjectId] || "") || null : null,
        projectName: colProjectName ? String(r[colProjectName] || "") || null : null,
        projectType: colType ? String(r[colType] || "") || null : null,
        projectStatus: colStatus ? String(r[colStatus] || "") || null : null,
        boqItemCode: colBoqCode ? String(r[colBoqCode] || "") || null : null,
        boqItemName: colBoqName ? String(r[colBoqName] || "") || null : null,
        branch: colBranch ? String(r[colBranch] || "") || null : null,
        unit: colUnit ? String(r[colUnit] || "") || null : null,
        qty: colQty ? (parseNum(r[colQty]) !== null ? String(parseNum(r[colQty])) : null) : null,
        unitPrice: colUnitPrice ? (parseNum(r[colUnitPrice]) !== null ? String(parseNum(r[colUnitPrice])) : null) : null,
        totalValue: colValue ? (parseNum(r[colValue]) !== null ? String(parseNum(r[colValue])) : null) : null,
        elementCode: colElementCode ? String(r[colElementCode] || "") || null : null,
        elementName: colElementName ? String(r[colElementName] || "") || null : null,
        requestedQty: colReqQty ? (parseNum(r[colReqQty]) !== null ? String(parseNum(r[colReqQty])) : null) : null,
        requestedAmount: colReqAmt ? (parseNum(r[colReqAmt]) !== null ? String(parseNum(r[colReqAmt])) : null) : null,
        clearedQty: colClrQty ? (parseNum(r[colClrQty]) !== null ? String(parseNum(r[colClrQty])) : null) : null,
        clearedAmount: colClrAmt ? (parseNum(r[colClrAmt]) !== null ? String(parseNum(r[colClrAmt])) : null) : null,
        totalRequests: colTotalReq ? (parseNum(r[colTotalReq]) !== null ? String(parseNum(r[colTotalReq])) : null) : null,
        totalCleared: colTotalClr ? (parseNum(r[colTotalClr]) !== null ? String(parseNum(r[colTotalClr])) : null) : null,
      }));

    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await db.insert(historicalUsageTable).values(toInsert.slice(i, i + CHUNK));
    }

    await db.update(importBatchesTable)
      .set({ status: "done", rowCount: toInsert.length })
      .where(eq(importBatchesTable.id, batch.id));

    res.json({ success: true, batchId: batch.id, rowsImported: toInsert.length, columnsDetected: keys });
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
    const allRows = await db.select().from(historicalUsageTable);
    if (allRows.length === 0) {
      res.status(400).json({ error: "لا توجد بيانات تاريخية. يرجى رفع ملف Excel أولاً." });
      return;
    }

    const groups: Record<string, typeof allRows> = {};
    for (const row of allRows) {
      if (!row.boqItemName || !row.elementName) continue;
      const key = `${row.boqItemName}|||${row.elementName}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }

    const results: {
      boqItemName: string;
      elementName: string;
      elementCode: string | null;
      nProjects: number;
      nOutliers: number;
      meanCf: string | null;
      medianCf: string | null;
      stdCf: string | null;
      p50Cf: string | null;
      p75Cf: string | null;
      p80Cf: string | null;
      p90Cf: string | null;
      minCf: string | null;
      maxCf: string | null;
      iqrCf: string | null;
      avgOverAllocPct: string | null;
      medianOverAllocPct: string | null;
      recommendedFactor: string | null;
      avgAllocQty: string | null;
      avgUsedQty: string | null;
      medianUsedQty: string | null;
      avgClearedAmount: string | null;
      efficiencyRating: string;
      stabilityScore: string | null;
    }[] = [];

    for (const [key, rows] of Object.entries(groups)) {
      const [boqItemName, elementName] = key.split("|||");
      const elementCode = rows.find(r => r.elementCode)?.elementCode || null;

      const clearedQtys = rows.map(r => parseNum(r.clearedQty)).filter((v): v is number => v !== null && v > 0);
      const requestedQtys = rows.map(r => parseNum(r.requestedQty)).filter((v): v is number => v !== null && v > 0);
      const clearedAmounts = rows.map(r => parseNum(r.clearedAmount)).filter((v): v is number => v !== null && v > 0);

      const cfs: number[] = [];
      for (const row of rows) {
        const req = parseNum(row.requestedQty);
        const clr = parseNum(row.clearedQty);
        if (req && req > 0 && clr !== null && clr >= 0) cfs.push(clr / req);
      }

      if (clearedQtys.length === 0 && cfs.length === 0) continue;

      const cfStats = cfs.length > 0 ? computeStats(cfs) : null;
      const clrStats = clearedQtys.length > 0 ? computeStats(clearedQtys) : null;
      const reqStats = requestedQtys.length > 0 ? computeStats(requestedQtys) : null;

      const overAllocPcts: number[] = [];
      for (const row of rows) {
        const req = parseNum(row.requestedQty);
        const clr = parseNum(row.clearedQty);
        if (req && req > 0 && clr !== null) overAllocPcts.push(((req - clr) / Math.max(clr, 0.0001)) * 100);
      }
      const overAllocStats = overAllocPcts.length > 0 ? computeStats(overAllocPcts) : null;

      const recommendedFactor = cfStats ? cfStats.p80 : null;

      let efficiencyRating = "غير محدد";
      if (cfStats) {
        if (cfStats.median >= 0.95) efficiencyRating = "ممتاز";
        else if (cfStats.median >= 0.85) efficiencyRating = "جيد جداً";
        else if (cfStats.median >= 0.70) efficiencyRating = "جيد";
        else if (cfStats.median >= 0.50) efficiencyRating = "متوسط";
        else efficiencyRating = "ضعيف";
      }

      const stabilityScore = cfStats && cfStats.std >= 0 && cfStats.mean > 0
        ? Math.max(0, 1 - cfStats.std / cfStats.mean)
        : null;

      results.push({
        boqItemName,
        elementName,
        elementCode,
        nProjects: cfStats ? cfStats.n : (clrStats?.n ?? 0),
        nOutliers: cfStats ? cfStats.nOutliers : 0,
        meanCf: cfStats ? cfStats.mean.toFixed(6) : null,
        medianCf: cfStats ? cfStats.median.toFixed(6) : null,
        stdCf: cfStats ? cfStats.std.toFixed(6) : null,
        p50Cf: cfStats ? cfStats.p50.toFixed(6) : null,
        p75Cf: cfStats ? cfStats.p75.toFixed(6) : null,
        p80Cf: cfStats ? cfStats.p80.toFixed(6) : null,
        p90Cf: cfStats ? cfStats.p90.toFixed(6) : null,
        minCf: cfStats ? cfStats.min.toFixed(6) : null,
        maxCf: cfStats ? cfStats.max.toFixed(6) : null,
        iqrCf: cfStats ? cfStats.iqr.toFixed(6) : null,
        avgOverAllocPct: overAllocStats ? overAllocStats.mean.toFixed(4) : null,
        medianOverAllocPct: overAllocStats ? overAllocStats.median.toFixed(4) : null,
        recommendedFactor: recommendedFactor !== null ? recommendedFactor.toFixed(6) : null,
        avgAllocQty: reqStats ? reqStats.mean.toFixed(6) : null,
        avgUsedQty: clrStats ? clrStats.mean.toFixed(6) : null,
        medianUsedQty: clrStats ? clrStats.median.toFixed(6) : null,
        avgClearedAmount: clearedAmounts.length > 0 ? mean(clearedAmounts).toFixed(2) : null,
        efficiencyRating,
        stabilityScore: stabilityScore !== null ? stabilityScore.toFixed(4) : null,
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
              elementCode: sql`excluded.element_code`,
              nProjects: sql`excluded.n_projects`,
              nOutliers: sql`excluded.n_outliers`,
              meanCf: sql`excluded.mean_cf`,
              medianCf: sql`excluded.median_cf`,
              stdCf: sql`excluded.std_cf`,
              p50Cf: sql`excluded.p50_cf`,
              p75Cf: sql`excluded.p75_cf`,
              p80Cf: sql`excluded.p80_cf`,
              p90Cf: sql`excluded.p90_cf`,
              minCf: sql`excluded.min_cf`,
              maxCf: sql`excluded.max_cf`,
              iqrCf: sql`excluded.iqr_cf`,
              avgOverAllocPct: sql`excluded.avg_over_alloc_pct`,
              medianOverAllocPct: sql`excluded.median_over_alloc_pct`,
              recommendedFactor: sql`excluded.recommended_factor`,
              avgAllocQty: sql`excluded.avg_alloc_qty`,
              avgUsedQty: sql`excluded.avg_used_qty`,
              medianUsedQty: sql`excluded.median_used_qty`,
              avgClearedAmount: sql`excluded.avg_cleared_amount`,
              efficiencyRating: sql`excluded.efficiency_rating`,
              stabilityScore: sql`excluded.stability_score`,
              computedAt: sql`now()`,
            },
          });
      }
    }

    res.json({ success: true, analyzedGroups: results.length });
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
