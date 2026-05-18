const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
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
    req<{ success: boolean; analyzedGroups: number }>("/api/boq/run-analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }),
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
  // Module 5+6: Workflow
  generateWorkflow: () => req<{ success: boolean; generated: number }>("/api/boq/workflow/generate", { method: "POST" }),
  getWorkflow: (status?: string) => req<WorkflowResponse>(`/api/boq/workflow${status && status !== "الكل" ? `?status=${encodeURIComponent(status)}` : ""}`),
  updateWorkflow: (id: number, body: WorkflowUpdateBody) =>
    req<{ success: boolean }>(`/api/boq/workflow/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  // Module 7: Standard Versions
  getStandardVersions: () => req<StandardVersionsResponse>("/api/boq/standard-versions"),
  // Module 8: Reports
  getStabilityReport: () => req<{ rows: AnalyticsRow[] }>("/api/boq/reports/stability"),
  getVolatilityReport: () => req<{ rows: AnalyticsRow[] }>("/api/boq/reports/volatility"),
  getEvolutionReport: () => req<EvolutionReportResponse>("/api/boq/reports/evolution"),
};

export interface DashboardResponse {
  kpis: {
    totalItemsAnalyzed: number;
    totalProjects: number;
    totalRowsImported: number;
    totalBatches: number;
    overallMedianCf: string | null;
    efficiencyDistribution: Record<string, number>;
  };
  insights: {
    worstOverAllocated: AnalyticsRow[];
    mostStable: AnalyticsRow[];
    mostVolatile: AnalyticsRow[];
  };
  hasData: boolean;
}

export interface ImportResponse {
  success: boolean;
  batchId: number;
  rowsImported: number;
  columnsDetected: string[];
}

export interface BatchesResponse {
  batches: Batch[];
}

export interface Batch {
  id: number;
  filename: string;
  importedAt: string;
  rowCount: number;
  status: string;
}

export interface StandardResponse {
  items: Array<{
    item: { id: string; name: string; number: string; sheet: string; unit: string };
    elements: Array<{ name: string; unit: string; qty: number; price: number }>;
  }>;
}

export interface AnalyticsRow {
  id: number;
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
  meanClearedQty: string | null;
  medianClearedQty: string | null;
  stdClearedQty: string | null;
  p75ClearedQty: string | null;
  p80ClearedQty: string | null;
  p90ClearedQty: string | null;
  minClearedQty: string | null;
  maxClearedQty: string | null;
  meanActualPrice: string | null;
  medianActualPrice: string | null;
  stdActualPrice: string | null;
  p80ActualPrice: string | null;
  medianClearedAmount: string | null;
  p80ClearedAmount: string | null;
  avgAllocQty: string | null;
  avgUsedQty: string | null;
  medianUsedQty: string | null;
  avgClearedAmount: string | null;
  adaptiveQty: string | null;
  adaptiveUnitPrice: string | null;
  adaptiveAmount: string | null;
  correctionRatio: string | null;
  origStdQty: string | null;
  origStdPrice: string | null;
  origStdAmount: string | null;
  efficiencyRating: string | null;
  stabilityScore: string | null;
  confidenceLevel: string | null;
  confidenceScore: string | null;
  volatilityLevel: string | null;
  coefficientOfVariation: string | null;
  percentileSpread: string | null;
  stdOverAllocPct: string | null;
}

export interface ItemAnalyticsRow extends AnalyticsRow {
  standardQty: number | null;
  standardPrice: number | null;
  elementUnit: string | null;
  recommendedQty: number | null;
  recommendedAmount: number | null;
}

export interface HistoricalRow {
  projectName: string | null;
  elementName: string | null;
  requestedQty: string | null;
  clearedQty: string | null;
  requestedAmount: string | null;
  clearedAmount: string | null;
}

export interface ItemAnalyticsResponse {
  analytics: ItemAnalyticsRow[];
  historical: HistoricalRow[];
}

export interface ProjectContextResponse {
  filters: {
    projectTypes: string[];
    branches: string[];
    statuses: string[];
  };
  summary: Array<{
    projectType: string;
    projectCount: number;
    recordCount: number;
    elementCount: number;
  }>;
  totalRecords: number;
}

export interface WorkflowRec {
  id: number;
  boqItemName: string;
  elementName: string;
  recommendedQty: string | null;
  recommendedPrice: string | null;
  recommendedAmount: string | null;
  previousQty: string | null;
  previousPrice: string | null;
  previousAmount: string | null;
  overrideQty: string | null;
  overridePrice: string | null;
  overrideAmount: string | null;
  overrideJustification: string | null;
  status: string;
  nProjects: number | null;
  confidenceScore: string | null;
  stabilityScore: string | null;
  volatilityLevel: string | null;
  reviewerComment: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  generatedAt: string;
  appliedAt: string | null;
  version: number;
  isLatest: boolean;
}

export interface WorkflowResponse {
  recommendations: WorkflowRec[];
}

export interface WorkflowUpdateBody {
  action: "approve" | "reject" | "review" | "apply" | "override";
  comment?: string;
  approvedBy?: string;
  overrideQty?: string;
  overridePrice?: string;
  overrideAmount?: string;
  overrideJustification?: string;
  rejectionReason?: string;
}

export interface StandardVersion {
  id: number;
  boqItemName: string;
  elementName: string;
  version: number;
  stdQty: string | null;
  stdPrice: string | null;
  stdAmount: string | null;
  changeReason: string | null;
  changeType: string | null;
  historicalEvidence: string | null;
  nProjectsAtChange: number | null;
  approvedBy: string | null;
  effectiveDate: string;
  workflowId: number | null;
}

export interface StandardVersionsResponse {
  versions: StandardVersion[];
}

export interface EvolutionReportResponse {
  versions: StandardVersion[];
  approvedWorkflow: WorkflowRec[];
}
