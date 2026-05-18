import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  materialMasterTable,
  materialAliasesTable,
  materialCategoriesTable,
  materialCoefficientsTable,
  materialHistoricalStatsTable,
  projectDemandForecastsTable,
  historicalUsageTable,
} from "@workspace/db";
import { eq, sql, and, desc, inArray } from "drizzle-orm";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function mean(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function stdDev(arr: number[], m: number): number {
  if (arr.length < 2) return 0;
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1));
}

function removeOutliers(arr: number[]) {
  if (arr.length < 4) return { clean: arr, nOut: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const q1 = percentile(s, 25), q3 = percentile(s, 75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const clean = arr.filter(v => v >= lo && v <= hi);
  return { clean: clean.length > 0 ? clean : arr, nOut: arr.length - clean.length };
}

function calcStats(vals: number[]) {
  const { clean, nOut } = removeOutliers(vals);
  const sorted = [...clean].sort((a, b) => a - b);
  const m = mean(clean), sd = stdDev(clean, m);
  const cv = m > 0 ? sd / m : 0;
  const stability = Math.max(0, 1 - cv);
  const volatility = cv < 0.15 ? "مستقر جداً" : cv < 0.30 ? "مستقر" : cv < 0.50 ? "متذبذب" : cv < 0.80 ? "متذبذب جداً" : "غير مستقر";
  const nProjects = clean.length;
  const sampleScore = nProjects >= 20 ? 40 : nProjects >= 10 ? 30 : nProjects >= 5 ? 20 : nProjects >= 3 ? 10 : 5;
  const stabilityComponent = Math.round(stability * 40);
  const volComponent = cv < 0.15 ? 20 : cv < 0.30 ? 15 : cv < 0.50 ? 10 : cv < 0.80 ? 5 : 0;
  const confidence = Math.min(100, sampleScore + stabilityComponent + volComponent);
  return {
    n: nProjects, nOut,
    mean: m, median: percentile(sorted, 50),
    std: sd, p75: percentile(sorted, 75), p80: percentile(sorted, 80), p90: percentile(sorted, 90),
    min: sorted[0] ?? 0, max: sorted[sorted.length - 1] ?? 0,
    cv, stability, volatility, confidence,
  };
}

// Normalise alias string for fuzzy matching
const norm = (s: string) => s.trim().toLowerCase()
  .replace(/[أإآا]/g, "ا")
  .replace(/[ةه]/g, "ه")
  .replace(/[يى]/g, "ي")
  .replace(/\s+/g, " ");

// ─────────────────────────────────────────────────────────────────────────────
//  SEED DICTIONARY
// ─────────────────────────────────────────────────────────────────────────────

const MATERIAL_SEED: Array<{
  category: string;
  canonical: string;
  canonicalEn: string;
  unit: string;
  aliases: string[];
}> = [
  {
    category: "مواد الخرسانة",
    canonical: "الإسمنت", canonicalEn: "Cement", unit: "كيس",
    aliases: ["اسمنت","إسمنت","الاسمنت","الإسمنت","سمنت","cement","أسمنت","اسمنت بورتلاندي","سيمنت","سمنت بورتلاند"],
  },
  {
    category: "مواد الخرسانة",
    canonical: "الرمل", canonicalEn: "Sand", unit: "م3",
    aliases: ["رمل","الرمل","sand","رمل ناعم","رمل خشن","رمل نقي","تراب","تراب حصى"],
  },
  {
    category: "مواد الخرسانة",
    canonical: "الحصى", canonicalEn: "Gravel", unit: "م3",
    aliases: ["حصى","الحصى","gravel","زلط","الزلط","حصى مكسر","بحص","حجارة مكسرة","حصو"],
  },
  {
    category: "مواد الخرسانة",
    canonical: "الماء", canonicalEn: "Water", unit: "لتر",
    aliases: ["ماء","الماء","water","مياه","المياه"],
  },
  {
    category: "مواد الخرسانة",
    canonical: "الخرسانة الجاهزة", canonicalEn: "Ready Mix Concrete", unit: "م3",
    aliases: ["خرسانة جاهزة","خرسانه جاهزه","ردميكس","ريدي ميكس","خرسانة مسبقة الصنع","بيتون","بيتون جاهز","ready mix","خلطة خرسانية","خرسانة","الخرسانة"],
  },
  {
    category: "حديد التسليح",
    canonical: "حديد التسليح", canonicalEn: "Steel Reinforcement", unit: "كغم",
    aliases: ["حديد","الحديد","رباط","ربط","حديد تسليح","حديد مسلح","حديد قضبان","steel","steel bar","rebar","قضيب حديد","ريبار","حديد ايرون"],
  },
  {
    category: "حديد التسليح",
    canonical: "الشبك الحديدي", canonicalEn: "Steel Mesh", unit: "م2",
    aliases: ["شبك","شبك حديد","شبك حديدي","mesh","steel mesh","شبك تسليح"],
  },
  {
    category: "مواد التشطيب",
    canonical: "الدهان", canonicalEn: "Paint", unit: "لتر",
    aliases: ["دهان","بوية","طلاء","paint","بوية زيتية","دهان بلاستيك","بيه","دهانات","الدهان"],
  },
  {
    category: "مواد التشطيب",
    canonical: "البلاط والسيراميك", canonicalEn: "Tiles", unit: "م2",
    aliases: ["بلاط","سيراميك","بورسلين","tiles","ceramic","بلاطات","سيراميك أرضي","بلاط أرضي"],
  },
  {
    category: "مواد البناء",
    canonical: "الطوب", canonicalEn: "Bricks", unit: "ألف قطعة",
    aliases: ["طوب","طابوق","آجر","بلوك","bricks","block","طوب احمر","طوب ابيض","بلوك خرساني"],
  },
  {
    category: "مواد العزل",
    canonical: "مواد العزل المائي", canonicalEn: "Waterproofing", unit: "م2",
    aliases: ["عزل مائي","عزل","waterproofing","فوم عزل","مواد عزل","عازل رطوبة","bitumen","بيتومين"],
  },
  {
    category: "مواسير وصرف",
    canonical: "مواسير pvc", canonicalEn: "PVC Pipes", unit: "متر",
    aliases: ["مواسير","ماسورة","pvc","مواسير pvc","أنابيب pvc","مواسير صرف","انابيب","مواسير بلاستيك","سبايك"],
  },
  {
    category: "مواسير وصرف",
    canonical: "مواسير hdpe", canonicalEn: "HDPE Pipes", unit: "متر",
    aliases: ["hdpe","مواسير hdpe","أنابيب hdpe","انابيب hdpe","ماسورة hdpe"],
  },
  {
    category: "أعمال ترابية",
    canonical: "التربة والردم", canonicalEn: "Fill Material", unit: "م3",
    aliases: ["ردم","تربة","fill","ردمية","تراب ردم","هدم وردم","ردم محسن","ردمة"],
  },
  {
    category: "أعمال ترابية",
    canonical: "الحفر والتخريب", canonicalEn: "Excavation", unit: "م3",
    aliases: ["حفر","تخريب","excavation","أعمال حفر","حفريات","قطع حفر"],
  },
  {
    category: "متنوع",
    canonical: "الخشب والفورم", canonicalEn: "Formwork", unit: "م2",
    aliases: ["فورم","خشب","شده","قوالب خشبية","فورمورك","formwork","شدة خشبية","شيلمان"],
  },
];

router.post("/seed-dictionary", async (_req: Request, res: Response) => {
  try {
    // Clear existing
    await db.delete(materialAliasesTable);
    await db.delete(materialMasterTable);
    await db.delete(materialCategoriesTable);

    // Create categories
    const catMap = new Map<string, number>();
    const catNames = [...new Set(MATERIAL_SEED.map(m => m.category))];
    for (let i = 0; i < catNames.length; i++) {
      const [row] = await db.insert(materialCategoriesTable)
        .values({ nameAr: catNames[i], sortOrder: i })
        .returning();
      catMap.set(catNames[i], row.id);
    }

    // Create materials + aliases
    let totalAliases = 0;
    for (const mat of MATERIAL_SEED) {
      const catId = catMap.get(mat.category)!;
      const [matRow] = await db.insert(materialMasterTable)
        .values({
          canonicalName: mat.canonical,
          canonicalNameEn: mat.canonicalEn,
          categoryId: catId,
          unit: mat.unit,
          isActive: true,
        })
        .onConflictDoUpdate({ target: materialMasterTable.canonicalName, set: { canonicalNameEn: mat.canonicalEn, unit: mat.unit } })
        .returning();

      // Insert aliases (skip duplicates)
      for (const alias of mat.aliases) {
        await db.insert(materialAliasesTable)
          .values({ materialId: matRow.id, alias, source: "seed" })
          .onConflictDoNothing();
        totalAliases++;
      }
    }

    res.json({ success: true, materials: MATERIAL_SEED.length, aliases: totalAliases });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET MATERIAL DICTIONARY
// ─────────────────────────────────────────────────────────────────────────────

router.get("/master", async (_req: Request, res: Response) => {
  try {
    const [materials, aliases, categories] = await Promise.all([
      db.select().from(materialMasterTable).where(eq(materialMasterTable.isActive, true)),
      db.select().from(materialAliasesTable),
      db.select().from(materialCategoriesTable).orderBy(materialCategoriesTable.sortOrder),
    ]);

    const aliasMap: Record<number, string[]> = {};
    for (const a of aliases) {
      if (!aliasMap[a.materialId]) aliasMap[a.materialId] = [];
      aliasMap[a.materialId].push(a.alias);
    }

    const catMap: Record<number, string> = {};
    for (const c of categories) catMap[c.id] = c.nameAr;

    const enriched = materials.map(m => ({
      ...m,
      categoryName: m.categoryId ? catMap[m.categoryId] : null,
      aliases: aliasMap[m.id] ?? [],
    }));

    res.json({ materials: enriched, categories });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  AUTO-LINK: scan historical element names → match to material master
// ─────────────────────────────────────────────────────────────────────────────

router.post("/auto-link", async (_req: Request, res: Response) => {
  try {
    // Build lookup: normalized alias → materialId
    const aliases = await db.select().from(materialAliasesTable);
    const aliasLookup = new Map<string, number>();
    for (const a of aliases) aliasLookup.set(norm(a.alias), a.materialId);

    // Get distinct element names from historical data
    const elements = await db.selectDistinct({ elementName: historicalUsageTable.elementName })
      .from(historicalUsageTable)
      .where(sql`element_name IS NOT NULL AND element_name != ''`);

    let linked = 0, unlinked: string[] = [];
    for (const el of elements) {
      const name = el.elementName?.trim();
      if (!name) continue;
      const normalised = norm(name);

      let found = aliasLookup.get(normalised);
      if (!found) {
        // Partial match: check if alias is contained in element name or vice-versa
        for (const [aliasNorm, matId] of aliasLookup) {
          if (normalised.includes(aliasNorm) || aliasNorm.includes(normalised)) {
            found = matId;
            break;
          }
        }
      }

      if (found) {
        // Register this element name as an alias if not already done
        await db.insert(materialAliasesTable)
          .values({ materialId: found, alias: name, source: "auto" })
          .onConflictDoNothing();
        linked++;
      } else {
        unlinked.push(name);
      }
    }

    res.json({ success: true, linked, unlinked: unlinked.slice(0, 50), totalElements: elements.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE 2: COMPUTE CONSUMPTION COEFFICIENTS
// ─────────────────────────────────────────────────────────────────────────────

router.post("/compute-coefficients", async (_req: Request, res: Response) => {
  try {
    // Build alias → materialId map
    const aliases = await db.select().from(materialAliasesTable);
    const aliasLookup = new Map<string, number>();
    for (const a of aliases) aliasLookup.set(norm(a.alias), a.materialId);

    if (aliasLookup.size === 0) {
      res.status(400).json({ error: "قاموس المواد فارغ. يرجى تهيئة القاموس أولاً." });
      return;
    }

    const allRows = await db.select({
      projectId: historicalUsageTable.projectId,
      boqItemName: historicalUsageTable.boqItemName,
      elementName: historicalUsageTable.elementName,
      qty: historicalUsageTable.qty,
      clearedQty: historicalUsageTable.clearedQty,
      clearedAmount: historicalUsageTable.clearedAmount,
    }).from(historicalUsageTable)
      .where(sql`boq_item_name IS NOT NULL AND element_name IS NOT NULL`);

    if (!allRows.length) {
      res.status(400).json({ error: "لا توجد بيانات تاريخية. يرجى رفع ملفات Excel أولاً." });
      return;
    }

    // Group by (materialId, boqItemName): collect per-project coefficients
    // coefficient = clearedQty / boqItemQty  (per unit of BOQ item)
    const groups = new Map<string, { materialId: number; boqItemName: string; coeffs: number[]; prices: number[] }>();

    for (const row of allRows) {
      const materialId = aliasLookup.get(norm(row.elementName ?? ""));
      if (!materialId) continue;
      const boqQty = parseNum(row.qty);
      const clearedQty = parseNum(row.clearedQty) ?? 0;
      const clearedAmount = parseNum(row.clearedAmount) ?? 0;
      if (!boqQty || boqQty <= 0) continue;

      const key = `${materialId}|||${row.boqItemName}`;
      if (!groups.has(key)) groups.set(key, { materialId, boqItemName: row.boqItemName!, coeffs: [], prices: [] });
      const g = groups.get(key)!;

      // Per-project normalized coefficient
      g.coeffs.push(clearedQty / boqQty);
      if (clearedQty > 0 && clearedAmount > 0) g.prices.push(clearedAmount / clearedQty);
    }

    let computed = 0;
    const CHUNK = 50;
    const batch: typeof import("@workspace/db").materialCoefficientsTable.$inferInsert[] = [];

    for (const g of groups.values()) {
      if (g.coeffs.length === 0) continue;
      const stats = calcStats(g.coeffs);
      const priceStats = g.prices.length > 0 ? calcStats(g.prices) : null;

      batch.push({
        materialId: g.materialId,
        boqItemName: g.boqItemName,
        nProjects: stats.n,
        nOutliers: stats.nOut,
        meanCoeff: stats.mean.toFixed(6),
        medianCoeff: stats.median.toFixed(6),
        stdCoeff: stats.std.toFixed(6),
        p75Coeff: stats.p75.toFixed(6),
        p80Coeff: stats.p80.toFixed(6),
        p90Coeff: stats.p90.toFixed(6),
        minCoeff: stats.min.toFixed(6),
        maxCoeff: stats.max.toFixed(6),
        stabilityScore: stats.stability.toFixed(4),
        coefficientOfVariation: stats.cv.toFixed(4),
        confidenceScore: stats.confidence.toFixed(2),
        volatilityLevel: stats.volatility,
        medianUnitPrice: priceStats ? priceStats.median.toFixed(4) : null,
        p80UnitPrice: priceStats ? priceStats.p80.toFixed(4) : null,
      });

      computed++;

      if (batch.length >= CHUNK) {
        await db.insert(materialCoefficientsTable).values(batch)
          .onConflictDoUpdate({
            target: [materialCoefficientsTable.materialId, materialCoefficientsTable.boqItemName],
            set: {
              nProjects: sql`excluded.n_projects`,
              nOutliers: sql`excluded.n_outliers`,
              meanCoeff: sql`excluded.mean_coeff`,
              medianCoeff: sql`excluded.median_coeff`,
              stdCoeff: sql`excluded.std_coeff`,
              p75Coeff: sql`excluded.p75_coeff`,
              p80Coeff: sql`excluded.p80_coeff`,
              p90Coeff: sql`excluded.p90_coeff`,
              minCoeff: sql`excluded.min_coeff`,
              maxCoeff: sql`excluded.max_coeff`,
              stabilityScore: sql`excluded.stability_score`,
              coefficientOfVariation: sql`excluded.coefficient_of_variation`,
              confidenceScore: sql`excluded.confidence_score`,
              volatilityLevel: sql`excluded.volatility_level`,
              medianUnitPrice: sql`excluded.median_unit_price`,
              p80UnitPrice: sql`excluded.p80_unit_price`,
              computedAt: sql`now()`,
            },
          });
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      await db.insert(materialCoefficientsTable).values(batch)
        .onConflictDoUpdate({
          target: [materialCoefficientsTable.materialId, materialCoefficientsTable.boqItemName],
          set: {
            nProjects: sql`excluded.n_projects`,
            medianCoeff: sql`excluded.median_coeff`,
            stdCoeff: sql`excluded.std_coeff`,
            p75Coeff: sql`excluded.p75_coeff`,
            p80Coeff: sql`excluded.p80_coeff`,
            p90Coeff: sql`excluded.p90_coeff`,
            stabilityScore: sql`excluded.stability_score`,
            coefficientOfVariation: sql`excluded.coefficient_of_variation`,
            confidenceScore: sql`excluded.confidence_score`,
            volatilityLevel: sql`excluded.volatility_level`,
            medianUnitPrice: sql`excluded.median_unit_price`,
            p80UnitPrice: sql`excluded.p80_unit_price`,
            computedAt: sql`now()`,
          },
        });
    }

    // ── MODULE 4: compute historical stats per material ─────────────────────
    await _computeMaterialHistoricalStats(aliasLookup);

    res.json({ success: true, computedCoefficients: computed });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

async function _computeMaterialHistoricalStats(aliasLookup: Map<string, number>) {
  // Group historical data by material
  const allRows = await db.select({
    projectId: historicalUsageTable.projectId,
    boqItemName: historicalUsageTable.boqItemName,
    elementName: historicalUsageTable.elementName,
    clearedQty: historicalUsageTable.clearedQty,
    clearedAmount: historicalUsageTable.clearedAmount,
  }).from(historicalUsageTable).where(sql`element_name IS NOT NULL`);

  // Per material: group per project demand
  const matData = new Map<number, {
    projectDemands: Map<string, number>;
    boqItems: Set<string>;
    records: number;
    totalCleared: number;
    prices: number[];
  }>();

  for (const row of allRows) {
    const materialId = aliasLookup.get(norm(row.elementName ?? ""));
    if (!materialId) continue;
    if (!matData.has(materialId)) matData.set(materialId, {
      projectDemands: new Map(), boqItems: new Set(), records: 0, totalCleared: 0, prices: [],
    });
    const d = matData.get(materialId)!;
    d.records++;
    if (row.boqItemName) d.boqItems.add(row.boqItemName);
    const clr = parseNum(row.clearedQty) ?? 0;
    const clrAmt = parseNum(row.clearedAmount) ?? 0;
    d.totalCleared += clr;
    if (row.projectId) {
      const prev = d.projectDemands.get(row.projectId) ?? 0;
      d.projectDemands.set(row.projectId, prev + clr);
    }
    if (clr > 0 && clrAmt > 0) d.prices.push(clrAmt / clr);
  }

  for (const [materialId, d] of matData.entries()) {
    const demands = [...d.projectDemands.values()];
    if (!demands.length) continue;
    const s = calcStats(demands);
    const ps = d.prices.length > 0 ? calcStats(d.prices) : null;

    const topBoqItems = [...d.boqItems].slice(0, 10).join("، ");

    await db.insert(materialHistoricalStatsTable).values({
      materialId,
      totalProjects: d.projectDemands.size,
      totalBoqItems: d.boqItems.size,
      totalRecords: d.records,
      totalClearedQty: d.totalCleared.toFixed(4),
      avgProjectDemand: s.mean.toFixed(6),
      medianProjectDemand: s.median.toFixed(6),
      p75ProjectDemand: s.p75.toFixed(6),
      p80ProjectDemand: s.p80.toFixed(6),
      avgUnitPrice: ps ? ps.mean.toFixed(4) : null,
      medianUnitPrice: ps ? ps.median.toFixed(4) : null,
      stabilityScore: s.stability.toFixed(4),
      volatilityLevel: s.volatility,
      topBoqItems,
    }).onConflictDoUpdate({
      target: materialHistoricalStatsTable.materialId,
      set: {
        totalProjects: sql`excluded.total_projects`,
        totalBoqItems: sql`excluded.total_boq_items`,
        totalRecords: sql`excluded.total_records`,
        totalClearedQty: sql`excluded.total_cleared_qty`,
        avgProjectDemand: sql`excluded.avg_project_demand`,
        medianProjectDemand: sql`excluded.median_project_demand`,
        p75ProjectDemand: sql`excluded.p75_project_demand`,
        p80ProjectDemand: sql`excluded.p80_project_demand`,
        avgUnitPrice: sql`excluded.avg_unit_price`,
        medianUnitPrice: sql`excluded.median_unit_price`,
        stabilityScore: sql`excluded.stability_score`,
        volatilityLevel: sql`excluded.volatility_level`,
        topBoqItems: sql`excluded.top_boq_items`,
        computedAt: sql`now()`,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET COEFFICIENTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/coefficients", async (req: Request, res: Response) => {
  try {
    const { materialId } = req.query as { materialId?: string };
    const rows = materialId
      ? await db.select().from(materialCoefficientsTable)
          .where(eq(materialCoefficientsTable.materialId, parseInt(materialId)))
          .orderBy(desc(materialCoefficientsTable.nProjects))
      : await db.select().from(materialCoefficientsTable)
          .orderBy(materialCoefficientsTable.boqItemName);

    // Enrich with material name
    const matIds = [...new Set(rows.map(r => r.materialId))];
    const materials = matIds.length
      ? await db.select().from(materialMasterTable).where(inArray(materialMasterTable.id, matIds))
      : [];
    const matMap = new Map(materials.map(m => [m.id, m.canonicalName]));

    const enriched = rows.map(r => ({ ...r, materialName: matMap.get(r.materialId) ?? "—" }));
    res.json({ coefficients: enriched });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE 4: HISTORICAL MATERIAL STATS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/historical-stats", async (_req: Request, res: Response) => {
  try {
    const stats = await db.select().from(materialHistoricalStatsTable)
      .orderBy(desc(materialHistoricalStatsTable.totalProjects));

    const matIds = stats.map(s => s.materialId);
    const materials = matIds.length
      ? await db.select().from(materialMasterTable).where(inArray(materialMasterTable.id, matIds))
      : [];
    const matMap = new Map(materials.map(m => [m.id, { name: m.canonicalName, unit: m.unit }]));

    const enriched = stats.map(s => ({
      ...s,
      materialName: matMap.get(s.materialId)?.name ?? "—",
      materialUnit: matMap.get(s.materialId)?.unit ?? "—",
    }));

    res.json({ stats: enriched });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE 5: PROJECT DEMAND FORECASTING
// ─────────────────────────────────────────────────────────────────────────────

router.post("/forecast", async (req: Request, res: Response) => {
  try {
    const { forecastName, projectType, boqItems } = req.body as {
      forecastName: string;
      projectType?: string;
      boqItems: Array<{ boqItemName: string; quantity: number }>;
    };

    if (!boqItems?.length) {
      res.status(400).json({ error: "يرجى إدخال بنود المشروع" });
      return;
    }

    // Get all coefficients for the given BOQ items
    const boqNames = boqItems.map(b => b.boqItemName);
    const allCoeffs = await db.select().from(materialCoefficientsTable)
      .where(inArray(materialCoefficientsTable.boqItemName, boqNames));

    // Get material master
    const matIds = [...new Set(allCoeffs.map(c => c.materialId))];
    const materials = matIds.length
      ? await db.select().from(materialMasterTable).where(inArray(materialMasterTable.id, matIds))
      : [];
    const matMap = new Map(materials.map(m => [m.id, m]));

    // For each material: aggregate across BOQ items
    const materialForecast = new Map<number, {
      materialId: number;
      materialName: string;
      unit: string;
      medianQty: number;
      p80Qty: number;
      p90Qty: number;
      avgUnitPrice: number;
      minConfidence: number;
      nProjects: number;
      volatilityLevel: string;
      stability: number;
      boqContributions: Array<{ boqItemName: string; qty: number; coefficient: number }>;
    }>();

    const boqQtyMap = new Map(boqItems.map(b => [b.boqItemName, b.quantity]));

    for (const coeff of allCoeffs) {
      const boqQty = boqQtyMap.get(coeff.boqItemName) ?? 0;
      if (boqQty <= 0) continue;
      const mat = matMap.get(coeff.materialId);
      if (!mat) continue;

      const medianC = parseNum(coeff.medianCoeff) ?? 0;
      const p80C = parseNum(coeff.p80Coeff) ?? 0;
      const p90C = parseNum(coeff.p90Coeff) ?? 0;
      const cv = parseNum(coeff.coefficientOfVariation) ?? 0;

      // Use adaptive coefficient: stable → median, volatile → P80
      const adaptiveC = cv < 0.15 ? medianC : cv < 0.30 ? (medianC + p80C) / 2 : p80C;

      if (!materialForecast.has(coeff.materialId)) {
        materialForecast.set(coeff.materialId, {
          materialId: coeff.materialId,
          materialName: mat.canonicalName,
          unit: mat.unit ?? "—",
          medianQty: 0, p80Qty: 0, p90Qty: 0,
          avgUnitPrice: 0,
          minConfidence: parseNum(coeff.confidenceScore) ?? 0,
          nProjects: coeff.nProjects,
          volatilityLevel: coeff.volatilityLevel ?? "—",
          stability: parseNum(coeff.stabilityScore) ?? 0,
          boqContributions: [],
        });
      }

      const f = materialForecast.get(coeff.materialId)!;
      f.medianQty += medianC * boqQty;
      f.p80Qty    += p80C   * boqQty;
      f.p90Qty    += p90C   * boqQty;
      f.minConfidence = Math.min(f.minConfidence, parseNum(coeff.confidenceScore) ?? 0);
      f.nProjects = Math.max(f.nProjects, coeff.nProjects);
      f.avgUnitPrice = parseNum(coeff.medianUnitPrice) ?? 0;
      f.boqContributions.push({
        boqItemName: coeff.boqItemName,
        qty: adaptiveC * boqQty,
        coefficient: medianC,
      });
    }

    const forecastRows = [...materialForecast.values()]
      .filter(f => f.medianQty > 0 || f.p80Qty > 0)
      .sort((a, b) => b.p80Qty - a.p80Qty);

    const outputForecast = forecastRows.map(f => ({
      materialId: f.materialId,
      materialName: f.materialName,
      unit: f.unit,
      medianQty: +f.medianQty.toFixed(4),
      p80Qty: +f.p80Qty.toFixed(4),
      p90Qty: +f.p90Qty.toFixed(4),
      predictedAmount: +(f.p80Qty * f.avgUnitPrice).toFixed(2),
      avgUnitPrice: +f.avgUnitPrice.toFixed(2),
      confidence: +f.minConfidence.toFixed(1),
      nProjects: f.nProjects,
      volatilityLevel: f.volatilityLevel,
      stabilityScore: +f.stability.toFixed(4),
      boqContributions: f.boqContributions,
    }));

    const avgConf = outputForecast.length
      ? outputForecast.reduce((s, f) => s + f.confidence, 0) / outputForecast.length : 0;

    // Persist forecast
    const [saved] = await db.insert(projectDemandForecastsTable).values({
      forecastName: forecastName || `تقدير ${new Date().toLocaleDateString("ar-EG")}`,
      projectType: projectType ?? null,
      inputBoq: JSON.stringify(boqItems),
      outputForecast: JSON.stringify(outputForecast),
      totalMaterials: outputForecast.length,
      avgConfidence: avgConf.toFixed(2),
      status: "done",
      computedAt: new Date(),
    }).returning();

    res.json({ success: true, forecastId: saved.id, forecast: outputForecast, avgConfidence: avgConf });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/forecasts", async (_req: Request, res: Response) => {
  try {
    const forecasts = await db.select({
      id: projectDemandForecastsTable.id,
      forecastName: projectDemandForecastsTable.forecastName,
      projectType: projectDemandForecastsTable.projectType,
      totalMaterials: projectDemandForecastsTable.totalMaterials,
      avgConfidence: projectDemandForecastsTable.avgConfidence,
      status: projectDemandForecastsTable.status,
      createdAt: projectDemandForecastsTable.createdAt,
    }).from(projectDemandForecastsTable).orderBy(desc(projectDemandForecastsTable.createdAt));
    res.json({ forecasts });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/forecasts/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.select().from(projectDemandForecastsTable).where(eq(projectDemandForecastsTable.id, id));
    if (!row) { res.status(404).json({ error: "التقدير غير موجود" }); return; }
    res.json({
      ...row,
      inputBoq: JSON.parse(row.inputBoq),
      outputForecast: row.outputForecast ? JSON.parse(row.outputForecast) : [],
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE 7: REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// Report 1: Top demand materials (aggregate across coefficients)
router.get("/reports/top-demand", async (_req: Request, res: Response) => {
  try {
    const coeffs = await db.select().from(materialCoefficientsTable)
      .orderBy(desc(materialCoefficientsTable.nProjects));
    const mats = await db.select().from(materialMasterTable);
    const matMap = new Map(mats.map(m => [m.id, m]));

    // Aggregate weighted score per material
    const matAgg = new Map<number, { name: string; unit: string; totalScore: number; projects: number; boqCount: number }>();
    for (const c of coeffs) {
      const mat = matMap.get(c.materialId);
      if (!mat) continue;
      if (!matAgg.has(c.materialId)) matAgg.set(c.materialId, { name: mat.canonicalName, unit: mat.unit ?? "", totalScore: 0, projects: 0, boqCount: 0 });
      const agg = matAgg.get(c.materialId)!;
      agg.totalScore += (parseNum(c.medianCoeff) ?? 0) * c.nProjects;
      agg.projects = Math.max(agg.projects, c.nProjects);
      agg.boqCount++;
    }

    const result = [...matAgg.entries()]
      .map(([id, agg]) => ({ materialId: id, ...agg }))
      .sort((a, b) => b.projects - a.projects);

    res.json({ materials: result });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Report 2: Volatility per material-boqitem pair
router.get("/reports/volatility", async (_req: Request, res: Response) => {
  try {
    const coeffs = await db.select().from(materialCoefficientsTable)
      .where(sql`coefficient_of_variation IS NOT NULL`)
      .orderBy(desc(materialCoefficientsTable.coefficientOfVariation));
    const mats = await db.select().from(materialMasterTable);
    const matMap = new Map(mats.map(m => [m.id, m.canonicalName]));
    res.json({ coefficients: coeffs.map(c => ({ ...c, materialName: matMap.get(c.materialId) ?? "—" })) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Report 3: Theoretical vs historical comparison (needs standard reference)
router.get("/reports/comparison", async (_req: Request, res: Response) => {
  try {
    const coeffs = await db.select().from(materialCoefficientsTable)
      .orderBy(materialCoefficientsTable.boqItemName, materialCoefficientsTable.materialId);
    const mats = await db.select().from(materialMasterTable);
    const matMap = new Map(mats.map(m => [m.id, m]));
    // For each coefficient, theoretical coefficient would be from standard reference
    // Since standard_reference stores per-unit element quantities, we compare
    const rows = coeffs.map(c => {
      const mat = matMap.get(c.materialId);
      return {
        ...c,
        materialName: mat?.canonicalName ?? "—",
        materialUnit: mat?.unit ?? "—",
      };
    });
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Get all BOQ items that have coefficients (for forecast form)
router.get("/boq-items-with-coefficients", async (_req: Request, res: Response) => {
  try {
    const items = await db.selectDistinct({ boqItemName: materialCoefficientsTable.boqItemName })
      .from(materialCoefficientsTable)
      .orderBy(materialCoefficientsTable.boqItemName);
    res.json({ items: items.map(i => i.boqItemName) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
