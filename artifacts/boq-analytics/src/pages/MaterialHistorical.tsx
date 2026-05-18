import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type MatHistoricalStat } from "@/lib/api";
import { Database, RefreshCw, TrendingUp, BarChart3, Search } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, RadarChart, PolarGrid, PolarAngleAxis, Radar
} from "recharts";

const n = (v: string | number | null | undefined, d = 2) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

const VOL_COLOR: Record<string, string> = {
  "مستقر جداً": "text-green-400", "مستقر": "text-blue-400",
  "متذبذب": "text-yellow-400", "متذبذب جداً": "text-orange-400", "غير مستقر": "text-red-400",
};

export default function MaterialHistoricalPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MatHistoricalStat | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mat-historical-stats"],
    queryFn: api.matGetHistoricalStats,
  });

  const stats = data?.stats ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return stats;
    const q = search.toLowerCase();
    return stats.filter(s => s.materialName.toLowerCase().includes(q) || s.materialUnit.toLowerCase().includes(q));
  }, [stats, search]);

  const chartData = filtered.slice(0, 12).map(s => ({
    name: s.materialName.slice(0, 12),
    مشاريع: s.totalProjects ?? 0,
    سجلات: s.totalRecords ?? 0,
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Database className="w-6 h-6 text-orange-400" />
          الذاكرة التاريخية للمواد
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          إحصاءات تراكمية لكل مادة عبر جميع المشاريع التاريخية — أساس الثقة في التقديرات المستقبلية
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "مواد موثّقة تاريخياً", value: stats.length, color: "text-orange-400" },
          { label: "إجمالي المشاريع التاريخية", value: Math.max(...(stats.map(s => s.totalProjects ?? 0).concat([0]))), color: "text-primary" },
          { label: "مواد مستقرة (≥80%)", value: stats.filter(s => s.stabilityScore && parseFloat(s.stabilityScore) >= 0.8).length, color: "text-green-400" },
          { label: "مواد متذبذبة", value: stats.filter(s => s.volatilityLevel === "متذبذب جداً" || s.volatilityLevel === "غير مستقر").length, color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className={`text-xl font-bold ${color}`}>{value.toLocaleString("ar-EG")}</div>
          </div>
        ))}
      </div>

      {/* Coverage Chart */}
      {chartData.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">التغطية التاريخية — أعلى المواد ثراءً بالبيانات</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }} />
              <Bar dataKey="مشاريع" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث عن مادة..."
          className="w-full bg-card border border-input rounded-lg py-2 pr-9 pl-3 text-sm outline-none focus:border-primary" />
      </div>

      {/* Main Table + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Table */}
        <div className="lg:col-span-2 bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-sm">الإحصاءات التاريخية لكل مادة</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "700px" }}>
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                  <th className="px-3 py-3 text-right">المادة</th>
                  <th className="px-3 py-3 text-center">الوحدة</th>
                  <th className="px-3 py-3 text-center text-primary">المشاريع</th>
                  <th className="px-3 py-3 text-center">وسيط الطلب/مشروع</th>
                  <th className="px-3 py-3 text-center text-green-400">P80</th>
                  <th className="px-3 py-3 text-center">الاستقرار</th>
                  <th className="px-3 py-3 text-center">التذبذب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(s => {
                  const stability = s.stabilityScore ? parseFloat(s.stabilityScore) : null;
                  return (
                    <tr key={s.id}
                      onClick={() => setSelected(selected?.id === s.id ? null : s)}
                      className={`hover:bg-secondary/20 transition-colors cursor-pointer ${selected?.id === s.id ? "bg-primary/5 border-r-2 border-primary" : ""}`}>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{s.materialName}</td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">{s.materialUnit}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-primary">{s.totalProjects ?? 0}</td>
                      <td className="px-3 py-2.5 text-center font-mono">{n(s.medianProjectDemand)}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-green-400">{n(s.p80ProjectDemand)}</td>
                      <td className="px-3 py-2.5 text-center">
                        {stability != null ? (
                          <div className="flex items-center gap-1 justify-center">
                            <div className="w-12 bg-secondary rounded-full h-1.5">
                              <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${stability * 100}%` }} />
                            </div>
                            <span className="text-xs text-green-400">{(stability * 100).toFixed(0)}%</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs ${VOL_COLOR[s.volatilityLevel ?? ""] ?? "text-muted-foreground"}`}>
                          {s.volatilityLevel ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {stats.length === 0 ? "لا توجد إحصاءات. يرجى حساب المعاملات أولاً." : "لا نتائج."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-foreground">{selected.materialName}</h3>
                <div className="text-xs text-muted-foreground">{selected.materialUnit} — {selected.volatilityLevel}</div>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { label: "إجمالي المشاريع", value: selected.totalProjects ?? 0, color: "text-primary" },
                  { label: "إجمالي بنود BOQ", value: selected.totalBoqItems ?? 0, color: "text-blue-400" },
                  { label: "إجمالي السجلات", value: selected.totalRecords ?? 0, color: "text-muted-foreground" },
                  { label: "إجمالي الكمية المُخلاة", value: n(selected.totalClearedQty, 1), color: "text-orange-400" },
                  { label: "وسيط الطلب/مشروع", value: n(selected.medianProjectDemand), color: "text-foreground" },
                  { label: "P75", value: n(selected.p75ProjectDemand), color: "text-yellow-400" },
                  { label: "P80", value: n(selected.p80ProjectDemand), color: "text-green-400" },
                  { label: "سعر الوحدة الوسيطي", value: selected.medianUnitPrice ? n(selected.medianUnitPrice, 0) + " ر.ي" : "—", color: "text-muted-foreground" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-mono font-bold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
              {selected.topBoqItems && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">أبرز بنود BOQ المستهلِكة:</div>
                  <div className="text-xs text-foreground bg-secondary rounded p-2">{selected.topBoqItems}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-10">
              <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">اضغط على أي مادة لعرض تفاصيلها هنا</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
