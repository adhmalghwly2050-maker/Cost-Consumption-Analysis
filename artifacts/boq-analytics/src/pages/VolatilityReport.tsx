import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AnalyticsRow } from "@/lib/api";
import { ScrollText, RefreshCw, AlertTriangle, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

const n = (v: string | number | null | undefined, d = 3) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

function VolatilityBadge({ level }: { level: string | null }) {
  const cfg: Record<string, string> = {
    "مستقر جداً":  "bg-green-500/15 text-green-400 border-green-500/30",
    "مستقر":       "bg-blue-500/15 text-blue-400 border-blue-500/30",
    "متذبذب":      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    "متذبذب جداً": "bg-orange-500/15 text-orange-400 border-orange-500/30",
    "غير مستقر":   "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${cfg[level ?? ""] ?? "bg-muted/20 text-muted-foreground border-muted/30"}`}>
      {level ?? "غير محدد"}
    </span>
  );
}

export default function VolatilityReportPage() {
  const [minProjects, setMinProjects] = useState(3);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("الكل");

  const { data, isLoading } = useQuery({
    queryKey: ["volatility-report"],
    queryFn: api.getVolatilityReport,
  });

  const rows = data?.rows ?? [];

  const filtered = useMemo(() => {
    let r = rows.filter(row => row.nProjects >= minProjects);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row => row.boqItemName?.toLowerCase().includes(q) || row.elementName?.toLowerCase().includes(q));
    }
    if (levelFilter !== "الكل") r = r.filter(row => row.volatilityLevel === levelFilter);
    return r;
  }, [rows, minProjects, search, levelFilter]);

  const topVolatile = filtered.slice(0, 15).map(r => ({
    name: (r.elementName ?? "").slice(0, 18),
    cv: r.coefficientOfVariation ? parseFloat(r.coefficientOfVariation) * 100 : 0,
    level: r.volatilityLevel,
  }));

  const levels = ["مستقر جداً", "مستقر", "متذبذب", "متذبذب جداً", "غير مستقر"];
  const levelCounts = levels.reduce((acc, l) => {
    acc[l] = rows.filter(r => r.volatilityLevel === l && r.nProjects >= minProjects).length;
    return acc;
  }, {} as Record<string, number>);

  const levelColors: Record<string, string> = {
    "مستقر جداً": "#22c55e",
    "مستقر": "#3b82f6",
    "متذبذب": "#f59e0b",
    "متذبذب جداً": "#f97316",
    "غير مستقر": "#ef4444",
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ScrollText className="w-6 h-6 text-orange-400" />
          تقرير العناصر الأعلى تذبذباً
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          العناصر ذات السلوك غير المنتظم — تتطلب هامش أمان أعلى (P80/P90) ومراجعة هندسية متعمقة
        </p>
      </div>

      {/* Level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {levels.map(level => (
          <button
            key={level}
            onClick={() => setLevelFilter(level === levelFilter ? "الكل" : level)}
            className={`p-3 rounded-xl border transition-all text-right ${levelFilter === level ? "border-opacity-60 bg-secondary" : "bg-card border-card-border"}`}
          >
            <div className="text-xs text-muted-foreground mb-1">{level}</div>
            <div className="text-lg font-bold" style={{ color: levelColors[level] }}>{levelCounts[level] ?? 0}</div>
          </button>
        ))}
      </div>

      {/* CV Distribution Chart */}
      {topVolatile.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">أعلى 15 عنصراً تذبذباً (معامل التباين CV%)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topVolatile} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
              <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)}%`, "معامل التباين CV"]}
                contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
              />
              <ReferenceLine x={15} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "15%", fill: "#22c55e", fontSize: 10 }} />
              <ReferenceLine x={30} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "30%", fill: "#f59e0b", fontSize: 10 }} />
              <ReferenceLine x={50} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "50%", fill: "#ef4444", fontSize: 10 }} />
              <Bar dataKey="cv" radius={[0, 4, 4, 0]}>
                {topVolatile.map((entry, i) => (
                  <Cell key={i} fill={levelColors[entry.level ?? ""] ?? "#6b7280"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400 inline-block" /> 15% حد الاستقرار العالي</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-400 inline-block" /> 30% حد التذبذب</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" /> 50% حد عدم الاستقرار</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-blue-400 mb-2">المنطق الإحصائي للتوصيات حسب مستوى التذبذب</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-blue-300/80">
          <div><span className="text-green-400 font-bold">مستقر جداً (CV &lt;15%) → </span>يُستخدم P75 كتوصية ضيقة دقيقة</div>
          <div><span className="text-yellow-400 font-bold">متذبذب (CV 15–30%) → </span>يُستخدم P80 كهامش أمان معتدل</div>
          <div><span className="text-red-400 font-bold">غير مستقر (CV &gt;30%) → </span>يُستخدم P90 كهامش أمان عالٍ</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث عن بند أو عنصر..."
          className="flex-1 min-w-48 bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary">
          {["الكل", ...levels].map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={minProjects} onChange={e => setMinProjects(Number(e.target.value))}
          className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary">
          {[1, 2, 3, 5, 10].map(v => <option key={v} value={v}>{v}+ مشاريع</option>)}
        </select>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length.toLocaleString("ar-EG")} عنصر</span>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-400" />
          <h3 className="font-semibold text-sm">العناصر مرتبة حسب مستوى التذبذب (تنازلياً)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: "1050px" }}>
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                <th className="px-3 py-3 text-center">#</th>
                <th className="px-3 py-3 text-right">البند</th>
                <th className="px-3 py-3 text-right">العنصر</th>
                <th className="px-3 py-3 text-center text-orange-400">CV%</th>
                <th className="px-3 py-3 text-center">مستوى التذبذب</th>
                <th className="px-3 py-3 text-center text-primary">الكمية التكيفية</th>
                <th className="px-3 py-3 text-center">الانحراف المعياري</th>
                <th className="px-3 py-3 text-center">P75</th>
                <th className="px-3 py-3 text-center">P80</th>
                <th className="px-3 py-3 text-center">P90</th>
                <th className="px-3 py-3 text-center">مشاريع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 200).map((row: AnalyticsRow, i) => {
                const cv = row.coefficientOfVariation ? parseFloat(row.coefficientOfVariation) * 100 : null;
                return (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2.5 max-w-[140px]">
                      <div className="truncate font-medium text-foreground">{row.boqItemName}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[120px]">
                      <div className="truncate text-muted-foreground">{row.elementName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold font-mono ${cv == null ? "text-muted-foreground" : cv > 50 ? "text-red-400" : cv > 30 ? "text-orange-400" : cv > 15 ? "text-yellow-400" : "text-green-400"}`}>
                        {cv != null ? `${cv.toFixed(1)}%` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center"><VolatilityBadge level={row.volatilityLevel} /></td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-primary">{n(row.adaptiveQty)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">{n(row.stdClearedQty)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-yellow-400">{n(row.p75ClearedQty)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-orange-400">{n(row.p80ClearedQty)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-red-400">{n(row.p90ClearedQty)}</td>
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
