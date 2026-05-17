import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ItemAnalyticsRow, type HistoricalRow } from "@/lib/api";
import { useSearch } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ReferenceLine, Legend
} from "recharts";
import { Search, RefreshCw, AlertTriangle, TrendingUp, BarChart3, CheckCircle } from "lucide-react";

const n = (v: number | string | null | undefined, d = 3) =>
  v == null ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtAmt = (v: number | string | null | undefined) =>
  v == null ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const EFF_BG: Record<string, string> = {
  "ممتاز": "bg-green-400/10 text-green-400",
  "جيد جداً": "bg-blue-400/10 text-blue-400",
  "جيد": "bg-yellow-400/10 text-yellow-400",
  "متوسط": "bg-orange-400/10 text-orange-400",
  "ضعيف": "bg-red-400/10 text-red-400",
  "غير محدد": "bg-muted/50 text-muted-foreground",
};

export default function ItemPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialItem = params.get("item") || "";

  const [search, setSearch] = useState(initialItem);
  const [selected, setSelected] = useState(initialItem);
  const [activeTab, setActiveTab] = useState<"table" | "charts" | "history">("table");

  const { data: itemsData } = useQuery({ queryKey: ["boq-items"], queryFn: api.getBoqItems });
  const items = itemsData?.items ?? [];
  const filtered = items.filter(i => i.toLowerCase().includes(search.toLowerCase()));

  const { data, isLoading } = useQuery({
    queryKey: ["item-analytics", selected],
    queryFn: () => api.getItemAnalytics(selected),
    enabled: !!selected,
  });

  const analytics = data?.analytics ?? [];
  const historical = data?.historical ?? [];

  // Chart: standard vs recommended vs median cleared
  const comparisonData = analytics
    .filter(r => r.standardQty != null || r.medianUsedQty != null)
    .slice(0, 12)
    .map(r => ({
      name: r.elementName?.slice(0, 20),
      معياري: r.standardQty ?? 0,
      وسيط_الإخلاء: r.medianUsedQty ? parseFloat(r.medianUsedQty) : 0,
      مقترح: r.recommendedQty ?? 0,
    }));

  // Chart: consumption factor distribution
  const cfData = analytics
    .filter(r => r.medianCf)
    .slice(0, 12)
    .map(r => ({
      name: r.elementName?.slice(0, 18),
      وسيط: parseFloat(r.medianCf!),
      p80: parseFloat(r.p80Cf || r.medianCf!),
    }));

  // Total recommended amount
  const totalRecommendedAmt = analytics.reduce((s, r) => s + (r.recommendedAmount ?? 0), 0);

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">تحليل بند محدد</h1>
        <p className="text-sm text-muted-foreground mt-1">عرض التحليل الإحصائي التفصيلي والتوصيات لكل عنصر داخل البند</p>
      </div>

      {/* Search */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <label className="block text-sm font-medium text-foreground mb-2">ابحث عن البند</label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="اكتب اسم البند..."
              className="w-full bg-background border border-input rounded-lg py-2.5 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>
        </div>
        {search && filtered.length > 0 && (
          <div className="mt-2 bg-background border border-border rounded-lg max-h-52 overflow-y-auto">
            {filtered.slice(0, 20).map(item => (
              <button
                key={item}
                onClick={() => { setSelected(item); setSearch(item); }}
                className={`w-full text-right px-4 py-2.5 text-sm hover:bg-secondary transition-colors border-b border-border last:border-0
                  ${selected === item ? "bg-primary/10 text-primary font-medium" : "text-foreground"}`}
              >
                {item}
              </button>
            ))}
          </div>
        )}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">لا توجد بنود محللة — يرجى رفع البيانات وتشغيل التحليل أولاً</p>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {!isLoading && selected && analytics.length === 0 && (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">لا توجد نتائج تحليل لهذا البند</p>
        </div>
      )}

      {analytics.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">{selected}</h2>
                <p className="text-sm text-muted-foreground">{analytics.length} عنصر محلل</p>
              </div>
              <div className="flex gap-6 flex-wrap">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">إجمالي المبلغ المقترح</div>
                  <div className="text-lg font-bold text-accent">{fmtAmt(totalRecommendedAmt)} ر.ي</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">عدد المشاريع (أول عنصر)</div>
                  <div className="text-lg font-bold text-primary">{analytics[0]?.nProjects ?? 0}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-border">
            {[
              { key: "table", label: "جدول التحليل", icon: BarChart3 },
              { key: "charts", label: "الرسوم البيانية", icon: TrendingUp },
              { key: "history", label: "البيانات التاريخية", icon: CheckCircle },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
                  ${activeTab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Table tab */}
          {activeTab === "table" && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[1000px]">
                  <thead>
                    <tr className="bg-secondary/30 border-b border-border">
                      <th className="px-3 py-3 text-right font-semibold text-muted-foreground">العنصر</th>
                      <th className="px-3 py-3 text-center font-semibold text-muted-foreground">الوحدة</th>
                      <th className="px-3 py-3 text-center font-semibold text-muted-foreground">الكمية المعيارية</th>
                      <th className="px-3 py-3 text-center font-semibold text-muted-foreground">السعر المعياري</th>
                      <th className="px-3 py-3 text-center font-semibold text-muted-foreground">وسيط الاستهلاك</th>
                      <th className="px-3 py-3 text-center font-semibold text-blue-400">P75</th>
                      <th className="px-3 py-3 text-center font-semibold text-purple-400">P80</th>
                      <th className="px-3 py-3 text-center font-semibold text-orange-400">P90</th>
                      <th className="px-3 py-3 text-center font-semibold text-muted-foreground">زيادة متوسطة</th>
                      <th className="px-3 py-3 text-center font-semibold text-green-400">الكمية المقترحة</th>
                      <th className="px-3 py-3 text-center font-semibold text-green-400">المبلغ المقترح</th>
                      <th className="px-3 py-3 text-center font-semibold text-muted-foreground">الكفاءة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analytics.map((row: ItemAnalyticsRow, i) => (
                      <tr key={i} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-3 max-w-[160px]">
                          <div className="font-medium text-foreground truncate">{row.elementName}</div>
                          {row.elementCode && <div className="text-muted-foreground text-xs">{row.elementCode}</div>}
                        </td>
                        <td className="px-3 py-3 text-center text-muted-foreground">{row.elementUnit || "—"}</td>
                        <td className="px-3 py-3 text-center text-muted-foreground font-mono">{n(row.standardQty, 4)}</td>
                        <td className="px-3 py-3 text-center text-muted-foreground font-mono">{fmtAmt(row.standardPrice)}</td>
                        <td className="px-3 py-3 text-center font-mono text-yellow-400">{n(row.medianUsedQty, 3)}</td>
                        <td className="px-3 py-3 text-center font-mono text-blue-400">{n(row.p75Cf, 3)}</td>
                        <td className="px-3 py-3 text-center font-mono text-purple-400">{n(row.p80Cf, 3)}</td>
                        <td className="px-3 py-3 text-center font-mono text-orange-400">{n(row.p90Cf, 3)}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-bold ${parseFloat(row.avgOverAllocPct || "0") > 50 ? "text-red-400" : parseFloat(row.avgOverAllocPct || "0") > 20 ? "text-orange-400" : "text-green-400"}`}>
                            {row.avgOverAllocPct ? `${parseFloat(row.avgOverAllocPct).toFixed(1)}%` : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center font-mono font-bold text-green-400">
                          {row.recommendedQty != null ? n(row.recommendedQty, 3) : "—"}
                        </td>
                        <td className="px-3 py-3 text-center font-mono font-bold text-accent">
                          {row.recommendedAmount != null ? `${fmtAmt(row.recommendedAmount)} ر.ي` : "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EFF_BG[row.efficiencyRating || "غير محدد"]}`}>
                            {row.efficiencyRating || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-secondary/50 border-t-2 border-primary/30">
                      <td colSpan={10} className="px-3 py-3 text-left font-bold text-foreground">إجمالي المبالغ المقترحة</td>
                      <td className="px-3 py-3 text-center font-bold text-accent text-sm">
                        {fmtAmt(totalRecommendedAmt)} ر.ي
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Charts tab */}
          {activeTab === "charts" && (
            <div className="space-y-5">
              {comparisonData.length > 0 && (
                <div className="bg-card border border-card-border rounded-xl p-5">
                  <h3 className="font-semibold text-sm mb-4">مقارنة: الكمية المعيارية vs الوسيط التاريخي vs المقترح</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={comparisonData} margin={{ bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
                      <XAxis dataKey="name" tick={{ fill: "hsl(215 15% 55%)", fontSize: 9 }} angle={-35} textAnchor="end" interval={0} height={60} />
                      <YAxis tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                        labelStyle={{ color: "hsl(213 31% 91%)" }}
                      />
                      <Legend wrapperStyle={{ color: "hsl(215 15% 55%)", fontSize: 12, paddingTop: 8 }} />
                      <Bar dataKey="معياري" fill="#6b7280" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="وسيط_الإخلاء" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="مقترح" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {cfData.length > 0 && (
                <div className="bg-card border border-card-border rounded-xl p-5">
                  <h3 className="font-semibold text-sm mb-4">معامل الاستهلاك التاريخي (وسيط و P80) لكل عنصر</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={cfData} margin={{ bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
                      <XAxis dataKey="name" tick={{ fill: "hsl(215 15% 55%)", fontSize: 9 }} angle={-35} textAnchor="end" interval={0} height={60} />
                      <YAxis domain={[0, 1.5]} tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} tickFormatter={v => v.toFixed(1)} />
                      <Tooltip
                        contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                        formatter={(v: number) => [v.toFixed(3), ""]}
                      />
                      <ReferenceLine y={1} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "100%", fill: "#ef4444", fontSize: 10 }} />
                      <Legend wrapperStyle={{ color: "hsl(215 15% 55%)", fontSize: 12, paddingTop: 8 }} />
                      <Bar dataKey="وسيط" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="p80" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm">السجلات التاريخية ({historical.length})</h3>
              </div>
              {historical.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[700px]">
                    <thead>
                      <tr className="bg-secondary/30 border-b border-border">
                        <th className="px-3 py-3 text-right font-medium text-muted-foreground">المشروع</th>
                        <th className="px-3 py-3 text-right font-medium text-muted-foreground">العنصر</th>
                        <th className="px-3 py-3 text-center font-medium text-muted-foreground">كمية الطلب</th>
                        <th className="px-3 py-3 text-center font-medium text-muted-foreground">كمية الإخلاء</th>
                        <th className="px-3 py-3 text-center font-medium text-muted-foreground">مبلغ الطلب</th>
                        <th className="px-3 py-3 text-center font-medium text-muted-foreground">مبلغ الإخلاء</th>
                        <th className="px-3 py-3 text-center font-medium text-muted-foreground">م. الاستهلاك</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {historical.map((row: HistoricalRow, i) => {
                        const req = parseFloat(row.requestedQty || "0");
                        const clr = parseFloat(row.clearedQty || "0");
                        const cf = req > 0 ? (clr / req) : null;
                        return (
                          <tr key={i} className="hover:bg-secondary/20">
                            <td className="px-3 py-2 max-w-[180px]">
                              <div className="truncate text-foreground">{row.projectName || "—"}</div>
                            </td>
                            <td className="px-3 py-2 max-w-[140px]">
                              <div className="truncate text-muted-foreground">{row.elementName || "—"}</div>
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-muted-foreground">{row.requestedQty ? parseFloat(row.requestedQty).toFixed(2) : "—"}</td>
                            <td className="px-3 py-2 text-center font-mono text-yellow-400">{row.clearedQty ? parseFloat(row.clearedQty).toFixed(2) : "—"}</td>
                            <td className="px-3 py-2 text-center font-mono text-muted-foreground">{row.requestedAmount ? fmtAmt(row.requestedAmount) : "—"}</td>
                            <td className="px-3 py-2 text-center font-mono text-green-400">{row.clearedAmount ? fmtAmt(row.clearedAmount) : "—"}</td>
                            <td className="px-3 py-2 text-center">
                              {cf != null ? (
                                <span className={`font-bold ${cf >= 0.9 ? "text-green-400" : cf >= 0.7 ? "text-yellow-400" : "text-red-400"}`}>
                                  {cf.toFixed(3)}
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">لا توجد بيانات تاريخية مفصلة</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Search({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
}
