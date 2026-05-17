import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPIs {
  total_items_analyzed: number;
  total_projects: number;
  total_rows_extracted: number;
  overall_consumption_rate: number | null;
  overall_over_allocation_pct: number | null;
  median_consumption_factor: number | null;
  items_with_poor_efficiency: number;
  items_with_excellent_efficiency: number;
}

interface AnalysisRow {
  element_id?: string;
  element_desc?: string;
  item_id?: string;
  item_desc?: string;
  gis_item_code?: string;
  gis_item_name?: string;
  n_projects: number;
  n_outliers: number;
  median_cf: number | null;
  mean_cf: number | null;
  p80_cf: number | null;
  p90_cf: number | null;
  std_cf: number | null;
  avg_over_alloc_pct: number | null;
  recommended_factor: number | null;
  avg_alloc_qty: number | null;
  avg_used_qty: number | null;
  efficiency_rating: string;
  has_consumption_data: boolean;
}

interface DashboardData {
  kpis: KPIs;
  analysis: AnalysisRow[];
  insights: {
    worst_over_allocated: AnalysisRow[];
    most_stable: AnalysisRow[];
    most_volatile: AnalysisRow[];
    efficiency_distribution: Record<string, number>;
  };
  has_consumption_data: boolean;
  column_samples: Record<string, string[]>;
}

interface StatusData {
  has_results: boolean;
  last_run: string | null;
  files_found: number;
  output_files: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined, decimals = 2): string => {
  if (v == null || !isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const fmtPct = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
};

const effColor = (rating: string) => {
  switch (rating) {
    case "excellent": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "good":      return "bg-green-500/20 text-green-300 border-green-500/30";
    case "moderate":  return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "poor":      return "bg-red-500/20 text-red-300 border-red-500/30";
    default:          return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }
};

function rowLabel(row: AnalysisRow): string {
  return (
    row.element_desc ||
    row.item_desc ||
    row.gis_item_name ||
    row.element_id ||
    row.item_id ||
    row.gis_item_code ||
    "—"
  );
}

function rowCode(row: AnalysisRow): string {
  return row.element_id || row.item_id || row.gis_item_code || "—";
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className="bg-card border-card-border">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
        <p
          className={`text-3xl font-bold tabular-nums ${accent ? "text-amber-400" : "text-foreground"}`}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Chart Image ─────────────────────────────────────────────────────────────

function ChartImage({ filename, title }: { filename: string; title: string }) {
  const [err, setErr] = useState(false);
  const src = `${API}/api/boq/chart/${filename}`;

  if (err) return null;

  return (
    <Card className="bg-card border-card-border overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <img
          src={src}
          alt={title}
          className="w-full object-contain"
          onError={() => setErr(true)}
        />
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<keyof AnalysisRow>("avg_over_alloc_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState<"overview" | "table" | "charts">("overview");

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/boq/analysis-status`);
      if (r.ok) setStatus(await r.json());
    } catch {}
  }, [API]);

  const loadData = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/boq/dashboard-data`);
      if (r.ok) {
        const json = await r.json();
        setData(json);
      }
    } catch {}
  }, [API]);

  useEffect(() => {
    loadStatus();
    loadData();
  }, [loadStatus, loadData]);

  const runAnalysis = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const r = await fetch(`${API}/api/boq/run-analysis`, { method: "POST" });
      const json = await r.json();
      if (!r.ok) {
        setRunError(json.error || "Analysis failed");
      } else {
        await loadData();
        await loadStatus();
      }
    } catch (e) {
      setRunError(String(e));
    } finally {
      setRunning(false);
    }
  };

  const download = (fileType: string) => {
    window.open(`${API}/api/boq/download/${fileType}`, "_blank");
  };

  const handleSort = (col: keyof AnalysisRow) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const sortedAnalysis = [...(data?.analysis ?? [])].sort((a, b) => {
    const av = a[sortCol] as number | null;
    const bv = b[sortCol] as number | null;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const kpis = data?.kpis;
  const hasData = !!data;
  const hasConsumption = data?.has_consumption_data ?? false;

  const chartFiles = [
    { filename: "alloc_vs_consumed.png", title: "Allocated vs Consumed Quantity" },
    { filename: "consumption_factor_dist.png", title: "Consumption Factor Distribution" },
    { filename: "efficiency_pie.png", title: "Efficiency Rating Distribution" },
    { filename: "over_allocation_ranking.png", title: "Top Items — Highest Over-Allocation" },
    { filename: "element_qty_ranking.png", title: "Elements by Total Quantity" },
  ];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "table", label: `Analysis Table${data ? ` (${data.analysis.length})` : ""}` },
    { id: "charts", label: "Charts" },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground" dir="ltr">
      {/* ─── Header ─── */}
      <header className="border-b border-border bg-sidebar px-6 py-4">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              BOQ Consumption Analytics
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {status?.files_found
                ? `${status.files_found} HTML source file${status.files_found !== 1 ? "s" : ""} · `
                : ""}
              {status?.last_run
                ? `Last run: ${new Date(status.last_run).toLocaleString()}`
                : hasData
                ? "Results loaded from cache"
                : "No results yet — run analysis to begin"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hasData && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => download("csv")}
                  className="text-xs border-border hover:bg-muted"
                >
                  Download CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => download("excel")}
                  className="text-xs border-border hover:bg-muted"
                >
                  Download Excel
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={runAnalysis}
              disabled={running}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs"
            >
              {running ? "Running…" : "Run Analysis"}
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Error Banner ─── */}
      {runError && (
        <div className="bg-red-900/30 border-b border-red-800 text-red-300 text-sm px-6 py-3">
          <span className="font-semibold">Error: </span>{runError}
        </div>
      )}

      <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {/* ─── Status ─── */}
        {!hasData && (
          <Card className="bg-card border-card-border">
            <CardContent className="pt-6 pb-5 text-center space-y-3">
              <p className="text-muted-foreground text-sm">
                No analysis results found.{" "}
                {status?.files_found
                  ? `${status.files_found} HTML file${status.files_found > 1 ? "s" : ""} available.`
                  : ""}
              </p>
              <Button
                onClick={runAnalysis}
                disabled={running}
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
              >
                {running ? "Running Analysis…" : "Run Analysis Now"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── KPI Cards ─── */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total Records"
              value={kpis.total_rows_extracted.toLocaleString()}
              sub={`from ${kpis.total_projects} source file${kpis.total_projects !== 1 ? "s" : ""}`}
            />
            <KpiCard
              label="Items Analyzed"
              value={kpis.total_items_analyzed.toLocaleString()}
              sub="BOQ item groups"
            />
            {hasConsumption ? (
              <>
                <KpiCard
                  label="Consumption Rate"
                  value={
                    kpis.overall_consumption_rate != null
                      ? `${(kpis.overall_consumption_rate * 100).toFixed(1)}%`
                      : "—"
                  }
                  sub="consumed / allocated"
                  accent={
                    kpis.overall_consumption_rate != null &&
                    kpis.overall_consumption_rate < 0.7
                  }
                />
                <KpiCard
                  label="Over-Allocation"
                  value={
                    kpis.overall_over_allocation_pct != null
                      ? `${kpis.overall_over_allocation_pct.toFixed(1)}%`
                      : "—"
                  }
                  sub="allocated – consumed"
                  accent={
                    kpis.overall_over_allocation_pct != null &&
                    kpis.overall_over_allocation_pct > 20
                  }
                />
              </>
            ) : (
              <>
                <KpiCard
                  label="Poor Efficiency"
                  value={kpis.items_with_poor_efficiency.toString()}
                  sub="items below 50%"
                  accent={kpis.items_with_poor_efficiency > 0}
                />
                <KpiCard
                  label="Excellent Efficiency"
                  value={kpis.items_with_excellent_efficiency.toString()}
                  sub="items above 90%"
                />
              </>
            )}
          </div>
        )}

        {/* ─── Tabs ─── */}
        {hasData && (
          <>
            <div className="flex gap-1 border-b border-border">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === t.id
                      ? "border-amber-500 text-amber-400"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ─── Overview Tab ─── */}
            {activeTab === "overview" && (
              <div className="grid md:grid-cols-2 gap-4">
                {/* Efficiency distribution */}
                {data.insights.efficiency_distribution &&
                  Object.keys(data.insights.efficiency_distribution).length > 0 && (
                    <Card className="bg-card border-card-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">
                          Efficiency Distribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {Object.entries(data.insights.efficiency_distribution).map(
                          ([rating, count]) => (
                            <div key={rating} className="flex items-center justify-between">
                              <Badge
                                variant="outline"
                                className={`text-xs capitalize ${effColor(rating)}`}
                              >
                                {rating}
                              </Badge>
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 rounded-full bg-amber-500/60"
                                  style={{
                                    width: `${Math.max(
                                      8,
                                      (count /
                                        Math.max(
                                          1,
                                          Object.values(
                                            data.insights.efficiency_distribution
                                          ).reduce((a, b) => a + b, 0)
                                        )) *
                                        120
                                    )}px`,
                                  }}
                                />
                                <span className="text-sm tabular-nums text-foreground">
                                  {count}
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </CardContent>
                    </Card>
                  )}

                {/* Worst over-allocated */}
                {data.insights.worst_over_allocated.length > 0 && (
                  <Card className="bg-card border-card-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">
                        Highest Over-Allocation
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data.insights.worst_over_allocated.slice(0, 8).map((row, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm gap-2"
                        >
                          <span
                            className="truncate text-foreground max-w-[200px]"
                            title={rowLabel(row)}
                          >
                            {rowLabel(row)}
                          </span>
                          <span
                            className={`tabular-nums font-medium text-xs shrink-0 ${
                              (row.avg_over_alloc_pct ?? 0) > 50
                                ? "text-red-400"
                                : "text-yellow-400"
                            }`}
                          >
                            {fmtPct(row.avg_over_alloc_pct)}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Data quality card */}
                <Card className="bg-card border-card-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Data Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Source files</span>
                      <span className="tabular-nums">{kpis?.total_projects ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total records</span>
                      <span className="tabular-nums">
                        {kpis?.total_rows_extracted?.toLocaleString() ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Analysis groups</span>
                      <span className="tabular-nums">{data.analysis.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Consumption data</span>
                      <Badge
                        variant="outline"
                        className={hasConsumption
                          ? "text-emerald-300 border-emerald-500/30 text-xs"
                          : "text-slate-400 border-slate-500/30 text-xs"}
                      >
                        {hasConsumption ? "Available" : "Not available"}
                      </Badge>
                    </div>
                    {kpis?.median_consumption_factor != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Median CF</span>
                        <span className="tabular-nums">
                          {fmt(kpis.median_consumption_factor, 4)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Most stable / volatile */}
                {data.insights.most_stable.length > 0 && (
                  <Card className="bg-card border-card-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">
                        Most Stable Items (lowest std deviation)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data.insights.most_stable.slice(0, 6).map((row, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm gap-2"
                        >
                          <span
                            className="truncate text-foreground max-w-[200px]"
                            title={rowLabel(row)}
                          >
                            {rowLabel(row)}
                          </span>
                          <span className="tabular-nums text-xs text-emerald-400 shrink-0">
                            σ={fmt(row.std_cf, 3)}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ─── Analysis Table Tab ─── */}
            {activeTab === "table" && (
              <Card className="bg-card border-card-border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground text-xs w-[60px]">Code</TableHead>
                        <TableHead className="text-muted-foreground text-xs min-w-[160px]">Description</TableHead>
                        <TableHead
                          className="text-muted-foreground text-xs text-right cursor-pointer hover:text-foreground"
                          onClick={() => handleSort("n_projects")}
                        >
                          N{sortCol === "n_projects" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </TableHead>
                        {hasConsumption && (
                          <>
                            <TableHead
                              className="text-muted-foreground text-xs text-right cursor-pointer hover:text-foreground"
                              onClick={() => handleSort("median_cf")}
                            >
                              Med CF{sortCol === "median_cf" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                            </TableHead>
                            <TableHead
                              className="text-muted-foreground text-xs text-right cursor-pointer hover:text-foreground"
                              onClick={() => handleSort("p80_cf")}
                            >
                              P80 CF{sortCol === "p80_cf" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                            </TableHead>
                            <TableHead
                              className="text-muted-foreground text-xs text-right cursor-pointer hover:text-foreground"
                              onClick={() => handleSort("avg_over_alloc_pct")}
                            >
                              Avg Over-Alloc%{sortCol === "avg_over_alloc_pct" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                            </TableHead>
                            <TableHead
                              className="text-muted-foreground text-xs text-right cursor-pointer hover:text-foreground"
                              onClick={() => handleSort("recommended_factor")}
                            >
                              Rec. Factor{sortCol === "recommended_factor" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                            </TableHead>
                          </>
                        )}
                        <TableHead
                          className="text-muted-foreground text-xs text-right cursor-pointer hover:text-foreground"
                          onClick={() => handleSort("avg_alloc_qty")}
                        >
                          Avg Alloc{sortCol === "avg_alloc_qty" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </TableHead>
                        {hasConsumption && (
                          <TableHead
                            className="text-muted-foreground text-xs text-right cursor-pointer hover:text-foreground"
                            onClick={() => handleSort("avg_used_qty")}
                          >
                            Avg Used{sortCol === "avg_used_qty" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                          </TableHead>
                        )}
                        <TableHead className="text-muted-foreground text-xs text-right">
                          Efficiency
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAnalysis.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={10}
                            className="text-center text-muted-foreground py-8"
                          >
                            No analysis results
                          </TableCell>
                        </TableRow>
                      )}
                      {sortedAnalysis.map((row, i) => (
                        <TableRow key={i} className="border-border hover:bg-muted/30">
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {rowCode(row)}
                          </TableCell>
                          <TableCell className="text-xs text-foreground max-w-[220px]">
                            <span title={rowLabel(row)} className="line-clamp-2">
                              {rowLabel(row)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {row.n_projects}
                            {row.n_outliers > 0 && (
                              <span className="text-yellow-500 ml-1">
                                ({row.n_outliers}!)
                              </span>
                            )}
                          </TableCell>
                          {hasConsumption && (
                            <>
                              <TableCell className="text-right text-xs tabular-nums">
                                {fmt(row.median_cf, 3)}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {fmt(row.p80_cf, 3)}
                              </TableCell>
                              <TableCell
                                className={`text-right text-xs tabular-nums font-medium ${
                                  (row.avg_over_alloc_pct ?? 0) > 50
                                    ? "text-red-400"
                                    : (row.avg_over_alloc_pct ?? 0) > 20
                                    ? "text-yellow-400"
                                    : "text-emerald-400"
                                }`}
                              >
                                {fmtPct(row.avg_over_alloc_pct)}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums text-amber-400">
                                {fmt(row.recommended_factor, 3)}
                              </TableCell>
                            </>
                          )}
                          <TableCell className="text-right text-xs tabular-nums">
                            {fmt(row.avg_alloc_qty, 0)}
                          </TableCell>
                          {hasConsumption && (
                            <TableCell className="text-right text-xs tabular-nums">
                              {fmt(row.avg_used_qty, 0)}
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={`text-xs capitalize ${effColor(row.efficiency_rating)}`}
                            >
                              {row.efficiency_rating}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}

            {/* ─── Charts Tab ─── */}
            {activeTab === "charts" && (
              <div className="grid md:grid-cols-2 gap-4">
                {chartFiles.map((c) => (
                  <ChartImage key={c.filename} {...c} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── Download Footer ─── */}
        {hasData && (
          <div className="flex gap-3 flex-wrap pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground self-center">Export:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => download("csv")}
              className="text-xs border-border hover:bg-muted"
            >
              Analysis Results CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => download("master-csv")}
              className="text-xs border-border hover:bg-muted"
            >
              Master Dataset CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => download("excel")}
              className="text-xs border-border hover:bg-muted"
            >
              Full Excel Workbook
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
