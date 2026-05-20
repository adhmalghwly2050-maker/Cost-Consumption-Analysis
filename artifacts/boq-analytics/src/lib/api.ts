import { boqDb } from './db';
import { importExcelFile, runAnalyticsEngine, percentile, parseNum, getVolatilityLevel } from './analyticsEngine';
import { STANDARD_DATA } from './standardData';

// ─── helpers ─────────────────────────────────────────────────────────────────
function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return percentile(sorted, 50);
}
function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ─── api object ──────────────────────────────────────────────────────────────
export const api = {
  // ── Dashboard ───────────────────────────────────────────────────────────────
  getDashboard: async (): Promise<DashboardResponse> => {
    const [analytics, batches, rows] = await Promise.all([
      boqDb.analyticsResults.toArray(),
      boqDb.importBatches.toArray(),
      boqDb.historicalUsage.toArray(),
    ]);
    const hasData = analytics.length > 0;
    const effDist: Record<string, number> = {};
    const cfs: number[] = [];
    for (const a of analytics) {
      const r = a.efficiencyRating ?? 'غير محدد';
      effDist[r] = (effDist[r] ?? 0) + 1;
      if (a.medianCf) cfs.push(parseNum(a.medianCf) ?? 0);
    }
    const sortedCfs = [...cfs].sort((a, b) => a - b);
    const overallMedianCf = cfs.length > 0 ? percentile(sortedCfs, 50).toFixed(6) : null;
    const sortedByOverAlloc = [...analytics].sort((a, b) =>
      (parseNum(b.avgOverAllocPct) ?? 0) - (parseNum(a.avgOverAllocPct) ?? 0));
    const sortedByStability = [...analytics].sort((a, b) =>
      (parseNum(b.stabilityScore) ?? 0) - (parseNum(a.stabilityScore) ?? 0));
    const sortedByVolatility = [...analytics].sort((a, b) =>
      (parseNum(b.coefficientOfVariation) ?? 0) - (parseNum(a.coefficientOfVariation) ?? 0));
    const projectIds = new Set(rows.map(r => r.projectId).filter(Boolean));
    return {
      kpis: {
        totalItemsAnalyzed: analytics.length,
        totalProjects: projectIds.size,
        totalRowsImported: rows.length,
        totalBatches: batches.length,
        overallMedianCf,
        efficiencyDistribution: effDist,
      },
      insights: {
        worstOverAllocated: sortedByOverAlloc.slice(0, 5).map(toAnalyticsRow),
        mostStable: sortedByStability.slice(0, 5).map(toAnalyticsRow),
        mostVolatile: sortedByVolatility.slice(0, 5).map(toAnalyticsRow),
      },
      hasData,
    };
  },

  // ── Import ───────────────────────────────────────────────────────────────────
  importExcel: async (file: File): Promise<ImportResponse> => {
    const result = await importExcelFile(file);
    return { success: true, ...result };
  },

  // ── Batches ──────────────────────────────────────────────────────────────────
  getBatches: async (): Promise<BatchesResponse> => {
    const batches = await boqDb.importBatches.orderBy('id').reverse().toArray();
    return {
      batches: batches.map(b => ({
        id: b.id!,
        filename: b.filename,
        importedAt: b.importedAt ?? new Date().toISOString(),
        rowCount: b.rowCount,
        status: b.status,
      })),
    };
  },

  deleteBatch: async (id: number): Promise<{ success: boolean }> => {
    const historicalIds = (await boqDb.historicalUsage.where('batchId').equals(id).primaryKeys());
    await boqDb.historicalUsage.bulkDelete(historicalIds as number[]);
    await boqDb.importBatches.delete(id);
    return { success: true };
  },

  // ── Standard Reference ───────────────────────────────────────────────────────
  seedStandard: async (): Promise<{ success: boolean; inserted: number }> => {
    await boqDb.standardReference.clear();
    const rows = [];
    for (const item of STANDARD_DATA) {
      for (const el of (item as any)['العناصر']) {
        rows.push({
          boqItemId: (item as any)['id'],
          boqItemName: (item as any)['اسم البند'],
          boqItemNumber: (item as any)['رقم البند'] || null,
          sheet: (item as any)['الورقة'] || null,
          boqUnit: (item as any)['الوحدة'] || null,
          elementName: el['اسم الصنف'],
          elementUnit: el['الوحدة'] || null,
          standardQty: String(el['الكمية']),
          standardPrice: String(el['سعر الوحدة']),
        });
      }
    }
    await boqDb.standardReference.bulkAdd(rows);
    return { success: true, inserted: rows.length };
  },

  // ── Import standard quantities from Excel ─────────────────────────────────
  // Expected columns (by header name, order flexible):
  //   اسم البند | رقم البند | الورقة | وحدة البند | اسم الصنف | وحدة الصنف | الكمية | سعر الوحدة
  importStandardFromExcel: async (file: File): Promise<{ inserted: number; items: number }> => {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (allRows.length < 2) throw new Error('الملف لا يحتوي على بيانات');

    const header = (allRows[0] as string[]).map(c => String(c ?? '').trim());
    const col = (name: string) => header.findIndex(h => h.includes(name));

    const iItemName  = col('اسم البند');
    const iItemNum   = col('رقم البند');
    const iSheet     = col('الورقة');
    const iBoqUnit   = col('وحدة البند');
    const iElName    = col('اسم الصنف');
    const iElUnit    = col('وحدة الصنف');
    const iQty       = col('الكمية');
    const iPrice     = col('سعر الوحدة');

    if (iItemName < 0 || iElName < 0 || iQty < 0)
      throw new Error('لم يتم العثور على أعمدة إلزامية: "اسم البند" و"اسم الصنف" و"الكمية"');

    const g = (row: unknown[], i: number) => i >= 0 ? String(row[i] ?? '').trim() : '';

    const rows: import('./db').StandardReference[] = [];
    const itemIds = new Map<string, string>();

    for (const row of allRows.slice(1)) {
      const itemName = g(row, iItemName);
      const elName   = g(row, iElName);
      if (!itemName || !elName) continue;

      if (!itemIds.has(itemName)) {
        const slug = itemName.replace(/\s+/g, '_').slice(0, 30) + '_imp_' + itemIds.size;
        itemIds.set(itemName, slug);
      }

      rows.push({
        boqItemId:     itemIds.get(itemName)!,
        boqItemName:   itemName,
        boqItemNumber: g(row, iItemNum) || null,
        sheet:         g(row, iSheet)   || null,
        boqUnit:       g(row, iBoqUnit) || null,
        elementName:   elName,
        elementUnit:   g(row, iElUnit)  || null,
        standardQty:   g(row, iQty)     || '0',
        standardPrice: g(row, iPrice)   || '0',
      });
    }

    if (rows.length === 0) throw new Error('لم يتم قراءة أي صفوف — تحقق من تنسيق الملف');

    // Append (don't clear) — remove existing items with same names first
    const importedItemNames = [...itemIds.keys()];
    const existing = await boqDb.standardReference
      .filter(r => importedItemNames.includes(r.boqItemName))
      .toArray();
    if (existing.length > 0) {
      await boqDb.standardReference.bulkDelete(existing.map(r => r.id!));
    }
    await boqDb.standardReference.bulkAdd(rows);
    return { inserted: rows.length, items: itemIds.size };
  },

  getStandard: async (): Promise<StandardResponse> => {
    const all = await boqDb.standardReference.toArray();
    const grouped: Record<string, typeof all> = {};
    for (const r of all) {
      if (!grouped[r.boqItemId]) grouped[r.boqItemId] = [];
      grouped[r.boqItemId].push(r);
    }
    const items = Object.entries(grouped).map(([id, rows]) => {
      const first = rows[0];
      return {
        item: { id, name: first.boqItemName, number: first.boqItemNumber ?? '', sheet: first.sheet ?? '', unit: first.boqUnit ?? '' },
        elements: rows.map(r => ({
          name: r.elementName, unit: r.elementUnit ?? '',
          qty: parseNum(r.standardQty) ?? 0,
          price: parseNum(r.standardPrice) ?? 0,
        })),
      };
    });
    return { items };
  },

  // ── Analytics ────────────────────────────────────────────────────────────────
  runAnalytics: async (body?: { projectType?: string; branch?: string }): Promise<{ success: boolean; analyzedGroups: number }> => {
    const count = await runAnalyticsEngine(body);
    return { success: true, analyzedGroups: count };
  },

  getBoqItems: async (): Promise<{ items: string[] }> => {
    const analytics = await boqDb.analyticsResults.toArray();
    const items = [...new Set(analytics.map(a => a.boqItemName))].sort();
    return { items };
  },

  getItemAnalytics: async (item: string): Promise<ItemAnalyticsResponse> => {
    const [analyticsRows, standards, historicalRows] = await Promise.all([
      boqDb.analyticsResults.where('boqItemName').equals(item).toArray(),
      boqDb.standardReference.where('boqItemName').equals(item).toArray(),
      boqDb.historicalUsage.where('boqItemName').equals(item).toArray(),
    ]);
    const stdMap = new Map(standards.map(s => [s.elementName, s]));
    const analytics: ItemAnalyticsRow[] = analyticsRows.map(a => {
      const std = stdMap.get(a.elementName);
      const stdQty = std ? parseNum(std.standardQty) : null;
      const stdPrice = std ? parseNum(std.standardPrice) : null;
      const adaptiveQty = parseNum(a.adaptiveQty);
      const adaptivePrice = parseNum(a.adaptiveUnitPrice);
      return {
        ...toAnalyticsRow(a),
        standardQty: stdQty,
        standardPrice: stdPrice,
        elementUnit: std?.elementUnit ?? null,
        recommendedQty: adaptiveQty,
        recommendedAmount: adaptiveQty != null && adaptivePrice != null ? adaptiveQty * adaptivePrice : null,
      };
    });
    const historical: HistoricalRow[] = historicalRows.slice(0, 200).map(r => ({
      projectName: r.projectName ?? null,
      elementName: r.elementName ?? null,
      requestedQty: r.requestedQty ?? null,
      clearedQty: r.clearedQty ?? null,
      requestedAmount: r.requestedAmount ?? null,
      clearedAmount: r.clearedAmount ?? null,
    }));
    return { analytics, historical };
  },

  getAllAnalytics: async (): Promise<{ analytics: AnalyticsRow[] }> => {
    const all = await boqDb.analyticsResults.toArray();
    return { analytics: all.map(toAnalyticsRow) };
  },

  getAdaptiveStandards: async (): Promise<{ standards: AnalyticsRow[] }> => {
    const all = await boqDb.analyticsResults.toArray();
    const sorted = all
      .filter(a => a.adaptiveQty)
      .sort((a, b) => (parseNum(b.confidenceScore) ?? 0) - (parseNum(a.confidenceScore) ?? 0));
    return { standards: sorted.map(toAnalyticsRow) };
  },

  // ── Project Context ───────────────────────────────────────────────────────────
  getProjectContext: async (params?: { projectType?: string; branch?: string }): Promise<ProjectContextResponse> => {
    let rows = await boqDb.historicalUsage.toArray();
    if (params?.projectType && params.projectType !== 'الكل') {
      rows = rows.filter(r => r.projectType === params.projectType);
    }
    if (params?.branch && params.branch !== 'الكل') {
      rows = rows.filter(r => r.branch === params.branch);
    }
    const types = [...new Set(rows.map(r => r.projectType).filter(Boolean) as string[])].sort();
    const branches = [...new Set(rows.map(r => r.branch).filter(Boolean) as string[])].sort();
    const statuses = [...new Set(rows.map(r => r.projectStatus).filter(Boolean) as string[])].sort();
    const summaryMap: Record<string, { projects: Set<string>; records: number; elements: Set<string> }> = {};
    for (const r of rows) {
      const pt = r.projectType ?? 'غير محدد';
      if (!summaryMap[pt]) summaryMap[pt] = { projects: new Set(), records: 0, elements: new Set() };
      if (r.projectId) summaryMap[pt].projects.add(r.projectId);
      summaryMap[pt].records++;
      if (r.elementName) summaryMap[pt].elements.add(r.elementName);
    }
    const summary = Object.entries(summaryMap).map(([projectType, v]) => ({
      projectType, projectCount: v.projects.size, recordCount: v.records, elementCount: v.elements.size,
    }));
    return { filters: { projectTypes: types, branches, statuses }, summary, totalRecords: rows.length };
  },

  // ── Workflow ─────────────────────────────────────────────────────────────────
  generateWorkflow: async (): Promise<{ success: boolean; generated: number }> => {
    const analytics = await boqDb.analyticsResults.toArray();
    const standards = await boqDb.standardReference.toArray();
    const stdMap = new Map(standards.map(s => [`${s.boqItemName}|||${s.elementName}`, s]));
    const existing = await boqDb.recommendationWorkflow.where('isLatest').equals(1).toArray();
    const existingKeys = new Set(existing.map(r => `${r.boqItemName}|||${r.elementName}`));
    let generated = 0;
    for (const a of analytics) {
      const key = `${a.boqItemName}|||${a.elementName}`;
      if (existingKeys.has(key)) continue;
      const std = stdMap.get(key);
      await boqDb.recommendationWorkflow.add({
        boqItemName: a.boqItemName, elementName: a.elementName,
        recommendedQty: a.adaptiveQty, recommendedPrice: a.adaptiveUnitPrice, recommendedAmount: a.adaptiveAmount,
        previousQty: std?.standardQty ?? null, previousPrice: std?.standardPrice ?? null,
        previousAmount: std?.standardQty && std?.standardPrice
          ? ((parseNum(std.standardQty) ?? 0) * (parseNum(std.standardPrice) ?? 0)).toFixed(2)
          : null,
        overrideQty: null, overridePrice: null, overrideAmount: null, overrideJustification: null,
        status: 'pending', nProjects: a.nProjects,
        confidenceScore: a.confidenceScore, stabilityScore: a.stabilityScore, volatilityLevel: a.volatilityLevel,
        reviewerComment: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, rejectionReason: null,
        generatedAt: new Date().toISOString(), appliedAt: null, version: 1, isLatest: true,
      });
      generated++;
    }
    return { success: true, generated };
  },

  getWorkflow: async (status?: string): Promise<WorkflowResponse> => {
    let recs = await boqDb.recommendationWorkflow.where('isLatest').equals(1).toArray();
    if (status && status !== 'الكل') recs = recs.filter(r => r.status === status);
    return { recommendations: recs.map(toWorkflowRec) };
  },

  updateWorkflow: async (id: number, body: WorkflowUpdateBody): Promise<{ success: boolean }> => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    if (body.action === 'approve') {
      updates.status = 'approved';
      updates.approvedBy = body.approvedBy ?? 'مستخدم';
      updates.approvedAt = now;
      if (body.comment) updates.reviewerComment = body.comment;
    } else if (body.action === 'reject') {
      updates.status = 'rejected';
      updates.rejectedBy = body.approvedBy ?? 'مستخدم';
      updates.rejectedAt = now;
      updates.rejectionReason = body.rejectionReason ?? null;
    } else if (body.action === 'review') {
      updates.status = 'under_review';
      updates.reviewerComment = body.comment ?? null;
    } else if (body.action === 'apply') {
      updates.status = 'applied';
      updates.appliedAt = now;
    } else if (body.action === 'override') {
      updates.overrideQty = body.overrideQty ?? null;
      updates.overridePrice = body.overridePrice ?? null;
      updates.overrideAmount = body.overrideAmount ?? null;
      updates.overrideJustification = body.overrideJustification ?? null;
    }
    await boqDb.recommendationWorkflow.update(id, updates);
    return { success: true };
  },

  // ── Standard Versions ────────────────────────────────────────────────────────
  getStandardVersions: async (): Promise<StandardVersionsResponse> => {
    const versions = await boqDb.standardVersions.toArray();
    return {
      versions: versions.map(v => ({
        id: v.id!, boqItemName: v.boqItemName, elementName: v.elementName, version: v.version,
        stdQty: v.stdQty ?? null, stdPrice: v.stdPrice ?? null, stdAmount: v.stdAmount ?? null,
        changeReason: v.changeReason ?? null, changeType: v.changeType ?? null,
        historicalEvidence: v.historicalEvidence ?? null, nProjectsAtChange: v.nProjectsAtChange ?? null,
        approvedBy: v.approvedBy ?? null, effectiveDate: v.effectiveDate ?? new Date().toISOString(),
        workflowId: v.workflowId ?? null,
      })),
    };
  },

  // ── Reports ──────────────────────────────────────────────────────────────────
  getStabilityReport: async (): Promise<{ rows: AnalyticsRow[] }> => {
    const all = await boqDb.analyticsResults.toArray();
    const sorted = all
      .filter(a => a.stabilityScore)
      .sort((a, b) => (parseNum(b.stabilityScore) ?? 0) - (parseNum(a.stabilityScore) ?? 0));
    return { rows: sorted.map(toAnalyticsRow) };
  },

  getVolatilityReport: async (): Promise<{ rows: AnalyticsRow[] }> => {
    const all = await boqDb.analyticsResults.toArray();
    const sorted = all
      .filter(a => a.coefficientOfVariation)
      .sort((a, b) => (parseNum(b.coefficientOfVariation) ?? 0) - (parseNum(a.coefficientOfVariation) ?? 0));
    return { rows: sorted.map(toAnalyticsRow) };
  },

  getEvolutionReport: async (): Promise<EvolutionReportResponse> => {
    const [versions, workflows] = await Promise.all([
      boqDb.standardVersions.toArray(),
      boqDb.recommendationWorkflow.where('status').equals('approved').toArray(),
    ]);
    return {
      versions: versions.map(v => ({
        id: v.id!, boqItemName: v.boqItemName, elementName: v.elementName, version: v.version,
        stdQty: v.stdQty ?? null, stdPrice: v.stdPrice ?? null, stdAmount: v.stdAmount ?? null,
        changeReason: v.changeReason ?? null, changeType: v.changeType ?? null,
        historicalEvidence: v.historicalEvidence ?? null, nProjectsAtChange: v.nProjectsAtChange ?? null,
        approvedBy: v.approvedBy ?? null, effectiveDate: v.effectiveDate ?? new Date().toISOString(),
        workflowId: v.workflowId ?? null,
      })),
      approvedWorkflow: workflows.map(toWorkflowRec),
    };
  },

  // ── Element Roles ────────────────────────────────────────────────────────────
  getElementRoles: async (): Promise<{ roles: ElementRole[] }> => {
    const roles = await boqDb.elementRoles.toArray();
    return { roles: roles.map(r => ({ id: r.id!, boqItemName: r.boqItemName, elementName: r.elementName, roleType: r.roleType, isDefault: r.isDefault ?? null, description: r.description ?? null, createdAt: r.createdAt ?? new Date().toISOString() })) };
  },

  saveElementRole: async (body: { boqItemName: string; elementName: string; roleType: string; description?: string }): Promise<{ success: boolean; role: ElementRole }> => {
    const existing = await boqDb.elementRoles.where('[boqItemName+elementName]').equals([body.boqItemName, body.elementName]).first();
    if (existing?.id) {
      await boqDb.elementRoles.update(existing.id, { roleType: body.roleType, description: body.description ?? null });
      const updated = await boqDb.elementRoles.get(existing.id);
      return { success: true, role: { id: updated!.id!, boqItemName: updated!.boqItemName, elementName: updated!.elementName, roleType: updated!.roleType, isDefault: updated!.isDefault ?? null, description: updated!.description ?? null, createdAt: updated!.createdAt ?? new Date().toISOString() } };
    }
    const id = await boqDb.elementRoles.add({ ...body, description: body.description ?? null, isDefault: null, createdAt: new Date().toISOString() });
    return { success: true, role: { id, boqItemName: body.boqItemName, elementName: body.elementName, roleType: body.roleType, isDefault: null, description: body.description ?? null, createdAt: new Date().toISOString() } };
  },

  bulkSaveElementRoles: async (roles: Array<{ boqItemName: string; elementName: string; roleType: string; description?: string }>): Promise<{ success: boolean; saved: number }> => {
    let saved = 0;
    for (const role of roles) {
      await api.saveElementRole(role);
      saved++;
    }
    return { success: true, saved };
  },

  deleteElementRole: async (id: number): Promise<{ success: boolean }> => {
    await boqDb.elementRoles.delete(id);
    return { success: true };
  },

  // ── Evidence ──────────────────────────────────────────────────────────────────
  getEvidence: async (boqItemName: string, elementName: string): Promise<EvidenceResponse> => {
    const rows = await boqDb.historicalUsage
      .where('boqItemName').equals(boqItemName)
      .and(r => r.elementName === elementName)
      .toArray();
    const evidenceRows: EvidenceRow[] = rows.map(r => {
      const req = parseNum(r.requestedQty);
      const clr = parseNum(r.clearedQty) ?? 0;
      const cf = req && req > 0 ? (clr / req).toFixed(6) : null;
      return {
        projectId: r.projectId ?? null, projectName: r.projectName ?? null,
        projectType: r.projectType ?? null, projectStatus: r.projectStatus ?? null,
        branch: r.branch ?? null, qty: r.qty ?? null,
        requestedQty: r.requestedQty ?? null, requestedAmount: r.requestedAmount ?? null,
        clearedQty: r.clearedQty ?? null, clearedAmount: r.clearedAmount ?? null,
        clearanceFactor: cf,
      };
    });
    const cfs = evidenceRows.map(r => parseNum(r.clearanceFactor)).filter((v): v is number => v !== null);
    const zeroCleared = rows.filter(r => (parseNum(r.clearedQty) ?? 0) === 0).length;
    return {
      rows: evidenceRows,
      summary: {
        totalProjects: rows.length,
        avgClearanceFactor: cfs.length > 0 ? avg(cfs).toFixed(6) : null,
        zeroCleared,
        pctZeroCleared: rows.length > 0 ? ((zeroCleared / rows.length) * 100).toFixed(1) + '%' : '0%',
      },
    };
  },

  // ── Unexecuted Report ─────────────────────────────────────────────────────────
  getUnexecutedReport: async (): Promise<UnexecutedReportResponse> => {
    const rows = await boqDb.historicalUsage.toArray();
    const groups: Record<string, typeof rows> = {};
    for (const r of rows) {
      if (!r.boqItemName || !r.elementName) continue;
      const key = `${r.boqItemName}|||${r.elementName}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    const result: UnexecutedRow[] = [];
    for (const [key, rws] of Object.entries(groups)) {
      const [boqItemName, elementName] = key.split('|||');
      const totalRecords = rws.length;
      const zeroCleared = rws.filter(r => (parseNum(r.clearedQty) ?? 0) === 0).length;
      const pctUnexecuted = totalRecords > 0 ? ((zeroCleared / totalRecords) * 100).toFixed(1) : '0';
      if (zeroCleared === 0) continue;
      const reqQtys = rws.map(r => parseNum(r.requestedQty)).filter((v): v is number => v !== null);
      const totalReqAmt = rws.reduce((s, r) => s + (parseNum(r.requestedAmount) ?? 0), 0);
      const projectIds = new Set(rws.map(r => r.projectId).filter(Boolean));
      result.push({
        boqItemName, elementName, totalRecords, zeroCleared,
        pctUnexecuted, avgRequestedQty: reqQtys.length > 0 ? avg(reqQtys).toFixed(4) : null,
        totalRequestedAmount: totalReqAmt.toFixed(2), projectCount: projectIds.size,
      });
    }
    result.sort((a, b) => b.projectCount - a.projectCount);
    return { rows: result, totalUnexecuted: result.length };
  },

  // ── Item Comparison ───────────────────────────────────────────────────────────
  getItemComparison: async (item: string): Promise<ItemComparisonResponse> => {
    const [rows, standards] = await Promise.all([
      boqDb.historicalUsage.where('boqItemName').equals(item).toArray(),
      boqDb.standardReference.where('boqItemName').equals(item).toArray(),
    ]);
    if (!rows.length) return { elements: [], itemName: item, boqUnit: null };
    const boqUnit = rows.find(r => r.unit)?.unit ?? null;
    const stdMap = new Map(standards.map(s => [s.elementName, s]));
    const groups: Record<string, typeof rows> = {};
    for (const r of rows) {
      if (!r.elementName) continue;
      if (!groups[r.elementName]) groups[r.elementName] = [];
      groups[r.elementName].push(r);
    }
    const elements: ItemComparisonElement[] = Object.entries(groups).map(([elementName, rws]) => {
      const std = stdMap.get(elementName);
      const normReq: number[] = [], normClr: number[] = [];
      let totalReqQty = 0, totalReqAmt = 0, totalClrQty = 0, totalClrAmt = 0, nCleared = 0;
      for (const r of rws) {
        const boqQty = parseNum(r.qty);
        const reqQty = parseNum(r.requestedQty);
        const clrQty = parseNum(r.clearedQty) ?? 0;
        const reqAmt = parseNum(r.requestedAmount) ?? 0;
        const clrAmt = parseNum(r.clearedAmount) ?? 0;
        if (reqQty != null) totalReqQty += reqQty;
        totalReqAmt += reqAmt; totalClrQty += clrQty; totalClrAmt += clrAmt;
        if (clrQty > 0) nCleared++;
        if (boqQty && boqQty > 0) {
          if (reqQty != null) normReq.push(reqQty / boqQty);
          if (clrQty > 0) normClr.push(clrQty / boqQty);
        }
      }
      const sortedReq = [...normReq].sort((a, b) => a - b);
      const sortedClr = [...normClr].sort((a, b) => a - b);
      const stdQty = std?.standardQty ?? null;
      const stdPrice = std?.standardPrice ?? null;
      const stdAmt = stdQty && stdPrice ? ((parseNum(stdQty) ?? 0) * (parseNum(stdPrice) ?? 0)).toFixed(2) : null;
      return {
        elementName, elementUnit: std?.elementUnit ?? null, hasStandard: !!std,
        stdQty, stdPrice, stdAmount: stdAmt,
        medianReqQty: sortedReq.length > 0 ? percentile(sortedReq, 50).toFixed(6) : null,
        totalReqQty: totalReqQty.toFixed(4), totalReqAmount: totalReqAmt.toFixed(2),
        medianClrQty: sortedClr.length > 0 ? percentile(sortedClr, 50).toFixed(6) : null,
        totalClrQty: totalClrQty.toFixed(4), totalClrAmount: totalClrAmt.toFixed(2),
        nProjects: rws.length, nCleared,
      };
    });
    return { elements, itemName: item, boqUnit };
  },

  getBoqItemsAll: async (): Promise<{ items: string[] }> => {
    const rows = await boqDb.historicalUsage.toArray();
    const items = [...new Set(rows.map(r => r.boqItemName).filter((v): v is string => !!v))].sort();
    return { items };
  },

  // ── Materials (offline stub — no server available) ───────────────────────────
  matSeedDictionary: async (): Promise<{ success: boolean; materials: number; aliases: number }> => ({ success: true, materials: 0, aliases: 0 }),
  matGetMaster: async (): Promise<MatMasterResponse> => ({ materials: [] as MatMaterial[], categories: [] as MatCategory[] }),
  matAutoLink: async (): Promise<{ success: boolean; linked: number; unlinked: string[]; totalElements: number }> => ({ success: true, linked: 0, unlinked: [], totalElements: 0 }),
  matComputeCoefficients: async (): Promise<{ success: boolean; computedCoefficients: number }> => ({ success: true, computedCoefficients: 0 }),
  matGetCoefficients: async (_?: number): Promise<MatCoefficientsResponse> => ({ coefficients: [] as MatCoeffRow[] }),
  matGetHistoricalStats: async (): Promise<MatHistoricalStatsResponse> => ({ stats: [] as MatHistoricalStat[] }),
  matForecast: async (_: ForecastInput): Promise<ForecastResponse> => ({ success: false, forecastId: 0, forecast: [] as ForecastRow[], avgConfidence: 0 }),
  matGetForecasts: async (): Promise<{ forecasts: ForecastSummary[] }> => ({ forecasts: [] as ForecastSummary[] }),
  matGetForecast: async (_: number): Promise<ForecastDetail> => { throw new Error('غير متاح في الوضع غير المتصل'); },
  matGetBoqItemsWithCoeffs: async (): Promise<{ items: string[] }> => ({ items: [] as string[] }),
  matReportTopDemand: async (): Promise<MatTopDemandResponse> => ({ materials: [] }),
  matReportVolatility: async (): Promise<{ coefficients: MatCoeffRow[] }> => ({ coefficients: [] as MatCoeffRow[] }),
  matReportComparison: async (): Promise<{ rows: MatCoeffRow[] }> => ({ rows: [] as MatCoeffRow[] }),
};

// ── helpers ────────────────────────────────────────────────────────────────────
function toAnalyticsRow(a: import('./db').AnalyticsResult): AnalyticsRow {
  return {
    id: a.id ?? 0, boqItemName: a.boqItemName, elementName: a.elementName, elementCode: a.elementCode ?? null,
    nProjects: a.nProjects, nOutliers: a.nOutliers,
    meanCf: a.meanCf ?? null, medianCf: a.medianCf ?? null, stdCf: a.stdCf ?? null,
    p50Cf: a.p50Cf ?? null, p75Cf: a.p75Cf ?? null, p80Cf: a.p80Cf ?? null,
    p90Cf: a.p90Cf ?? null, minCf: a.minCf ?? null, maxCf: a.maxCf ?? null, iqrCf: a.iqrCf ?? null,
    avgOverAllocPct: a.avgOverAllocPct ?? null, medianOverAllocPct: a.medianOverAllocPct ?? null,
    recommendedFactor: a.recommendedFactor ?? null,
    meanClearedQty: a.meanClearedQty ?? null, medianClearedQty: a.medianClearedQty ?? null,
    stdClearedQty: a.stdClearedQty ?? null, p75ClearedQty: a.p75ClearedQty ?? null,
    p80ClearedQty: a.p80ClearedQty ?? null, p90ClearedQty: a.p90ClearedQty ?? null,
    minClearedQty: a.minClearedQty ?? null, maxClearedQty: a.maxClearedQty ?? null,
    meanActualPrice: a.meanActualPrice ?? null, medianActualPrice: a.medianActualPrice ?? null,
    stdActualPrice: a.stdActualPrice ?? null, p80ActualPrice: a.p80ActualPrice ?? null,
    medianClearedAmount: a.medianClearedAmount ?? null, p80ClearedAmount: a.p80ClearedAmount ?? null,
    avgAllocQty: a.avgAllocQty ?? null, avgUsedQty: a.avgUsedQty ?? null,
    medianUsedQty: a.medianUsedQty ?? null, avgClearedAmount: a.avgClearedAmount ?? null,
    adaptiveQty: a.adaptiveQty ?? null, adaptiveUnitPrice: a.adaptiveUnitPrice ?? null,
    adaptiveAmount: a.adaptiveAmount ?? null, correctionRatio: a.correctionRatio ?? null,
    origStdQty: a.origStdQty ?? null, origStdPrice: a.origStdPrice ?? null, origStdAmount: a.origStdAmount ?? null,
    efficiencyRating: a.efficiencyRating ?? null, stabilityScore: a.stabilityScore ?? null,
    confidenceLevel: a.confidenceLevel ?? null, confidenceScore: a.confidenceScore ?? null,
    volatilityLevel: a.volatilityLevel ?? null, coefficientOfVariation: a.coefficientOfVariation ?? null,
    percentileSpread: a.percentileSpread ?? null, stdOverAllocPct: a.stdOverAllocPct ?? null,
    executionMode: a.executionMode ?? null, executionCompletenessScore: a.executionCompletenessScore ?? null,
  };
}

function toWorkflowRec(r: import('./db').RecommendationWorkflow): WorkflowRec {
  return {
    id: r.id!, boqItemName: r.boqItemName, elementName: r.elementName,
    recommendedQty: r.recommendedQty ?? null, recommendedPrice: r.recommendedPrice ?? null,
    recommendedAmount: r.recommendedAmount ?? null, previousQty: r.previousQty ?? null,
    previousPrice: r.previousPrice ?? null, previousAmount: r.previousAmount ?? null,
    overrideQty: r.overrideQty ?? null, overridePrice: r.overridePrice ?? null,
    overrideAmount: r.overrideAmount ?? null, overrideJustification: r.overrideJustification ?? null,
    status: r.status, nProjects: r.nProjects ?? null, confidenceScore: r.confidenceScore ?? null,
    stabilityScore: r.stabilityScore ?? null, volatilityLevel: r.volatilityLevel ?? null,
    reviewerComment: r.reviewerComment ?? null, approvedBy: r.approvedBy ?? null,
    approvedAt: r.approvedAt ?? null, rejectedBy: r.rejectedBy ?? null,
    rejectedAt: r.rejectedAt ?? null, rejectionReason: r.rejectionReason ?? null,
    generatedAt: r.generatedAt ?? new Date().toISOString(), appliedAt: r.appliedAt ?? null,
    version: r.version, isLatest: r.isLatest,
  };
}

// ── TYPES (unchanged) ─────────────────────────────────────────────────────────

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
export interface ElementRole { id: number; boqItemName: string; elementName: string; roleType: string; isDefault: boolean | null; description: string | null; createdAt: string }
export interface EvidenceRow { projectId: string | null; projectName: string | null; projectType: string | null; projectStatus: string | null; branch: string | null; qty: string | null; requestedQty: string | null; requestedAmount: string | null; clearedQty: string | null; clearedAmount: string | null; clearanceFactor: string | null }
export interface EvidenceSummary { totalProjects: number; avgClearanceFactor: string | null; zeroCleared: number; pctZeroCleared: string }
export interface EvidenceResponse { rows: EvidenceRow[]; summary: EvidenceSummary }
export interface ItemComparisonElement { elementName: string; elementUnit: string | null; hasStandard: boolean; stdQty: string | null; stdPrice: string | null; stdAmount: string | null; medianReqQty: string | null; totalReqQty: string | null; totalReqAmount: string | null; medianClrQty: string | null; totalClrQty: string | null; totalClrAmount: string | null; nProjects: number; nCleared: number }
export interface ItemComparisonResponse { elements: ItemComparisonElement[]; itemName: string; boqUnit: string | null }
export interface UnexecutedRow { boqItemName: string; elementName: string; totalRecords: number; zeroCleared: number; pctUnexecuted: string; avgRequestedQty: string | null; totalRequestedAmount: string; projectCount: number }
export interface UnexecutedReportResponse { rows: UnexecutedRow[]; totalUnexecuted: number }
export interface MatMaterial { id: number; canonicalName: string; canonicalNameEn: string | null; categoryId: number | null; categoryName: string | null; unit: string | null; description: string | null; isActive: boolean; aliases: string[] }
export interface MatCategory { id: number; nameAr: string; nameEn: string | null; sortOrder: number | null }
export interface MatMasterResponse { materials: MatMaterial[]; categories: MatCategory[] }
export interface MatCoeffRow { id: number; materialId: number; materialName: string; boqItemName: string; nProjects: number; nOutliers: number; meanCoeff: string | null; medianCoeff: string | null; stdCoeff: string | null; p75Coeff: string | null; p80Coeff: string | null; p90Coeff: string | null; minCoeff: string | null; maxCoeff: string | null; stabilityScore: string | null; coefficientOfVariation: string | null; confidenceScore: string | null; volatilityLevel: string | null; medianUnitPrice: string | null; p80UnitPrice: string | null }
export interface MatCoefficientsResponse { coefficients: MatCoeffRow[] }
export interface MatHistoricalStat { id: number; materialId: number; materialName: string; materialUnit: string; totalProjects: number | null; totalBoqItems: number | null; totalRecords: number | null; totalClearedQty: string | null; avgProjectDemand: string | null; medianProjectDemand: string | null; p75ProjectDemand: string | null; p80ProjectDemand: string | null; avgUnitPrice: string | null; medianUnitPrice: string | null; stabilityScore: string | null; volatilityLevel: string | null; topBoqItems: string | null }
export interface MatHistoricalStatsResponse { stats: MatHistoricalStat[] }
export interface ForecastInput { forecastName: string; projectType?: string; boqItems: Array<{ boqItemName: string; quantity: number }> }
export interface ForecastRow { materialId: number; materialName: string; unit: string; medianQty: number; p80Qty: number; p90Qty: number; predictedAmount: number; avgUnitPrice: number; confidence: number; nProjects: number; volatilityLevel: string; stabilityScore: number; boqContributions: Array<{ boqItemName: string; qty: number; coefficient: number }> }
export interface ForecastResponse { success: boolean; forecastId: number; forecast: ForecastRow[]; avgConfidence: number }
export interface ForecastSummary { id: number; forecastName: string; projectType: string | null; totalMaterials: number | null; avgConfidence: string | null; status: string | null; createdAt: string }
export interface ForecastDetail extends ForecastSummary { inputBoq: Array<{ boqItemName: string; quantity: number }>; outputForecast: ForecastRow[] }
export interface MatTopDemandResponse { materials: Array<{ materialId: number; name: string; unit: string; totalScore: number; projects: number; boqCount: number }> }
