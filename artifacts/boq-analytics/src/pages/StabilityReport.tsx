import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AnalyticsRow } from "@/lib/api";
import { FlaskConical, RefreshCw, AlertTriangle, CheckCircle, Printer } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, Cell
} from "recharts";

const n = (v: string | number | null | undefined, d = 3) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

function StabilityBadge({ score }: { score: string | null }) {
  if (!score) return <span className="text-muted-foreground text-xs">—</span>;
  const s = parseFloat(score);
  if (s >= 0.85) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/30">ممتاز</span>;
  if (s >= 0.70) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">جيد جداً</span>;
  if (s >= 0.50) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">جيد</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">ضعيف</span>;
}

export default function StabilityReportPage() {
  const [minProjects, setMinProjects] = useState(3);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["stability-report"],
    queryFn: api.getStabilityReport,
  });

  const rows = data?.rows ?? [];

  const filtered = useMemo(() => {
    let r = rows.filter(row => row.nProjects >= minProjects && row.stabilityScore != null);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row => row.boqItemName?.toLowerCase().includes(q) || row.elementName?.toLowerCase().includes(q));
    }
    return r;
  }, [rows, minProjects, search]);

  const topStable = filtered.slice(0, 15).map(r => ({
    name: (r.elementName ?? "").slice(0, 18),
    value: r.stabilityScore ? parseFloat(r.stabilityScore) * 100 : 0,
  }));

  const stableCount   = filtered.filter(r => r.stabilityScore && parseFloat(r.stabilityScore) >= 0.85).length;
  const goodCount     = filtered.filter(r => r.stabilityScore && parseFloat(r.stabilityScore) >= 0.70 && parseFloat(r.stabilityScore) < 0.85).length;
  const unstableCount = filtered.filter(r => r.stabilityScore && parseFloat(r.stabilityScore) < 0.50).length;
  const avgStability  = filtered.length > 0
    ? filtered.reduce((s, r) => s + parseFloat(r.stabilityScore ?? "0"), 0) / filtered.length : 0;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4 flex-wrap print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-green-400" />
            تقرير العناصر الأعلى استقراراً
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            العناصر ذات السلوك التاريخي المنتظم — مرشحة للتوصيات الأكثر دقة والتخصيص الأضيق
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <Printer className="w-4 h-4" />
          طباعة التقرير
        </button>
      </div>
      <div className="hidden print:block mb-6 border-b-2 border-gray-800 pb-4">
        <h1 className="text-2xl font-bold text-center text-gray-900">تقرير العناصر الأعلى استقراراً</h1>
        <p className="text-center text-gray-600 text-sm mt-1">منصة الذكاء الإنشائي التكيفي — {new Date().toLocaleDateString("ar-SA")}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "عناصر ممتازة الاستقرار (≥85%)", value: stableCount, color: "text-green-400" },
          { label: "عناصر جيدة الاستقرار (70–85%)", value: goodCount, color: "text-blue-400" },
          { label: "عناصر متذبذبة (<50%)", value: unstableCount, color: "text-red-400" },
          { label: "متوسط مؤشر الاستقرار", value: `${(avgStability * 100).toFixed(1)}%`, color: "text-primary" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {topStable.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">أعلى 15 عنصراً استقراراً (مؤشر الاستقرار %)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topStable} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)}%`, "مؤشر الاستقرار"]}
                contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {topStable.map((entry, i) => (
                  <Cell key={i} fill={entry.value >= 85 ? "#22c55e" : entry.value >= 70 ? "#3b82f6" : entry.value >= 50 ? "#f59e0b" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث عن بند أو عنصر..."
          className="flex-1 min-w-48 bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">الحد الأدنى للمشاريع:</label>
          <select value={minProjects} onChange={e => setMinProjects(Number(e.target.value))}
            className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary">
            {[1, 2, 3, 5, 10].map(v => <option key={v} value={v}>{v}+</option>)}
          </select>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length.toLocaleString("ar-EG")} عنصر</span>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <h3 className="font-semibold text-sm">العناصر مرتبة حسب مؤشر الاستقرار (تنازلياً)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: "1000px" }}>
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                <th className="px-3 py-3 text-center">#</th>
                <th className="px-3 py-3 text-right">البند</th>
                <th className="px-3 py-3 text-right">العنصر</th>
                <th className="px-3 py-3 text-center text-green-400">مؤشر الاستقرار</th>
                <th className="px-3 py-3 text-center">تصنيف الاستقرار</th>
                <th className="px-3 py-3 text-center text-blue-400">معامل التباين (CV)</th>
                <th className="px-3 py-3 text-center">مستوى التذبذب</th>
                <th className="px-3 py-3 text-center">درجة الثقة</th>
                <th className="px-3 py-3 text-center">وسيط CF</th>
                <th className="px-3 py-3 text-center">P80</th>
                <th className="px-3 py-3 text-center">مشاريع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 200).map((row: AnalyticsRow, i) => {
                const stab = row.stabilityScore ? parseFloat(row.stabilityScore) : null;
                const cv = row.coefficientOfVariation ? parseFloat(row.coefficientOfVariation) : null;
                const conf = parseFloat(row.confidenceScore ?? "0");
                const confColor = conf >= 70 ? "text-green-400" : conf >= 40 ? "text-yellow-400" : "text-red-400";
                return (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2.5 max-w-[150px]">
                      <div className="truncate font-medium text-foreground">{row.boqItemName}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[130px]">
                      <div className="truncate text-muted-foreground">{row.elementName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 bg-secondary rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${(stab ?? 0) * 100}%` }} />
                        </div>
                        <span className="font-mono font-bold text-green-400">{stab != null ? (stab * 100).toFixed(1) : "—"}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center"><StabilityBadge score={row.stabilityScore} /></td>
                    <td className="px-3 py-2.5 text-center font-mono text-blue-400">{cv != null ? (cv * 100).toFixed(1) : "—"}%</td>
                    <td className="px-3 py-2.5 text-center text-xs">{row.volatilityLevel ?? "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold text-xs ${confColor}`}>{n(row.confidenceScore, 0)}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">{n(row.medianCf)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-purple-400">{n(row.p80Cf)}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{row.nProjects}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-10 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد نتائج. قم بتشغيل التحليل أولاً.</p>
          </div>
        )}
      </div>
    </div>
  );
}
