import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  unique,
  boolean,
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

  avgOverAllocPct: numeric("avg_over_alloc_pct", { precision: 18, scale: 4 }),
  medianOverAllocPct: numeric("median_over_alloc_pct", { precision: 18, scale: 4 }),
  recommendedFactor: numeric("recommended_factor", { precision: 18, scale: 6 }),

  meanClearedQty: numeric("mean_cleared_qty", { precision: 18, scale: 6 }),
  medianClearedQty: numeric("median_cleared_qty", { precision: 18, scale: 6 }),
  stdClearedQty: numeric("std_cleared_qty", { precision: 18, scale: 6 }),
  p75ClearedQty: numeric("p75_cleared_qty", { precision: 18, scale: 6 }),
  p80ClearedQty: numeric("p80_cleared_qty", { precision: 18, scale: 6 }),
  p90ClearedQty: numeric("p90_cleared_qty", { precision: 18, scale: 6 }),
  minClearedQty: numeric("min_cleared_qty", { precision: 18, scale: 6 }),
  maxClearedQty: numeric("max_cleared_qty", { precision: 18, scale: 6 }),

  meanActualPrice: numeric("mean_actual_price", { precision: 18, scale: 4 }),
  medianActualPrice: numeric("median_actual_price", { precision: 18, scale: 4 }),
  stdActualPrice: numeric("std_actual_price", { precision: 18, scale: 4 }),
  p80ActualPrice: numeric("p80_actual_price", { precision: 18, scale: 4 }),

  medianClearedAmount: numeric("median_cleared_amount", { precision: 18, scale: 2 }),
  p80ClearedAmount: numeric("p80_cleared_amount", { precision: 18, scale: 2 }),

  avgAllocQty: numeric("avg_alloc_qty", { precision: 18, scale: 6 }),
  avgUsedQty: numeric("avg_used_qty", { precision: 18, scale: 6 }),
  medianUsedQty: numeric("median_used_qty", { precision: 18, scale: 6 }),
  avgClearedAmount: numeric("avg_cleared_amount", { precision: 18, scale: 2 }),

  adaptiveQty: numeric("adaptive_qty", { precision: 18, scale: 6 }),
  adaptiveUnitPrice: numeric("adaptive_unit_price", { precision: 18, scale: 4 }),
  adaptiveAmount: numeric("adaptive_amount", { precision: 18, scale: 2 }),
  correctionRatio: numeric("correction_ratio", { precision: 18, scale: 6 }),

  origStdQty: numeric("orig_std_qty", { precision: 18, scale: 6 }),
  origStdPrice: numeric("orig_std_price", { precision: 18, scale: 4 }),
  origStdAmount: numeric("orig_std_amount", { precision: 18, scale: 2 }),

  efficiencyRating: text("efficiency_rating"),
  stabilityScore: numeric("stability_score", { precision: 10, scale: 4 }),
  confidenceLevel: text("confidence_level"),
  confidenceScore: numeric("confidence_score", { precision: 10, scale: 4 }),
  volatilityLevel: text("volatility_level"),
  coefficientOfVariation: numeric("coefficient_of_variation", { precision: 10, scale: 4 }),
  percentileSpread: numeric("percentile_spread", { precision: 10, scale: 4 }),

  stdOverAllocPct: numeric("std_over_alloc_pct", { precision: 18, scale: 4 }),
  // MODULE 2: Execution Mode Detection
  executionMode: text("execution_mode"),
  executionCompletenessScore: numeric("execution_completeness_score", { precision: 10, scale: 4 }),
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

export const recommendationWorkflowTable = pgTable("recommendation_workflow", {
  id: serial("id").primaryKey(),
  boqItemName: text("boq_item_name").notNull(),
  elementName: text("element_name").notNull(),
  recommendedQty: numeric("recommended_qty", { precision: 18, scale: 6 }),
  recommendedPrice: numeric("recommended_price", { precision: 18, scale: 4 }),
  recommendedAmount: numeric("recommended_amount", { precision: 18, scale: 2 }),
  previousQty: numeric("previous_qty", { precision: 18, scale: 6 }),
  previousPrice: numeric("previous_price", { precision: 18, scale: 4 }),
  previousAmount: numeric("previous_amount", { precision: 18, scale: 2 }),
  overrideQty: numeric("override_qty", { precision: 18, scale: 6 }),
  overridePrice: numeric("override_price", { precision: 18, scale: 4 }),
  overrideAmount: numeric("override_amount", { precision: 18, scale: 2 }),
  overrideJustification: text("override_justification"),
  status: text("status").notNull().default("مسودة"),
  nProjects: integer("n_projects").default(0),
  confidenceScore: numeric("confidence_score", { precision: 10, scale: 4 }),
  stabilityScore: numeric("stability_score", { precision: 10, scale: 4 }),
  volatilityLevel: text("volatility_level"),
  reviewerComment: text("reviewer_comment"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectedBy: text("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  appliedAt: timestamp("applied_at"),
  version: integer("version").notNull().default(1),
  isLatest: boolean("is_latest").notNull().default(true),
});

export const standardVersionsTable = pgTable("standard_versions", {
  id: serial("id").primaryKey(),
  boqItemName: text("boq_item_name").notNull(),
  elementName: text("element_name").notNull(),
  version: integer("version").notNull(),
  stdQty: numeric("std_qty", { precision: 18, scale: 6 }),
  stdPrice: numeric("std_price", { precision: 18, scale: 4 }),
  stdAmount: numeric("std_amount", { precision: 18, scale: 2 }),
  changeReason: text("change_reason"),
  changeType: text("change_type"),
  historicalEvidence: text("historical_evidence"),
  nProjectsAtChange: integer("n_projects_at_change"),
  approvedBy: text("approved_by"),
  effectiveDate: timestamp("effective_date").defaultNow().notNull(),
  workflowId: integer("workflow_id").references(() => recommendationWorkflowTable.id),
});

// ── MODULE 1: Element Role Classification ─────────────────────────────────────
export const elementRolesTable = pgTable("element_roles", {
  id: serial("id").primaryKey(),
  boqItemName: text("boq_item_name").notNull(),
  elementName: text("element_name").notNull(),
  // primary_core | secondary_validation | contractor_indicator | supporting | financial | auxiliary
  roleType: text("role_type").notNull().default("supporting"),
  isDefault: boolean("is_default").default(false),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique("element_role_key").on(t.boqItemName, t.elementName)]);

export const insertImportBatchSchema = createInsertSchema(importBatchesTable).omit({ id: true, importedAt: true });
export const insertHistoricalUsageSchema = createInsertSchema(historicalUsageTable).omit({ id: true, createdAt: true });
export const insertAnalyticsResultSchema = createInsertSchema(analyticsResultsTable).omit({ id: true, computedAt: true });
export const insertStandardReferenceSchema = createInsertSchema(standardReferenceTable).omit({ id: true });
export const insertRecommendationWorkflowSchema = createInsertSchema(recommendationWorkflowTable).omit({ id: true, generatedAt: true });
export const insertStandardVersionSchema = createInsertSchema(standardVersionsTable).omit({ id: true });
export const insertElementRoleSchema = createInsertSchema(elementRolesTable).omit({ id: true, createdAt: true });

export type ImportBatch = typeof importBatchesTable.$inferSelect;
export type HistoricalUsage = typeof historicalUsageTable.$inferSelect;
export type AnalyticsResult = typeof analyticsResultsTable.$inferSelect;
export type StandardReference = typeof standardReferenceTable.$inferSelect;
export type RecommendationWorkflow = typeof recommendationWorkflowTable.$inferSelect;
export type StandardVersion = typeof standardVersionsTable.$inferSelect;
export type ElementRole = typeof elementRolesTable.$inferSelect;
