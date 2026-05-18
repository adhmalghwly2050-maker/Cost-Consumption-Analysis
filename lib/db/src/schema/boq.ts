import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const importBatchesTable = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  rowCount: integer("row_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
});

export const historicalUsageTable = pgTable("historical_usage", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => importBatchesTable.id),
  projectId: text("project_id"),
  projectName: text("project_name"),
  projectType: text("project_type"),
  projectStatus: text("project_status"),
  boqItemCode: text("boq_item_code"),
  boqItemName: text("boq_item_name"),
  branch: text("branch"),
  unit: text("unit"),
  qty: numeric("qty", { precision: 18, scale: 6 }),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }),
  totalValue: numeric("total_value", { precision: 18, scale: 2 }),
  elementCode: text("element_code"),
  elementName: text("element_name"),
  requestedQty: numeric("requested_qty", { precision: 18, scale: 6 }),
  requestedAmount: numeric("requested_amount", { precision: 18, scale: 2 }),
  clearedQty: numeric("cleared_qty", { precision: 18, scale: 6 }),
  clearedAmount: numeric("cleared_amount", { precision: 18, scale: 2 }),
  totalRequests: numeric("total_requests", { precision: 18, scale: 2 }),
  totalCleared: numeric("total_cleared", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const analyticsResultsTable = pgTable("analytics_results", {
  id: serial("id").primaryKey(),
  boqItemName: text("boq_item_name").notNull(),
  elementName: text("element_name").notNull(),
  elementCode: text("element_code"),
  nProjects: integer("n_projects").notNull().default(0),
  nOutliers: integer("n_outliers").notNull().default(0),

  // ── Consumption Factor (cleared/requested) stats ───────────────
  meanCf: numeric("mean_cf", { precision: 18, scale: 6 }),
  medianCf: numeric("median_cf", { precision: 18, scale: 6 }),
  stdCf: numeric("std_cf", { precision: 18, scale: 6 }),
  p50Cf: numeric("p50_cf", { precision: 18, scale: 6 }),
  p75Cf: numeric("p75_cf", { precision: 18, scale: 6 }),
  p80Cf: numeric("p80_cf", { precision: 18, scale: 6 }),
  p90Cf: numeric("p90_cf", { precision: 18, scale: 6 }),
  minCf: numeric("min_cf", { precision: 18, scale: 6 }),
  maxCf: numeric("max_cf", { precision: 18, scale: 6 }),
  iqrCf: numeric("iqr_cf", { precision: 18, scale: 6 }),

  // ── Over-allocation stats ──────────────────────────────────────
  avgOverAllocPct: numeric("avg_over_alloc_pct", { precision: 18, scale: 4 }),
  medianOverAllocPct: numeric("median_over_alloc_pct", { precision: 18, scale: 4 }),
  recommendedFactor: numeric("recommended_factor", { precision: 18, scale: 6 }),

  // ── Cleared Quantity stats (raw, not ratio) ───────────────────
  meanClearedQty: numeric("mean_cleared_qty", { precision: 18, scale: 6 }),
  medianClearedQty: numeric("median_cleared_qty", { precision: 18, scale: 6 }),
  stdClearedQty: numeric("std_cleared_qty", { precision: 18, scale: 6 }),
  p75ClearedQty: numeric("p75_cleared_qty", { precision: 18, scale: 6 }),
  p80ClearedQty: numeric("p80_cleared_qty", { precision: 18, scale: 6 }),
  p90ClearedQty: numeric("p90_cleared_qty", { precision: 18, scale: 6 }),
  minClearedQty: numeric("min_cleared_qty", { precision: 18, scale: 6 }),
  maxClearedQty: numeric("max_cleared_qty", { precision: 18, scale: 6 }),

  // ── Actual Unit Price stats (clearedAmount / clearedQty) ──────
  meanActualPrice: numeric("mean_actual_price", { precision: 18, scale: 4 }),
  medianActualPrice: numeric("median_actual_price", { precision: 18, scale: 4 }),
  stdActualPrice: numeric("std_actual_price", { precision: 18, scale: 4 }),
  p80ActualPrice: numeric("p80_actual_price", { precision: 18, scale: 4 }),

  // ── Cleared Amount stats ──────────────────────────────────────
  medianClearedAmount: numeric("median_cleared_amount", { precision: 18, scale: 2 }),
  p80ClearedAmount: numeric("p80_cleared_amount", { precision: 18, scale: 2 }),

  // ── Legacy avg fields (kept for compatibility) ────────────────
  avgAllocQty: numeric("avg_alloc_qty", { precision: 18, scale: 6 }),
  avgUsedQty: numeric("avg_used_qty", { precision: 18, scale: 6 }),
  medianUsedQty: numeric("median_used_qty", { precision: 18, scale: 6 }),
  avgClearedAmount: numeric("avg_cleared_amount", { precision: 18, scale: 2 }),

  // ── Adaptive Recommended Standards (Layer 3) ──────────────────
  adaptiveQty: numeric("adaptive_qty", { precision: 18, scale: 6 }),
  adaptiveUnitPrice: numeric("adaptive_unit_price", { precision: 18, scale: 4 }),
  adaptiveAmount: numeric("adaptive_amount", { precision: 18, scale: 2 }),
  correctionRatio: numeric("correction_ratio", { precision: 18, scale: 6 }),

  // ── Original Standard (Layer 1 — denormalized for quick access)
  origStdQty: numeric("orig_std_qty", { precision: 18, scale: 6 }),
  origStdPrice: numeric("orig_std_price", { precision: 18, scale: 4 }),
  origStdAmount: numeric("orig_std_amount", { precision: 18, scale: 2 }),

  // ── Quality indicators ────────────────────────────────────────
  efficiencyRating: text("efficiency_rating"),
  stabilityScore: numeric("stability_score", { precision: 10, scale: 4 }),
  confidenceLevel: text("confidence_level"),
  // Standard vs actual over-allocation: (origStdQty - medianNormClearedQty) / medianNormClearedQty * 100
  stdOverAllocPct: numeric("std_over_alloc_pct", { precision: 18, scale: 4 }),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
}, (t) => [unique("analytics_item_element_key").on(t.boqItemName, t.elementName)]);

export const standardReferenceTable = pgTable("standard_reference", {
  id: serial("id").primaryKey(),
  boqItemId: text("boq_item_id").notNull(),
  boqItemName: text("boq_item_name").notNull(),
  boqItemNumber: text("boq_item_number"),
  sheet: text("sheet"),
  boqUnit: text("boq_unit"),
  elementName: text("element_name").notNull(),
  elementUnit: text("element_unit"),
  standardQty: numeric("standard_qty", { precision: 18, scale: 6 }),
  standardPrice: numeric("standard_price", { precision: 18, scale: 2 }),
});

export const insertImportBatchSchema = createInsertSchema(importBatchesTable).omit({ id: true, importedAt: true });
export const insertHistoricalUsageSchema = createInsertSchema(historicalUsageTable).omit({ id: true, createdAt: true });
export const insertAnalyticsResultSchema = createInsertSchema(analyticsResultsTable).omit({ id: true, computedAt: true });
export const insertStandardReferenceSchema = createInsertSchema(standardReferenceTable).omit({ id: true });

export type ImportBatch = typeof importBatchesTable.$inferSelect;
export type HistoricalUsage = typeof historicalUsageTable.$inferSelect;
export type AnalyticsResult = typeof analyticsResultsTable.$inferSelect;
export type StandardReference = typeof standardReferenceTable.$inferSelect;
