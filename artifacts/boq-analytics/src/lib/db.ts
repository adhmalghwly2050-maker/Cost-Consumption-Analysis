import Dexie, { type Table } from 'dexie';

export interface ImportBatch {
  id?: number;
  filename: string;
  importedAt?: string;
  rowCount: number;
  status: string;
  notes?: string | null;
}

export interface HistoricalUsage {
  id?: number;
  batchId?: number | null;
  projectId?: string | null;
  projectName?: string | null;
  projectType?: string | null;
  projectStatus?: string | null;
  boqItemCode?: string | null;
  boqItemName?: string | null;
  branch?: string | null;
  unit?: string | null;
  qty?: string | null;
  unitPrice?: string | null;
  totalValue?: string | null;
  elementCode?: string | null;
  elementName?: string | null;
  requestedQty?: string | null;
  requestedAmount?: string | null;
  clearedQty?: string | null;
  clearedAmount?: string | null;
  totalRequests?: string | null;
  totalCleared?: string | null;
  createdAt?: string;
}

export interface AnalyticsResult {
  id?: number;
  boqItemName: string;
  elementName: string;
  elementCode?: string | null;
  nProjects: number;
  nOutliers: number;
  meanCf?: string | null; medianCf?: string | null; stdCf?: string | null;
  p50Cf?: string | null; p75Cf?: string | null; p80Cf?: string | null;
  p90Cf?: string | null; minCf?: string | null; maxCf?: string | null; iqrCf?: string | null;
  avgOverAllocPct?: string | null; medianOverAllocPct?: string | null; recommendedFactor?: string | null;
  meanClearedQty?: string | null; medianClearedQty?: string | null; stdClearedQty?: string | null;
  p75ClearedQty?: string | null; p80ClearedQty?: string | null; p90ClearedQty?: string | null;
  minClearedQty?: string | null; maxClearedQty?: string | null;
  meanActualPrice?: string | null; medianActualPrice?: string | null;
  stdActualPrice?: string | null; p80ActualPrice?: string | null;
  medianClearedAmount?: string | null; p80ClearedAmount?: string | null;
  avgAllocQty?: string | null; avgUsedQty?: string | null;
  medianUsedQty?: string | null; avgClearedAmount?: string | null;
  adaptiveQty?: string | null; adaptiveUnitPrice?: string | null;
  adaptiveAmount?: string | null; correctionRatio?: string | null;
  origStdQty?: string | null; origStdPrice?: string | null; origStdAmount?: string | null;
  efficiencyRating?: string | null; stabilityScore?: string | null;
  confidenceLevel?: string | null; confidenceScore?: string | null;
  volatilityLevel?: string | null; coefficientOfVariation?: string | null;
  percentileSpread?: string | null; stdOverAllocPct?: string | null;
  executionMode?: string | null; executionCompletenessScore?: string | null;
  computedAt?: string;
}

export interface StandardReference {
  id?: number;
  boqItemId: string;
  boqItemName: string;
  boqItemNumber?: string | null;
  sheet?: string | null;
  boqUnit?: string | null;
  elementName: string;
  elementUnit?: string | null;
  standardQty?: string | null;
  standardPrice?: string | null;
}

export interface RecommendationWorkflow {
  id?: number;
  boqItemName: string;
  elementName: string;
  recommendedQty?: string | null; recommendedPrice?: string | null; recommendedAmount?: string | null;
  previousQty?: string | null; previousPrice?: string | null; previousAmount?: string | null;
  overrideQty?: string | null; overridePrice?: string | null; overrideAmount?: string | null;
  overrideJustification?: string | null;
  status: string;
  nProjects?: number | null;
  confidenceScore?: string | null; stabilityScore?: string | null; volatilityLevel?: string | null;
  reviewerComment?: string | null;
  approvedBy?: string | null; approvedAt?: string | null;
  rejectedBy?: string | null; rejectedAt?: string | null; rejectionReason?: string | null;
  generatedAt?: string; appliedAt?: string | null;
  version: number;
  isLatest: boolean;
}

export interface StandardVersion {
  id?: number;
  boqItemName: string; elementName: string; version: number;
  stdQty?: string | null; stdPrice?: string | null; stdAmount?: string | null;
  changeReason?: string | null; changeType?: string | null;
  historicalEvidence?: string | null; nProjectsAtChange?: number | null;
  approvedBy?: string | null; effectiveDate?: string; workflowId?: number | null;
}

export interface ElementRole {
  id?: number;
  boqItemName: string; elementName: string; roleType: string;
  isDefault?: boolean | null; description?: string | null; createdAt?: string;
}

class BOQDatabase extends Dexie {
  importBatches!: Table<ImportBatch, number>;
  historicalUsage!: Table<HistoricalUsage, number>;
  analyticsResults!: Table<AnalyticsResult, number>;
  standardReference!: Table<StandardReference, number>;
  recommendationWorkflow!: Table<RecommendationWorkflow, number>;
  standardVersions!: Table<StandardVersion, number>;
  elementRoles!: Table<ElementRole, number>;

  constructor() {
    super('BOQDatabase');
    this.version(1).stores({
      importBatches: '++id, filename, importedAt, status',
      historicalUsage: '++id, batchId, boqItemName, elementName, projectId, branch, projectType',
      analyticsResults: '++id, [boqItemName+elementName], boqItemName, elementName',
      standardReference: '++id, boqItemId, boqItemName, elementName',
      recommendationWorkflow: '++id, [boqItemName+elementName], boqItemName, status, isLatest',
      standardVersions: '++id, boqItemName, elementName, version',
      elementRoles: '++id, [boqItemName+elementName], boqItemName',
    });
  }
}

export const boqDb = new BOQDatabase();
