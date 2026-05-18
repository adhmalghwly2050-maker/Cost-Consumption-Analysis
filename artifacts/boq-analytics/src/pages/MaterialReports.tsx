import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type MatCoeffRow } from "@/lib/api";
import { BarChart3, RefreshCw, TrendingUp, ScrollText, Scale, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

const n = (v: string | number | null | undefined, d = 4) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

const REPORTS = [
  { id: "top-demand", label: "تقرير العناصر الأعلى استهلاكاً", icon: TrendingUp, color: "text-orange-400" },
  { id: "volatility", label: "تقرير العناصر الأعلى تذبذباً", icon: ScrollText, color: "text-red-400" },
  { id: "comparison", label: "تقرير المقارنة التحليلية", icon: Scale, color: "text-blue-400" },
];

const VOL_COLORS: Record<string, string> = {
  "مستقر جداً": "#22c55e", "مستقر": "#3b82f6",
  "متذبذب": "#f59e0b", "متذبذب جداً": "#f97316", "غير مستقر": "#ef4444",
};

export default function MaterialReportsPage() {
  const [activeReport, setActiveReport] = useState("top-demand");

  const topDemandQuery = useQuery({ queryKey: ["mat-report-top"], queryFn: api.matReportTopDemand, enabled: activeReport === "top-demand" });
  const volatilityQuery = useQuery({ queryKey: ["mat-report-volatility"], queryFn: api.matReportVolatility, enabled: activeReport === "volatility" });
  const comparisonQuery = useQuery({ queryKey: ["mat-report-comparison"], queryFn: api.matReportComparison, enabled: activeReport === "comparison" });

  const isLoading = topDemandQuery.isLoading || volatilityQuery.isLoading || comparisonQuery.isLoading;

  // Report 1: Top Demand
  const topDemandData = topDemandQuery.data?.materials ?? [];
  const topChart = topDemandData.slice(0, 12).map(m => ({
    name: m.name.slice(0, 12),
    مشاريع: m.projects,
    بنود: m.boqCount,
  }));

  // Report 2: Volatility
  const volData = volatilityQuery.data?.coefficients ?? [];
  const volChart = volData.slice(0, 12).map(c => ({
    name: `${c.materialName.slice(0, 8)} - ${c.boqItemName.slice(0, 10)}`,
    cv: c.coefficientOfVariation ? parseFloat(c.coefficientOfVariation) * 100 : 0,
    level: c.volatilityLevel,
  }));

  // Report 3: Comparison
  const compData = comparisonQuery.data?.rows ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-green-400" />
          التقارير التنفيذية للمواد
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          تقارير تحليلية احترافية لسلوك الاستهلاك المادي عبر المشاريع التاريخية
        </p>
      </div>

      {/* Report tabs */}
      <div className="flex gap-2 flex-wrap">
        {REPORTS.map(r => {
          const Icon = r.icon;
          return (
            <button key={r.id} onClick={() => setActiveReport(r.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${activeReport === r.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-card-border text-muted-foreground hover:bg-secondary"}`}>
              <Icon className="w-4 h-4" />
              {r.label}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {/* REPORT 1: Top Demand */}
      {activeReport === "top-demand" && !topDemandQuery.isLoading && (
        <div className="space-y-5">
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
            <h3 className="font-semibold text-orange-400 mb-1">تقرير العناصر الأعلى استهلاكاً</h3>
            <p className="text-xs text-orange-300/80">المواد الأكثر ظهوراً وتأثيراً عبر بنود BOQ المختلفة — الأساس للتخطيط الاستراتيجي للمشتريات</p>
          </div>

          {topChart.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl p-5">
              <h4 className="font-semibold text-sm mb-4">توزيع المشاريع والبنود لكل مادة</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topChart} margin={{ bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }} />
                  <Bar dataKey="مشاريع" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="بنود" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h4 className="font-semibold text-sm">تصنيف المواد حسب الانتشار التاريخي</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "600px" }}>
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                    <th className="px-3 py-3 text-center">#</th>
                    <th className="px-3 py-3 text-right">المادة</th>
                    <th className="px-3 py-3 text-center">الوحدة</th>
                    <th className="px-3 py-3 text-center text-primary">عدد المشاريع</th>
                    <th className="px-3 py-3 text-center text-orange-400">بنود BOQ المرتبطة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topDemandData.map((m, i) => (
                    <tr key={m.materialId} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">{i + 1}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{m.name}</td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">{m.unit}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-primary">{m.projects.toLocaleString("ar-EG")}</td>
                      <td className="px-3 py-2.5 text-center text-orange-400">{m.boqCount.toLocaleString("ar-EG")}</td>
                    </tr>
                  ))}
                  {topDemandData.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">لا توجد بيانات. يرجى حساب المعاملات أولاً.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPORT 2: Volatility */}
      {activeReport === "volatility" && !volatilityQuery.isLoading && (
        <div className="space-y-5">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <h3 className="font-semibold text-red-400 mb-1">تقرير أكثر المعاملات تذبذباً</h3>
            <p className="text-xs text-red-300/80">زوج (مادة + بند BOQ) الأعلى تباينًا — يتطلب هامش أمان أكبر (P80/P90) في التقديرات</p>
          </div>

          {volChart.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl p-5">
              <h4 className="font-semibold text-sm mb-4">معامل التباين (CV%) لأعلى الأزواج تذبذباً</h4>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={volChart} layout="vertical" margin={{ left: 8, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
                  <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fill: "hsl(215 15% 55%)", fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                    formatter={(v: number) => [`${v.toFixed(1)}%`, "معامل التباين CV"]} />
                  <Bar dataKey="cv" radius={[0, 4, 4, 0]}>
                    {volChart.map((entry, i) => <Cell key={i} fill={VOL_COLORS[entry.level ?? ""] ?? "#6b7280"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h4 className="font-semibold text-sm">تفاصيل أكثر الأزواج تذبذباً</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "800px" }}>
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                    <th className="px-3 py-3 text-right">المادة</th>
                    <th className="px-3 py-3 text-right">بند BOQ</th>
                    <th className="px-3 py-3 text-center text-red-400">CV%</th>
                    <th className="px-3 py-3 text-center">مستوى التذبذب</th>
                    <th className="px-3 py-3 text-center text-blue-400">الوسيط</th>
                    <th className="px-3 py-3 text-center text-green-400">P80</th>
                    <th className="px-3 py-3 text-center">مشاريع</th>
                    <th className="px-3 py-3 text-center">درجة الثقة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {volData.slice(0, 100).map((c: MatCoeffRow, i) => {
                    const cv = c.coefficientOfVariation ? parseFloat(c.coefficientOfVariation) * 100 : null;
                    return (
                      <tr key={i} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-foreground">{c.materialName}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{c.boqItemName}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`font-bold font-mono ${cv == null ? "text-muted-foreground" : cv > 50 ? "text-red-400" : cv > 30 ? "text-orange-400" : "text-yellow-400"}`}>
                            {cv != null ? `${cv.toFixed(1)}%` : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs"
                          style={{ color: VOL_COLORS[c.volatilityLevel ?? ""] ?? undefined }}>
                          {c.volatilityLevel ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-blue-400">{n(c.medianCoeff)}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-green-400">{n(c.p80Coeff)}</td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{c.nProjects}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-xs font-bold ${parseFloat(c.confidenceScore ?? "0") >= 70 ? "text-green-400" : parseFloat(c.confidenceScore ?? "0") >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                            {c.confidenceScore ? parseFloat(c.confidenceScore).toFixed(0) : "—"}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {volData.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">لا توجد بيانات.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPORT 3: Comparison */}
      {activeReport === "comparison" && !comparisonQuery.isLoading && (
        <div className="space-y-5">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <h3 className="font-semibold text-blue-400 mb-1">تقرير المقارنة التحليلية للمعاملات</h3>
            <p className="text-xs text-blue-300/80">
              مقارنة وسيط المعامل التاريخي مع P80 لكل زوج (مادة + بند BOQ) — يكشف الفارق بين التقدير الآمن والمتحفظ
            </p>
          </div>

          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h4 className="font-semibold text-sm">جميع المعاملات — مقارنة الوسيط والـP80</h4>
              <span className="text-xs text-muted-foreground">{compData.length.toLocaleString("ar-EG")} زوج</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "900px" }}>
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                    <th className="px-3 py-3 text-right">المادة</th>
                    <th className="px-3 py-3 text-right">بند BOQ</th>
                    <th className="px-3 py-3 text-center">مشاريع</th>
                    <th className="px-3 py-3 text-center text-blue-400">الوسيط (P50)</th>
                    <th className="px-3 py-3 text-center text-yellow-400">P75</th>
                    <th className="px-3 py-3 text-center text-green-400">P80</th>
                    <th className="px-3 py-3 text-center text-orange-400">P90</th>
                    <th className="px-3 py-3 text-center">CV%</th>
                    <th className="px-3 py-3 text-center">الثقة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {compData.slice(0, 200).map((c: MatCoeffRow, i) => {
                    const cv = c.coefficientOfVariation ? parseFloat(c.coefficientOfVariation) * 100 : null;
                    const conf = parseFloat(c.confidenceScore ?? "0");
                    const p80val = c.p80Coeff ? parseFloat(c.p80Coeff) : null;
                    const medVal = c.medianCoeff ? parseFloat(c.medianCoeff) : null;
                    const spread = p80val != null && medVal != null && medVal > 0
                      ? ((p80val - medVal) / medVal * 100) : null;
                    return (
                      <tr key={i} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-foreground">{c.materialName}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{c.boqItemName}</td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{c.nProjects}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-blue-400">{n(c.medianCoeff)}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-yellow-400">{n(c.p75Coeff)}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-green-400">{n(c.p80Coeff)}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-orange-400">{n(c.p90Coeff)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`font-mono ${cv == null ? "text-muted-foreground" : cv > 50 ? "text-red-400" : cv > 30 ? "text-orange-400" : cv > 15 ? "text-yellow-400" : "text-green-400"}`}>
                            {cv != null ? `${cv.toFixed(1)}%` : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`font-bold ${conf >= 70 ? "text-green-400" : conf >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                            {conf.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {compData.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      لا توجد بيانات. يرجى حساب المعاملات أولاً.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {compData.length > 200 && (
              <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
                يُعرض أول 200 نتيجة من {compData.length.toLocaleString("ar-EG")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
