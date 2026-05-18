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
  runAnalytics: () => req<{ success: boolean; analyzedGroups: number }>("/api/boq/run-analytics", { method: "POST" }),
  getBoqItems: () => req<{ items: string[] }>("/api/boq/boq-items"),
  getItemAnalytics: (item: string) => req<ItemAnalyticsResponse>(`/api/boq/item-analytics?item=${encodeURIComponent(item)}`),
  getAllAnalytics: () => req<{ analytics: AnalyticsRow[] }>("/api/boq/analytics"),
  getAdaptiveStandards: () => req<{ standards: AnalyticsRow[] }>("/api/boq/adaptive-standards"),
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
  // CF stats
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
  // Over-alloc
  avgOverAllocPct: string | null;
  medianOverAllocPct: string | null;
  recommendedFactor: string | null;
  // Cleared qty stats (Layer 2b)
  meanClearedQty: string | null;
  medianClearedQty: string | null;
  stdClearedQty: string | null;
  p75ClearedQty: string | null;
  p80ClearedQty: string | null;
  p90ClearedQty: string | null;
  minClearedQty: string | null;
  maxClearedQty: string | null;
  // Actual price stats (Layer 2c)
  meanActualPrice: string | null;
  medianActualPrice: string | null;
  stdActualPrice: string | null;
  p80ActualPrice: string | null;
  // Cleared amount stats (Layer 2d)
  medianClearedAmount: string | null;
  p80ClearedAmount: string | null;
  // Legacy
  avgAllocQty: string | null;
  avgUsedQty: string | null;
  medianUsedQty: string | null;
  avgClearedAmount: string | null;
  // Adaptive Layer 3
  adaptiveQty: string | null;
  adaptiveUnitPrice: string | null;
  adaptiveAmount: string | null;
  correctionRatio: string | null;
  // Layer 1 — original standard (denormalized)
  origStdQty: string | null;
  origStdPrice: string | null;
  origStdAmount: string | null;
  // Quality indicators
  efficiencyRating: string | null;
  stabilityScore: string | null;
  confidenceLevel: string | null;
  // Standard vs actual over-allocation pct (positive = standard overestimates)
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
