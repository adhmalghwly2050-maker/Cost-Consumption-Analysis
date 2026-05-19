import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtMoney = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}م`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}ألف`;
  return v.toLocaleString("ar");
};
const fmtMoneyFull = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return "—";
  return v.toLocaleString("ar-YE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};
const fmtPct = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface OpenProject {
  projectId: string; projectName: string; projectType: string;
  status: string; branch: string;
  totalRequests: number; totalCleared: number;
  remaining: number; clearancePct: number; elementCount: number;
}
interface OpenCustodiesSummary {
  totalProjects: number; totalRequests: number; totalCleared: number;
  totalRemaining: number; overallClearancePct: number;
  byStatus: Record<string, number>;
  byType: { type: string; count: number; remaining: number }[];
}
interface OpenCustodiesData { projects: OpenProject[]; summary: OpenCustodiesSummary }

interface OverAllocAlert {
  boqItemName: string; elementName: string; elementCode: string | null;
  totalReqAmt: number; totalClrAmt: number;
  gapAmt: number; gapPct: number;
  totalReqQty: number; totalClrQty: number; gapQty: number;
  nRecords: number; nZeroCleared: number; pctNeverCleared: number;
  projectTypes: string[]; severity: string;
}
interface OverAllocSummary {
  totalAlerts: number; highSeverity: number; medSeverity: number;
  totalGapAmt: number; totalReqAmt: number; overallGapPct: number;
}
interface OverAllocData { alerts: OverAllocAlert[]; summary: OverAllocSummary }

interface TimelineMonth {
  month: string; label: string; reqAmt: number; clrAmt: number; gap: number;
  byType: Record<string, { req: number; clr: number }>;
}
interface TimelineData {
  timeline: TimelineMonth[];
  summary: { totalMonths: number; totalReqAmt: number; totalClrAmt: number; totalGap: number; peakMonth: string | null };
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = "default" }: {
  label: string; value: string; sub?: string;
  color?: "default" | "amber" | "red" | "green" | "orange";
}) {
  const colors = {
    default: "text-foreground",
    amber: "text-amber-400",
    red: "text-red-400",
    green: "text-emerald-400",
    orange: "text-orange-400",
  };
  return (
    <Card className="bg-card border-card-border">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1 text-right">{label}</p>
        <p className={`text-2xl font-bold tabular-nums text-right ${colors[color]}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1 text-right">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ pct, color = "amber" }: { pct: number; color?: "amber" | "red" | "green" | "blue" }) {
  const colors = { amber: "bg-amber-500", red: "bg-red-500", green: "bg-emerald-500", blue: "bg-blue-500" };
  const safe = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-full bg-muted/40 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colors[color]}`} style={{ width: `${safe}%` }} />
    </div>
  );
}

// ─── Severity Badge ───────────────────────────────────────────────────────────
function SeverityBadge({ s }: { s: string }) {
  const cls =
    s === "عالية" ? "bg-red-500/20 text-red-300 border-red-500/30" :
    s === "متوسطة" ? "bg-orange-500/20 text-orange-300 border-orange-500/30" :
    "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  return <Badge variant="outline" className={`text-xs ${cls}`}>{s}</Badge>;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ s }: { s: string }) {
  const cls =
    s === "جاري" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
    s === "جاري الاقفال" ? "bg-orange-500/20 text-orange-300 border-orange-500/30" :
    "bg-slate-500/20 text-slate-400 border-slate-500/30";
  return <Badge variant="outline" className={`text-xs ${cls}`}>{s}</Badge>;
}

// ─── Custom Tooltip for Charts ────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-sidebar border border-border rounded-lg p-3 text-xs shadow-xl min-w-[160px]" dir="rtl">
      <p className="text-muted-foreground mb-2 font-medium">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="tabular-nums font-bold text-foreground">{fmtMoney(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Open Custodies Tab ───────────────────────────────────────────────────────
function OpenCustodiesTab() {
  const [data, setData] = useState<OpenCustodiesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("الكل");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [sortCol, setSortCol] = useState<"remaining" | "clearancePct" | "totalRequests">("remaining");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    fetch(`${API}/api/boq/open-custodies`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-muted-foreground py-12 text-sm">جاري التحميل…</div>;
  if (!data) return <div className="text-center text-muted-foreground py-12 text-sm">لا توجد بيانات</div>;

  const { projects, summary } = data;

  const allTypes = ["الكل", ...Array.from(new Set(projects.map(p => p.projectType).filter(Boolean)))];
  const allStatuses = ["الكل", ...Array.from(new Set(projects.map(p => p.status).filter(Boolean)))];

  const filtered = projects
    .filter(p => filterType === "الكل" || p.projectType === filterType)
    .filter(p => filterStatus === "الكل" || p.status === filterStatus)
    .filter(p => !search || p.projectName.includes(search) || p.projectId.includes(search))
    .sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      return sortDir === "desc" ? bv - av : av - bv;
    });

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };
  const sortIcon = (col: typeof sortCol) => sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div className="space-y-4" dir="rtl">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="مشاريع مفتوحة" value={summary.totalProjects.toString()} color="amber" />
        <KpiCard label="إجمالي التعزيز" value={fmtMoney(summary.totalRequests)} sub="مجموع جميع المشاريع" />
        <KpiCard label="إجمالي الإخلاء" value={fmtMoney(summary.totalCleared)} color="green" />
        <KpiCard
          label="المبلغ غير المخلى"
          value={fmtMoney(summary.totalRemaining)}
          sub={`${fmtPct(100 - summary.overallClearancePct)} من الإجمالي`}
          color="red"
        />
      </div>

      {/* Overall progress */}
      <Card className="bg-card border-card-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">نسبة الإخلاء الإجمالية</span>
            <span className="text-sm font-bold text-emerald-400">{fmtPct(summary.overallClearancePct)}</span>
          </div>
          <ProgressBar pct={summary.overallClearancePct} color="green" />
          <div className="flex gap-6 mt-3 text-xs text-muted-foreground">
            {Object.entries(summary.byStatus).map(([s, n]) => (
              <span key={s}><StatusBadge s={s} /> {n} مشروع</span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Breakdown by type */}
      {summary.byType.length > 0 && (
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-muted-foreground">المتبقي حسب نوع المشروع</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.byType.map(t => {
              const pct = summary.totalRemaining > 0 ? (t.remaining / summary.totalRemaining) * 100 : 0;
              return (
                <div key={t.type} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground font-medium">{t.type || "غير محدد"}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{t.count} مشروع</span>
                      <span className="text-amber-400 font-bold tabular-nums">{fmtMoney(t.remaining)}</span>
                    </div>
                  </div>
                  <ProgressBar pct={pct} color="amber" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="text"
          placeholder="بحث باسم أو رقم المشروع…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500 w-64"
          dir="rtl"
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
          dir="rtl"
        >
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
          dir="rtl"
        >
          {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground mr-auto">{filtered.length} مشروع</span>
      </div>

      {/* Projects Table */}
      <Card className="bg-card border-card-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent" dir="rtl">
                <TableHead className="text-muted-foreground text-xs text-right">اسم المشروع</TableHead>
                <TableHead className="text-muted-foreground text-xs text-right">النوع</TableHead>
                <TableHead className="text-muted-foreground text-xs text-right">الحالة</TableHead>
                <TableHead
                  className="text-muted-foreground text-xs text-left cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort("totalRequests")}
                >
                  التعزيز{sortIcon("totalRequests")}
                </TableHead>
                <TableHead
                  className="text-muted-foreground text-xs text-left cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort("remaining")}
                >
                  المتبقي{sortIcon("remaining")}
                </TableHead>
                <TableHead
                  className="text-muted-foreground text-xs text-left cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort("clearancePct")}
                >
                  الإخلاء%{sortIcon("clearancePct")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد نتائج</TableCell>
                </TableRow>
              )}
              {filtered.map((p, i) => (
                <TableRow key={i} className="border-border hover:bg-muted/20" dir="rtl">
                  <TableCell className="text-xs">
                    <div className="font-medium text-foreground truncate max-w-[220px]" title={p.projectName}>
                      {p.projectName || <span className="text-muted-foreground italic">{p.projectId}</span>}
                    </div>
                    <div className="text-muted-foreground font-mono text-[10px] mt-0.5">{p.projectId}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.projectType || "—"}</TableCell>
                  <TableCell><StatusBadge s={p.status} /></TableCell>
                  <TableCell className="text-left text-xs tabular-nums">{fmtMoneyFull(p.totalRequests)}</TableCell>
                  <TableCell className={`text-left text-xs tabular-nums font-bold ${p.remaining > 100000 ? "text-red-400" : p.remaining > 30000 ? "text-orange-400" : "text-yellow-400"}`}>
                    {fmtMoneyFull(p.remaining)}
                  </TableCell>
                  <TableCell className="text-left min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <ProgressBar pct={p.clearancePct} color={p.clearancePct >= 80 ? "green" : p.clearancePct >= 50 ? "amber" : "red"} />
                      <span className={`text-xs tabular-nums shrink-0 ${p.clearancePct >= 80 ? "text-emerald-400" : p.clearancePct >= 50 ? "text-amber-400" : "text-red-400"}`}>
                        {fmtPct(p.clearancePct)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ─── Over-Allocation Alerts Tab ───────────────────────────────────────────────
function OverAllocAlertsTab() {
  const [data, setData] = useState<OverAllocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterSev, setFilterSev] = useState("الكل");
  const [showChart, setShowChart] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/boq/over-allocation-alerts`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-muted-foreground py-12 text-sm">جاري التحميل…</div>;
  if (!data) return <div className="text-center text-muted-foreground py-12 text-sm">لا توجد بيانات</div>;

  const { alerts, summary } = data;
  const filtered = filterSev === "الكل" ? alerts : alerts.filter(a => a.severity === filterSev);

  const chartData = alerts.slice(0, 10).map(a => ({
    name: a.elementName.length > 18 ? a.elementName.slice(0, 18) + "…" : a.elementName,
    "التعزيز": Math.round(a.totalReqAmt),
    "الإخلاء": Math.round(a.totalClrAmt),
    "الفجوة": Math.round(a.gapAmt),
  }));

  return (
    <div className="space-y-4" dir="rtl">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="بنود بها فجوة" value={summary.totalAlerts.toString()} color="amber" />
        <KpiCard label="تنبيهات عالية" value={summary.highSeverity.toString()} color="red"
          sub={`${summary.medSeverity} متوسطة`} />
        <KpiCard label="إجمالي الفجوة" value={fmtMoney(summary.totalGapAmt)}
          sub="مجموع التعزيز غير المخلى" color="red" />
        <KpiCard label="نسبة الفجوة" value={fmtPct(summary.overallGapPct)}
          color={summary.overallGapPct > 40 ? "red" : "orange"} />
      </div>

      {/* Bar Chart */}
      {showChart && chartData.length > 0 && (
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2 pt-4 flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">أعلى 10 عناصر بالفجوة (تعزيز مقابل إخلاء)</CardTitle>
            <button onClick={() => setShowChart(false)} className="text-muted-foreground hover:text-foreground text-xs">إخفاء</button>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => fmtMoney(v)} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }} />
                <Bar dataKey="التعزيز" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="الإخلاء" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-2 items-center">
        {["الكل", "عالية", "متوسطة", "منخفضة"].map(s => (
          <button
            key={s}
            onClick={() => setFilterSev(s)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filterSev === s
                ? "bg-amber-500 border-amber-500 text-black font-bold"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s} {s !== "الكل" && `(${alerts.filter(a => a.severity === s).length})`}
          </button>
        ))}
        <span className="text-xs text-muted-foreground mr-auto">{filtered.length} بند</span>
      </div>

      {/* Alerts Table */}
      <Card className="bg-card border-card-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent" dir="rtl">
                <TableHead className="text-muted-foreground text-xs text-right">البند / العنصر</TableHead>
                <TableHead className="text-muted-foreground text-xs text-right">الأهمية</TableHead>
                <TableHead className="text-muted-foreground text-xs text-left">التعزيز الكلي</TableHead>
                <TableHead className="text-muted-foreground text-xs text-left">الإخلاء الكلي</TableHead>
                <TableHead className="text-muted-foreground text-xs text-left">الفجوة</TableHead>
                <TableHead className="text-muted-foreground text-xs text-left">الفجوة%</TableHead>
                <TableHead className="text-muted-foreground text-xs text-right">أنواع المشاريع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا توجد تنبيهات</TableCell>
                </TableRow>
              )}
              {filtered.map((a, i) => (
                <TableRow key={i} className="border-border hover:bg-muted/20" dir="rtl">
                  <TableCell className="text-xs">
                    <div className="font-medium text-foreground">{a.elementName}</div>
                    <div className="text-muted-foreground text-[10px] mt-0.5">{a.boqItemName}</div>
                  </TableCell>
                  <TableCell><SeverityBadge s={a.severity} /></TableCell>
                  <TableCell className="text-left text-xs tabular-nums text-foreground">{fmtMoneyFull(a.totalReqAmt)}</TableCell>
                  <TableCell className="text-left text-xs tabular-nums text-emerald-400">{fmtMoneyFull(a.totalClrAmt)}</TableCell>
                  <TableCell className="text-left text-xs tabular-nums font-bold text-red-400">{fmtMoneyFull(a.gapAmt)}</TableCell>
                  <TableCell className="text-left min-w-[110px]">
                    <div className="flex items-center gap-2">
                      <ProgressBar pct={a.gapPct} color={a.gapPct > 60 ? "red" : a.gapPct > 30 ? "amber" : "blue"} />
                      <span className={`text-xs tabular-nums shrink-0 ${a.gapPct > 60 ? "text-red-400" : "text-orange-400"}`}>
                        {fmtPct(a.gapPct)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="flex flex-wrap gap-1">
                      {a.projectTypes.slice(0, 3).map((t, ti) => (
                        <span key={ti} className="bg-muted/40 px-1.5 py-0.5 rounded text-[10px]">{t}</span>
                      ))}
                      {a.projectTypes.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{a.projectTypes.length - 3}</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ─── Monthly Timeline Tab ─────────────────────────────────────────────────────
function MonthlyTimelineTab() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"chart" | "table">("chart");

  useEffect(() => {
    fetch(`${API}/api/boq/monthly-timeline`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-muted-foreground py-12 text-sm">جاري التحميل…</div>;
  if (!data || data.timeline.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12 space-y-2">
        <p className="text-sm">لا تتوفر بيانات زمنية</p>
        <p className="text-xs">يتطلب هذا القسم ملف master_dataset.csv المولّد من تشغيل التحليل</p>
        <p className="text-xs">اضغط "تشغيل التحليل" أولاً لتوليد البيانات</p>
      </div>
    );
  }

  const { timeline, summary } = data;

  const chartData = timeline.map(m => ({
    name: m.label,
    "التعزيز": Math.round(m.reqAmt),
    "الإخلاء": Math.round(m.clrAmt),
    "الفجوة": Math.round(m.gap),
  }));

  const maxMonth = timeline.reduce((best, m) => m.reqAmt > best.reqAmt ? m : best, timeline[0]);
  const worstGap = timeline.reduce((best, m) => m.gap > best.gap ? m : best, timeline[0]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="أشهر في البيانات" value={summary.totalMonths.toString()} />
        <KpiCard label="إجمالي التعزيز" value={fmtMoney(summary.totalReqAmt)} color="amber" />
        <KpiCard label="إجمالي الإخلاء" value={fmtMoney(summary.totalClrAmt)} color="green" />
        <KpiCard label="الفجوة الكلية" value={fmtMoney(summary.totalGap)} color="red" />
      </div>

      {/* Highlights */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card className="bg-card border-card-border">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="text-2xl">📈</div>
            <div>
              <p className="text-xs text-muted-foreground">أعلى شهر تعزيزاً</p>
              <p className="text-base font-bold text-amber-400">{maxMonth.label}</p>
              <p className="text-xs text-muted-foreground">{fmtMoneyFull(maxMonth.reqAmt)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="text-2xl">⚠️</div>
            <div>
              <p className="text-xs text-muted-foreground">أكبر فجوة شهرية</p>
              <p className="text-base font-bold text-red-400">{worstGap.label}</p>
              <p className="text-xs text-muted-foreground">فجوة {fmtMoneyFull(worstGap.gap)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        {(["chart", "table"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              view === v
                ? "bg-amber-500 border-amber-500 text-black font-bold"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {v === "chart" ? "📊 رسم بياني" : "📋 جدول"}
          </button>
        ))}
      </div>

      {/* Chart */}
      {view === "chart" && (
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-muted-foreground">التعزيز والإخلاء شهراً بشهر</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 9 }}
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => fmtMoney(v)} width={65} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 12 }} />
                <Bar dataKey="التعزيز" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="الإخلاء" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {view === "table" && (
        <Card className="bg-card border-card-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent" dir="rtl">
                  <TableHead className="text-muted-foreground text-xs text-right">الشهر</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-left">التعزيز</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-left">الإخلاء</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-left">الفجوة</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-left">نسبة الإخلاء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...timeline].reverse().map((m, i) => {
                  const clrPct = m.reqAmt > 0 ? (m.clrAmt / m.reqAmt) * 100 : 0;
                  return (
                    <TableRow key={i} className="border-border hover:bg-muted/20" dir="rtl">
                      <TableCell className="text-xs font-medium text-foreground">{m.label}</TableCell>
                      <TableCell className="text-left text-xs tabular-nums text-amber-400">{fmtMoneyFull(m.reqAmt)}</TableCell>
                      <TableCell className="text-left text-xs tabular-nums text-emerald-400">{fmtMoneyFull(m.clrAmt)}</TableCell>
                      <TableCell className={`text-left text-xs tabular-nums font-bold ${m.gap > 100000 ? "text-red-400" : "text-orange-400"}`}>
                        {fmtMoneyFull(m.gap)}
                      </TableCell>
                      <TableCell className="text-left min-w-[110px]">
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={clrPct} color={clrPct >= 80 ? "green" : clrPct >= 50 ? "amber" : "red"} />
                          <span className="text-xs tabular-nums shrink-0 text-muted-foreground">{fmtPct(clrPct)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"custodies" | "alerts" | "timeline" | "legacy">("custodies");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [hasLegacyData, setHasLegacyData] = useState(false);
  const [dbHasData, setDbHasData] = useState(false);

  const hasAnalysisRef = useRef(false);

  useEffect(() => {
    fetch(`${API}/api/boq/analysis-status`)
      .then(r => r.json())
      .then(d => { if (d.has_results) setHasLegacyData(true); })
      .catch(() => {});
    fetch(`${API}/api/boq/batches`)
      .then(r => r.json())
      .then(d => { if (d.batches?.length > 0) setDbHasData(true); })
      .catch(() => {});
  }, []);

  const runAnalysis = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const r = await fetch(`${API}/api/boq/run-analysis`, { method: "POST" });
      const json = await r.json();
      if (!r.ok) setRunError(json.error || "فشل التحليل");
      else { setHasLegacyData(true); hasAnalysisRef.current = true; }
    } catch (e) { setRunError(String(e)); }
    finally { setRunning(false); }
  };

  const tabs = [
    { id: "custodies" as const, label: "📋 لوحة العهد", sub: "المشاريع المفتوحة" },
    { id: "alerts" as const,    label: "⚠️ تنبيهات",    sub: "إفراط في التعزيز" },
    { id: "timeline" as const,  label: "📅 المتابعة",    sub: "شهر بشهر" },
    { id: "legacy" as const,    label: "📊 التحليل",     sub: "الإحصاء التفصيلي" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* ─── Header ─── */}
      <header className="border-b border-border bg-sidebar px-6 py-4 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              لوحة متابعة العهد — فرع الحديدة
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              مراقبة التعزيز والإخلاء لبنود أعمال المنهولات
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={runAnalysis}
              disabled={running}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs"
            >
              {running ? "جاري التحليل…" : "تشغيل التحليل"}
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Error Banner ─── */}
      {runError && (
        <div className="bg-red-900/30 border-b border-red-800 text-red-300 text-sm px-6 py-3 text-right">
          <span className="font-semibold">خطأ: </span>{runError}
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="border-b border-border bg-sidebar/50 sticky top-[73px] z-10">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex gap-0">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-5 py-3 text-sm border-b-2 -mb-px transition-colors flex flex-col items-center gap-0.5 ${
                  activeTab === t.id
                    ? "border-amber-500 text-amber-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="font-medium">{t.label}</span>
                <span className="text-[10px] opacity-60">{t.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="max-w-screen-xl mx-auto px-6 py-6">
        {activeTab === "custodies" && <OpenCustodiesTab />}
        {activeTab === "alerts"    && <OverAllocAlertsTab />}
        {activeTab === "timeline"  && <MonthlyTimelineTab />}
        {activeTab === "legacy"    && <LegacyAnalyticsTab hasData={hasLegacyData} runAnalysis={runAnalysis} running={running} />}
      </div>
    </div>
  );
}

// ─── Legacy Analytics Tab (original dashboard) ───────────────────────────────
interface AnalysisRow {
  element_id?: string; element_desc?: string;
  item_id?: string; item_desc?: string;
  gis_item_code?: string; gis_item_name?: string;
  n_projects: number; n_outliers: number;
  median_cf: number | null; mean_cf: number | null;
  p80_cf: number | null; p90_cf: number | null; std_cf: number | null;
  avg_over_alloc_pct: number | null; recommended_factor: number | null;
  avg_alloc_qty: number | null; avg_used_qty: number | null;
  efficiency_rating: string; has_consumption_data: boolean;
}
interface DashboardData {
  kpis: {
    total_items_analyzed: number; total_projects: number;
    total_rows_extracted: number; overall_consumption_rate: number | null;
    overall_over_allocation_pct: number | null; median_consumption_factor: number | null;
    items_with_poor_efficiency: number; items_with_excellent_efficiency: number;
  };
  analysis: AnalysisRow[];
  insights: {
    worst_over_allocated: AnalysisRow[];
    most_stable: AnalysisRow[];
    efficiency_distribution: Record<string, number>;
  };
  has_consumption_data: boolean;
}

function LegacyAnalyticsTab({ hasData, runAnalysis, running }: { hasData: boolean; runAnalysis: () => void; running: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeInner, setActiveInner] = useState<"overview" | "table" | "charts">("overview");
  const [sortCol, setSortCol] = useState<keyof AnalysisRow>("avg_over_alloc_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (hasData) {
      fetch(`${API}/api/boq/dashboard-data`)
        .then(r => r.json())
        .then(setData)
        .catch(() => {});
    }
  }, [hasData]);

  const fmt = (v: number | null | undefined, d = 2) =>
    v == null || !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtPctLocal = (v: number | null | undefined) =>
    v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const effColor = (r: string) =>
    r === "excellent" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
    r === "good"      ? "bg-green-500/20 text-green-300 border-green-500/30" :
    r === "moderate"  ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" :
    r === "poor"      ? "bg-red-500/20 text-red-300 border-red-500/30" :
                        "bg-slate-500/20 text-slate-400 border-slate-500/30";
  const rowLabel = (row: AnalysisRow) => row.element_desc || row.item_desc || row.gis_item_name || row.element_id || row.item_id || "—";
  const rowCode  = (row: AnalysisRow) => row.element_id || row.item_id || row.gis_item_code || "—";

  const handleSort = (col: keyof AnalysisRow) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortedAnalysis = [...(data?.analysis ?? [])].sort((a, b) => {
    const av = a[sortCol] as number | null, bv = b[sortCol] as number | null;
    if (av == null && bv == null) return 0;
    if (av == null) return 1; if (bv == null) return -1;
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  if (!hasData || !data) {
    return (
      <div dir="rtl" className="space-y-4">
        <Card className="bg-card border-card-border">
          <CardContent className="pt-6 pb-5 text-center space-y-3">
            <p className="text-muted-foreground text-sm">لا توجد نتائج تحليل بعد.</p>
            <Button onClick={runAnalysis} disabled={running} className="bg-amber-500 hover:bg-amber-400 text-black font-semibold">
              {running ? "جاري التحليل…" : "تشغيل التحليل الآن"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { kpis, insights } = data;
  const hasConsumption = data.has_consumption_data;
  const chartFiles = [
    { filename: "alloc_vs_consumed.png", title: "الكمية المخصصة مقابل المستهلكة" },
    { filename: "consumption_factor_dist.png", title: "توزيع معامل الاستهلاك" },
    { filename: "efficiency_pie.png", title: "توزيع تقييم الكفاءة" },
    { filename: "over_allocation_ranking.png", title: "أعلى البنود زيادةً في التخصيص" },
    { filename: "element_qty_ranking.png", title: "العناصر حسب الكمية الكلية" },
  ];

  return (
    <div dir="rtl" className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="السجلات الكلية" value={kpis.total_rows_extracted.toLocaleString()} sub={`من ${kpis.total_projects} ملف مصدر`} />
        <KpiCard label="البنود المحللة" value={kpis.total_items_analyzed.toLocaleString()} />
        {hasConsumption ? (
          <>
            <KpiCard
              label="معدل الاستهلاك"
              value={kpis.overall_consumption_rate != null ? `${(kpis.overall_consumption_rate * 100).toFixed(1)}%` : "—"}
              color={kpis.overall_consumption_rate != null && kpis.overall_consumption_rate < 0.7 ? "amber" : "default"}
            />
            <KpiCard
              label="الزيادة في التخصيص"
              value={kpis.overall_over_allocation_pct != null ? `${kpis.overall_over_allocation_pct.toFixed(1)}%` : "—"}
              color={kpis.overall_over_allocation_pct != null && kpis.overall_over_allocation_pct > 20 ? "red" : "default"}
            />
          </>
        ) : (
          <>
            <KpiCard label="كفاءة ضعيفة" value={kpis.items_with_poor_efficiency.toString()} color={kpis.items_with_poor_efficiency > 0 ? "red" : "default"} />
            <KpiCard label="كفاءة ممتازة" value={kpis.items_with_excellent_efficiency.toString()} color="green" />
          </>
        )}
      </div>

      {/* Inner Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["overview","نظرة عامة"],["table","جدول التحليل"],["charts","الرسوم البيانية"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveInner(id as typeof activeInner)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeInner === id ? "border-amber-500 text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >{label}</button>
        ))}
      </div>

      {activeInner === "overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          {insights.efficiency_distribution && Object.keys(insights.efficiency_distribution).length > 0 && (
            <Card className="bg-card border-card-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">توزيع الكفاءة</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(insights.efficiency_distribution).map(([rating, count]) => (
                  <div key={rating} className="flex items-center justify-between">
                    <Badge variant="outline" className={`text-xs capitalize ${effColor(rating)}`}>{rating}</Badge>
                    <div className="flex items-center gap-2">
                      <div className="h-2 rounded-full bg-amber-500/60" style={{ width: `${Math.max(8, (count / Math.max(1, Object.values(insights.efficiency_distribution).reduce((a,b)=>a+b,0))) * 120)}px` }} />
                      <span className="text-sm tabular-nums">{count}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {insights.worst_over_allocated.length > 0 && (
            <Card className="bg-card border-card-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">أعلى زيادة في التخصيص</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {insights.worst_over_allocated.slice(0, 8).map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate max-w-[200px]" title={rowLabel(row)}>{rowLabel(row)}</span>
                    <span className={`tabular-nums font-medium text-xs shrink-0 ${(row.avg_over_alloc_pct ?? 0) > 50 ? "text-red-400" : "text-yellow-400"}`}>
                      {fmtPctLocal(row.avg_over_alloc_pct)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeInner === "table" && (
        <Card className="bg-card border-card-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent" dir="rtl">
                  <TableHead className="text-muted-foreground text-xs text-right">الرمز</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">الوصف</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-left cursor-pointer" onClick={() => handleSort("n_projects")}>N{sortCol==="n_projects"?(sortDir==="asc"?" ↑":" ↓"):""}</TableHead>
                  {hasConsumption && <>
                    <TableHead className="text-muted-foreground text-xs text-left cursor-pointer" onClick={() => handleSort("median_cf")}>Med CF</TableHead>
                    <TableHead className="text-muted-foreground text-xs text-left cursor-pointer" onClick={() => handleSort("avg_over_alloc_pct")}>زيادة%{sortCol==="avg_over_alloc_pct"?(sortDir==="asc"?" ↑":" ↓"):""}</TableHead>
                  </>}
                  <TableHead className="text-muted-foreground text-xs text-right">الكفاءة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAnalysis.map((row, i) => (
                  <TableRow key={i} className="border-border hover:bg-muted/20" dir="rtl">
                    <TableCell className="text-xs text-muted-foreground font-mono">{rowCode(row)}</TableCell>
                    <TableCell className="text-xs max-w-[200px]"><span title={rowLabel(row)} className="line-clamp-2">{rowLabel(row)}</span></TableCell>
                    <TableCell className="text-left text-xs tabular-nums">{row.n_projects}</TableCell>
                    {hasConsumption && <>
                      <TableCell className="text-left text-xs tabular-nums">{fmt(row.median_cf, 3)}</TableCell>
                      <TableCell className={`text-left text-xs tabular-nums font-medium ${(row.avg_over_alloc_pct??0)>50?"text-red-400":(row.avg_over_alloc_pct??0)>20?"text-yellow-400":"text-emerald-400"}`}>
                        {fmtPctLocal(row.avg_over_alloc_pct)}
                      </TableCell>
                    </>}
                    <TableCell className="text-right"><Badge variant="outline" className={`text-xs ${effColor(row.efficiency_rating)}`}>{row.efficiency_rating}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {activeInner === "charts" && (
        <div className="grid md:grid-cols-2 gap-4">
          {chartFiles.map(c => {
            const [err, setErr] = useState(false);
            if (err) return null;
            return (
              <Card key={c.filename} className="bg-card border-card-border overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-5"><CardTitle className="text-sm text-muted-foreground">{c.title}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <img src={`${API}/api/boq/chart/${c.filename}`} alt={c.title} className="w-full object-contain" onError={() => setErr(true)} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 flex-wrap pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground self-center">تصدير:</span>
        <Button variant="outline" size="sm" onClick={() => window.open(`${API}/api/boq/download/csv`, "_blank")} className="text-xs border-border hover:bg-muted">CSV نتائج</Button>
        <Button variant="outline" size="sm" onClick={() => window.open(`${API}/api/boq/download/master-csv`, "_blank")} className="text-xs border-border hover:bg-muted">CSV كامل</Button>
        <Button variant="outline" size="sm" onClick={() => window.open(`${API}/api/boq/download/excel`, "_blank")} className="text-xs border-border hover:bg-muted">Excel كامل</Button>
      </div>
    </div>
  );
}
