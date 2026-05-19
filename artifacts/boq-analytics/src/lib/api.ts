const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

function jsonPost<T>(path: string, body: unknown): Promise<T> {
  return req<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export const api = {
  // ── BOQ / existing ──────────────────────────────────────────────────────
  getDashboard: () => req<DashboardResponse>("/api/boq/dashboard"),
  importExcel: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<ImportResponse>("/api/boq/import", { method: "POST", body: fd });
  },
  getBatches: () => req<BatchesResponse>("/api/boq/batches"),
  deleteBatch: (id: number) => req<{ success: boolean }>(`/api/boq/batches/${id}`, { method: "DELETE" }),
  seedStandard: () => req<{ success: boolean; inserted: number }>("/api/boq/seed-standard", { method: "POST" }),
  getStandard: () => req<StandardResponse>("/api/boq/standard"),
  runAnalytics: (body?: { projectType?: string; branch?: string }) =>
    jsonPost<{ success: boolean; analyzedGroups: number }>("/api/boq/run-analytics", body ?? {}),
  getBoqItems: () => req<{ items: string[] }>("/api/boq/boq-items"),
  getItemAnalytics: (item: string) => req<ItemAnalyticsResponse>(`/api/boq/item-analytics?item=${encodeURIComponent(item)}`),
  getAllAnalytics: () => req<{ analytics: AnalyticsRow[] }>("/api/boq/analytics"),
  getAdaptiveStandards: () => req<{ standards: AnalyticsRow[] }>("/api/boq/adaptive-standards"),
  // Module 1: Project Context
  getProjectContext: (params?: { projectType?: string; branch?: string }) => {
    const qs = new URLSearchParams();
    if (params?.projectType) qs.set("projectType", params.projectType);
    if (params?.branch) qs.set("branch", params.branch);
    return req<ProjectContextResponse>(`/api/boq/project-context${qs.toString() ? `?${qs}` : ""}`);
  },
  // Workflow
  generateWorkflow: () => req<{ success: boolean; generated: number }>("/api/boq/workflow/generate", { method: "POST" }),
  getWorkflow: (status?: string) => req<WorkflowResponse>(`/api/boq/workflow${status && status !== "الكل" ? `?status=${encodeURIComponent(status)}` : ""}`),
  updateWorkflow: (id: number, body: WorkflowUpdateBody) =>
    req<{ success: boolean }>(`/api/boq/workflow/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  getStandardVersions: () => req<StandardVersionsResponse>("/api/boq/standard-versions"),
  getStabilityReport: () => req<{ rows: AnalyticsRow[] }>("/api/boq/reports/stability"),
  getVolatilityReport: () => req<{ rows: AnalyticsRow[] }>("/api/boq/reports/volatility"),
  getEvolutionReport: () => req<EvolutionReportResponse>("/api/boq/reports/evolution"),

  // ── MATERIALS (new strategic module) ─────────────────────────────────────
  matSeedDictionary: () => req<{ success: boolean; materials: number; aliases: number }>("/api/materials/seed-dictionary", { method: "POST" }),
  matGetMaster: () => req<MatMasterResponse>("/api/materials/master"),
  matAutoLink: () => req<{ success: boolean; linked: number; unlinked: string[]; totalElements: number }>("/api/materials/auto-link", { method: "POST" }),
  matComputeCoefficients: () => req<{ success: boolean; computedCoefficients: number }>("/api/materials/compute-coefficients", { method: "POST" }),
  matGetCoefficients: (materialId?: number) => req<MatCoefficientsResponse>(`/api/materials/coefficients${materialId ? `?materialId=${materialId}` : ""}`),
  matGetHistoricalStats: () => req<MatHistoricalStatsResponse>("/api/materials/historical-stats"),
  matForecast: (body: ForecastInput) => jsonPost<ForecastResponse>("/api/materials/forecast", body),
  matGetForecasts: () => req<{ forecasts: ForecastSummary[] }>("/api/materials/forecasts"),
  matGetForecast: (id: number) => req<ForecastDetail>(`/api/materials/forecasts/${id}`),
  matGetBoqItemsWithCoeffs: () => req<{ items: string[] }>("/api/materials/boq-items-with-coefficients"),
  matReportTopDemand: () => req<MatTopDemandResponse>("/api/materials/reports/top-demand"),
  matReportVolatility: () => req<{ coefficients: MatCoeffRow[] }>("/api/materials/reports/volatility"),
  matReportComparison: () => req<{ rows: MatCoeffRow[] }>("/api/materials/reports/comparison"),

  // ── MODULE 1: Element Role Classification ────────────────────────────────
  getElementRoles: () => req<{ roles: ElementRole[] }>("/api/boq/element-roles"),
  saveElementRole: (body: { boqItemName: string; elementName: string; roleType: string; description?: string }) =>
    jsonPost<{ success: boolean; role: ElementRole }>("/api/boq/element-roles", body),
  bulkSaveElementRoles: (roles: Array<{ boqItemName: string; elementName: string; roleType: string; description?: string }>) =>
    jsonPost<{ success: boolean; saved: number }>("/api/boq/element-roles/bulk", { roles }),
  deleteElementRole: (id: number) =>
    req<{ success: boolean }>(`/api/boq/element-roles/${id}`, { method: "DELETE" }),

  // ── MODULE 17: Evidence Viewer ───────────────────────────────────────────
  getEvidence: (boqItemName: string, elementName: string) =>
    req<EvidenceResponse>(`/api/boq/evidence?boqItemName=${encodeURIComponent(boqItemName)}&elementName=${encodeURIComponent(elementName)}`),

  // ── MODULE 18: Unexecuted Report ─────────────────────────────────────────
  getUnexecutedReport: () => req<UnexecutedReportResponse>("/api/boq/reports/unexecuted"),

  // ── MODULE 19: Item Comparison ───────────────────────────────────────────
  getItemComparison: (item: string) =>
    req<ItemComparisonResponse>(`/api/boq/item-comparison?item=${encodeURIComponent(item)}`),
  getBoqItemsAll: () => req<{ items: string[] }>("/api/boq/boq-items-all"),
};

// ── BOQ TYPES ────────────────────────────────────────────────────────────────

export interface DashboardResponse {
  kpis: { totalItemsAnalyzed: number; totalProjects: number; totalRowsImported: number; totalBatches: number; overallMedianCf: string | null; efficiencyDistribution: Record<string, number> };
  insights: { worstOverAllocated: AnalyticsRow[]; mostStable: AnalyticsRow[]; mostVolatile: AnalyticsRow[] };
  hasData: boolean;
}
export interface ImportResponse { success: boolean; batchId: number; rowsImported: number; columnsDetected: string[] }
export interface BatchesResponse { batches: Batch[] }
export interface Batch { id: number; filename: string; importedAt: string; rowCount: number; status: string }
export interface StandardResponse { items: Array<{ item: { id: string; name: string; number: string; sheet: string; unit: string }; elements: Array<{ name: string; unit: string; qty: number; price: number }> }> }
export interface AnalyticsRow {
  id: number; boqItemName: string; elementName: string; elementCode: string | null; nProjects: number; nOutliers: number;
  meanCf: string | null; medianCf: string | null; stdCf: string | null; p50Cf: string | null; p75Cf: string | null; p80Cf: string | null; p90Cf: string | null; minCf: string | null; maxCf: string | null; iqrCf: string | null;
  avgOverAllocPct: string | null; medianOverAllocPct: string | null; recommendedFactor: string | null;
  meanClearedQty: string | null; medianClearedQty: string | null; stdClearedQty: string | null; p75ClearedQty: string | null; p80ClearedQty: string | null; p90ClearedQty: string | null; minClearedQty: string | null; maxClearedQty: string | null;
  meanActualPrice: string | null; medianActualPrice: string | null; stdActualPrice: string | null; p80ActualPrice: string | null;
  medianClearedAmount: string | null; p80ClearedAmount: string | null;
  avgAllocQty: string | null; avgUsedQty: string | null; medianUsedQty: string | null; avgClearedAmount: string | null;
  adaptiveQty: string | null; adaptiveUnitPrice: string | null; adaptiveAmount: string | null; correctionRatio: string | null;
  origStdQty: string | null; origStdPrice: string | null; origStdAmount: string | null;
  efficiencyRating: string | null; stabilityScore: string | null; confidenceLevel: string | null;
  confidenceScore: string | null; volatilityLevel: string | null; coefficientOfVariation: string | null; percentileSpread: string | null;
  stdOverAllocPct: string | null;
  executionMode: string | null; executionCompletenessScore: string | null;
}
export interface ItemAnalyticsRow extends AnalyticsRow { standardQty: number | null; standardPrice: number | null; elementUnit: string | null; recommendedQty: number | null; recommendedAmount: number | null }
export interface HistoricalRow { projectName: string | null; elementName: string | null; requestedQty: string | null; clearedQty: string | null; requestedAmount: string | null; clearedAmount: string | null }
export interface ItemAnalyticsResponse { analytics: ItemAnalyticsRow[]; historical: HistoricalRow[] }
export interface ProjectContextResponse { filters: { projectTypes: string[]; branches: string[]; statuses: string[] }; summary: Array<{ projectType: string; projectCount: number; recordCount: number; elementCount: number }>; totalRecords: number }
export interface WorkflowRec { id: number; boqItemName: string; elementName: string; recommendedQty: string | null; recommendedPrice: string | null; recommendedAmount: string | null; previousQty: string | null; previousPrice: string | null; previousAmount: string | null; overrideQty: string | null; overridePrice: string | null; overrideAmount: string | null; overrideJustification: string | null; status: string; nProjects: number | null; confidenceScore: string | null; stabilityScore: string | null; volatilityLevel: string | null; reviewerComment: string | null; approvedBy: string | null; approvedAt: string | null; rejectedBy: string | null; rejectedAt: string | null; rejectionReason: string | null; generatedAt: string; appliedAt: string | null; version: number; isLatest: boolean }
export interface WorkflowResponse { recommendations: WorkflowRec[] }
export interface WorkflowUpdateBody { action: "approve" | "reject" | "review" | "apply" | "override"; comment?: string; approvedBy?: string; overrideQty?: string; overridePrice?: string; overrideAmount?: string; overrideJustification?: string; rejectionReason?: string }
export interface StandardVersion { id: number; boqItemName: string; elementName: string; version: number; stdQty: string | null; stdPrice: string | null; stdAmount: string | null; changeReason: string | null; changeType: string | null; historicalEvidence: string | null; nProjectsAtChange: number | null; approvedBy: string | null; effectiveDate: string; workflowId: number | null }
export interface StandardVersionsResponse { versions: StandardVersion[] }
export interface EvolutionReportResponse { versions: StandardVersion[]; approvedWorkflow: WorkflowRec[] }

// ── MODULE 1: Element Role Types ─────────────────────────────────────────────
export interface ElementRole {
  id: number; boqItemName: string; elementName: string; roleType: string;
  isDefault: boolean | null; description: string | null; createdAt: string;
}

// ── MODULE 17: Evidence Types ─────────────────────────────────────────────────
export interface EvidenceRow {
  projectId: string | null; projectName: string | null; projectType: string | null;
  projectStatus: string | null; branch: string | null; qty: string | null;
  requestedQty: string | null; requestedAmount: string | null;
  clearedQty: string | null; clearedAmount: string | null;
  clearanceFactor: string | null;
}
export interface EvidenceSummary {
  totalProjects: number; avgClearanceFactor: string | null;
  zeroCleared: number; pctZeroCleared: string;
}
export interface EvidenceResponse { rows: EvidenceRow[]; summary: EvidenceSummary }

// ── MODULE 19: Item Comparison Types ─────────────────────────────────────────
export interface ItemComparisonElement {
  elementName: string; elementUnit: string | null; hasStandard: boolean;
  stdQty: string | null; stdPrice: string | null; stdAmount: string | null;
  medianReqQty: string | null; totalReqQty: string | null; totalReqAmount: string | null;
  medianClrQty: string | null; totalClrQty: string | null; totalClrAmount: string | null;
  nProjects: number; nCleared: number;
}
export interface ItemComparisonResponse {
  elements: ItemComparisonElement[]; itemName: string; boqUnit: string | null;
}

// ── MODULE 18: Unexecuted Report Types ───────────────────────────────────────
export interface UnexecutedRow {
  boqItemName: string; elementName: string; totalRecords: number; zeroCleared: number;
  pctUnexecuted: string; avgRequestedQty: string | null; totalRequestedAmount: string; projectCount: number;
}
export interface UnexecutedReportResponse { rows: UnexecutedRow[]; totalUnexecuted: number }

// ── MATERIAL TYPES ────────────────────────────────────────────────────────────

export interface MatMaterial {
  id: number; canonicalName: string; canonicalNameEn: string | null;
  categoryId: number | null; categoryName: string | null;
  unit: string | null; description: string | null; isActive: boolean;
  aliases: string[];
}
export interface MatCategory { id: number; nameAr: string; nameEn: string | null; sortOrder: number | null }
export interface MatMasterResponse { materials: MatMaterial[]; categories: MatCategory[] }

export interface MatCoeffRow {
  id: number; materialId: number; materialName: string; boqItemName: string;
  nProjects: number; nOutliers: number;
  meanCoeff: string | null; medianCoeff: string | null; stdCoeff: string | null;
  p75Coeff: string | null; p80Coeff: string | null; p90Coeff: string | null;
  minCoeff: string | null; maxCoeff: string | null;
  stabilityScore: string | null; coefficientOfVariation: string | null;
  confidenceScore: string | null; volatilityLevel: string | null;
  medianUnitPrice: string | null; p80UnitPrice: string | null;
}
export interface MatCoefficientsResponse { coefficients: MatCoeffRow[] }

export interface MatHistoricalStat {
  id: number; materialId: number; materialName: string; materialUnit: string;
  totalProjects: number | null; totalBoqItems: number | null; totalRecords: number | null;
  totalClearedQty: string | null; avgProjectDemand: string | null; medianProjectDemand: string | null;
  p75ProjectDemand: string | null; p80ProjectDemand: string | null;
  avgUnitPrice: string | null; medianUnitPrice: string | null;
  stabilityScore: string | null; volatilityLevel: string | null; topBoqItems: string | null;
}
export interface MatHistoricalStatsResponse { stats: MatHistoricalStat[] }

export interface ForecastInput {
  forecastName: string;
  projectType?: string;
  boqItems: Array<{ boqItemName: string; quantity: number }>;
}

export interface ForecastRow {
  materialId: number; materialName: string; unit: string;
  medianQty: number; p80Qty: number; p90Qty: number;
  predictedAmount: number; avgUnitPrice: number;
  confidence: number; nProjects: number; volatilityLevel: string; stabilityScore: number;
  boqContributions: Array<{ boqItemName: string; qty: number; coefficient: number }>;
}
export interface ForecastResponse { success: boolean; forecastId: number; forecast: ForecastRow[]; avgConfidence: number }

export interface ForecastSummary { id: number; forecastName: string; projectType: string | null; totalMaterials: number | null; avgConfidence: string | null; status: string | null; createdAt: string }
export interface ForecastDetail extends ForecastSummary { inputBoq: Array<{ boqItemName: string; quantity: number }>; outputForecast: ForecastRow[] }

export interface MatTopDemandResponse { materials: Array<{ materialId: number; name: string; unit: string; totalScore: number; projects: number; boqCount: number }> }
