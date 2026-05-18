import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// ── MODULE 1: Unified Material Dictionary ─────────────────────────────────────

export const materialCategoriesTable = pgTable("material_categories", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const materialMasterTable = pgTable("material_master", {
  id: serial("id").primaryKey(),
  canonicalName: text("canonical_name").notNull().unique(),
  canonicalNameEn: text("canonical_name_en"),
  categoryId: integer("category_id").references(() => materialCategoriesTable.id),
  unit: text("unit"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const materialAliasesTable = pgTable("material_aliases", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialMasterTable.id),
  alias: text("alias").notNull().unique(),
  source: text("source").default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── MODULE 2: Consumption Coefficient Engine ──────────────────────────────────
// Per (BOQ Item + Material): historical normalized consumption coefficient

export const materialCoefficientsTable = pgTable("material_coefficients", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialMasterTable.id),
  boqItemName: text("boq_item_name").notNull(),
  // Statistics across historical projects
  nProjects: integer("n_projects").notNull().default(0),
  nOutliers: integer("n_outliers").notNull().default(0),
  // Coefficient = clearedQty per ONE unit of BOQ item
  meanCoeff: numeric("mean_coeff", { precision: 18, scale: 6 }),
  medianCoeff: numeric("median_coeff", { precision: 18, scale: 6 }),
  stdCoeff: numeric("std_coeff", { precision: 18, scale: 6 }),
  p75Coeff: numeric("p75_coeff", { precision: 18, scale: 6 }),
  p80Coeff: numeric("p80_coeff", { precision: 18, scale: 6 }),
  p90Coeff: numeric("p90_coeff", { precision: 18, scale: 6 }),
  minCoeff: numeric("min_coeff", { precision: 18, scale: 6 }),
  maxCoeff: numeric("max_coeff", { precision: 18, scale: 6 }),
  // Quality
  stabilityScore: numeric("stability_score", { precision: 10, scale: 4 }),
  coefficientOfVariation: numeric("coefficient_of_variation", { precision: 10, scale: 4 }),
  confidenceScore: numeric("confidence_score", { precision: 10, scale: 4 }),
  volatilityLevel: text("volatility_level"),
  // Unit price history
  medianUnitPrice: numeric("median_unit_price", { precision: 18, scale: 4 }),
  p80UnitPrice: numeric("p80_unit_price", { precision: 18, scale: 4 }),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
}, (t) => [unique("material_coeff_key").on(t.materialId, t.boqItemName)]);

// ── MODULE 4: Historical Material Intelligence ────────────────────────────────
// Aggregated stats per material across ALL BOQ items and projects

export const materialHistoricalStatsTable = pgTable("material_historical_stats", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialMasterTable.id).unique(),
  totalProjects: integer("total_projects").default(0),
  totalBoqItems: integer("total_boq_items").default(0),
  totalRecords: integer("total_records").default(0),
  // Total cleared quantity across all projects (raw sum)
  totalClearedQty: numeric("total_cleared_qty", { precision: 18, scale: 4 }),
  // Average demand per project
  avgProjectDemand: numeric("avg_project_demand", { precision: 18, scale: 6 }),
  medianProjectDemand: numeric("median_project_demand", { precision: 18, scale: 6 }),
  p75ProjectDemand: numeric("p75_project_demand", { precision: 18, scale: 6 }),
  p80ProjectDemand: numeric("p80_project_demand", { precision: 18, scale: 6 }),
  // Price history
  avgUnitPrice: numeric("avg_unit_price", { precision: 18, scale: 4 }),
  medianUnitPrice: numeric("median_unit_price", { precision: 18, scale: 4 }),
  // Stability
  stabilityScore: numeric("stability_score", { precision: 10, scale: 4 }),
  volatilityLevel: text("volatility_level"),
  // Top contributing BOQ items
  topBoqItems: text("top_boq_items"),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
});

// ── MODULE 5: Project Demand Forecasts ────────────────────────────────────────

export const projectDemandForecastsTable = pgTable("project_demand_forecasts", {
  id: serial("id").primaryKey(),
  forecastName: text("forecast_name").notNull(),
  projectType: text("project_type"),
  // Input BOQ as JSON: [{boqItemName, quantity}]
  inputBoq: text("input_boq").notNull(),
  // Output as JSON: [{materialId, materialName, predictedQty, p80Qty, predictedAmount, confidence}]
  outputForecast: text("output_forecast"),
  totalMaterials: integer("total_materials").default(0),
  avgConfidence: numeric("avg_confidence", { precision: 10, scale: 2 }),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  computedAt: timestamp("computed_at"),
});

export const insertMaterialCategorySchema = createInsertSchema(materialCategoriesTable).omit({ id: true, createdAt: true });
export const insertMaterialMasterSchema = createInsertSchema(materialMasterTable).omit({ id: true, createdAt: true });
export const insertMaterialAliasSchema = createInsertSchema(materialAliasesTable).omit({ id: true, createdAt: true });
export const insertMaterialCoefficientSchema = createInsertSchema(materialCoefficientsTable).omit({ id: true, computedAt: true });
export const insertMaterialHistoricalStatsSchema = createInsertSchema(materialHistoricalStatsTable).omit({ id: true, computedAt: true });
export const insertProjectDemandForecastSchema = createInsertSchema(projectDemandForecastsTable).omit({ id: true, createdAt: true });

export type MaterialCategory = typeof materialCategoriesTable.$inferSelect;
export type MaterialMaster = typeof materialMasterTable.$inferSelect;
export type MaterialAlias = typeof materialAliasesTable.$inferSelect;
export type MaterialCoefficient = typeof materialCoefficientsTable.$inferSelect;
export type MaterialHistoricalStats = typeof materialHistoricalStatsTable.$inferSelect;
export type ProjectDemandForecast = typeof projectDemandForecastsTable.$inferSelect;
