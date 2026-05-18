import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Activity, RefreshCw, Clock, CheckCircle, GitBranch, ArrowLeft } from "lucide-react";

const n = (v: string | number | null | undefined, d = 4) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
};

export default function StandardEvolutionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["evolution-report"],
    queryFn: api.getEvolutionReport,
  });

  const versions = data?.versions ?? [];
  const approved = data?.approvedWorkflow ?? [];

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          تقرير تطور المعايير
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          سجل كامل لتطور المعايير عبر الزمن — قابلية التتبع، الاسترداد، والمقارنة بين الإصدارات
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "إصدارات المعايير المُطبَّقة", value: versions.length, icon: GitBranch, color: "text-primary" },
          { label: "توصيات معتمدة", value: approved.length, icon: CheckCircle, color: "text-green-400" },
          { label: "آخر تحديث", value: versions[0] ? fmtDate(versions[0].effectiveDate) : "—", icon: Clock, color: "text-orange-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Applied Versions Timeline */}
      {versions.length > 0 ? (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">سجل الإصدارات المُطبَّقة</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "900px" }}>
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                  <th className="px-3 py-3 text-right">البند</th>
                  <th className="px-3 py-3 text-right">العنصر</th>
                  <th className="px-3 py-3 text-center">الإصدار</th>
                  <th className="px-3 py-3 text-center text-green-400">الكمية المُطبَّقة</th>
                  <th className="px-3 py-3 text-center text-blue-400">السعر المُطبَّق</th>
                  <th className="px-3 py-3 text-center">نوع التغيير</th>
                  <th className="px-3 py-3 text-center">المشاريع الداعمة</th>
                  <th className="px-3 py-3 text-center">المعتمد من</th>
                  <th className="px-3 py-3 text-center">تاريخ التطبيق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {versions.map((v, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2.5 max-w-[150px]">
                      <div className="truncate font-medium text-foreground">{v.boqItemName}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[130px]">
                      <div className="truncate text-muted-foreground">{v.elementName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full font-mono">v{v.version}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-green-400">{n(v.stdQty)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-blue-400">
                      {v.stdPrice ? parseFloat(v.stdPrice).toLocaleString("ar-EG", { maximumFractionDigits: 0 }) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${v.changeType === "تجاوز هندسي" ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>
                        {v.changeType ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{v.nProjectsAtChange ?? "—"}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{v.approvedBy ?? "—"}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{fmtDate(v.effectiveDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center">
          <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-2">لا يوجد سجل إصدارات بعد</h3>
          <p className="text-sm text-muted-foreground">
            سيظهر هنا سجل التطور بعد اعتماد وتطبيق التوصيات من صفحة "سير عمل التوصيات"
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground">
            <ArrowLeft className="w-4 h-4 rotate-180" />
            توجّه لسير عمل التوصيات لاعتماد وتطبيق المعايير
          </div>
        </div>
      )}

      {/* Approved workflow (pending application) */}
      {approved.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <h3 className="font-semibold text-sm">توصيات معتمدة — في انتظار التطبيق</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "700px" }}>
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                  <th className="px-3 py-3 text-right">البند</th>
                  <th className="px-3 py-3 text-right">العنصر</th>
                  <th className="px-3 py-3 text-center">الكمية الموصى بها</th>
                  <th className="px-3 py-3 text-center">المشاريع</th>
                  <th className="px-3 py-3 text-center">المعتمد من</th>
                  <th className="px-3 py-3 text-center">تاريخ الاعتماد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {approved.map((r, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2.5 max-w-[150px]">
                      <div className="truncate font-medium text-foreground">{r.boqItemName}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[130px]">
                      <div className="truncate text-muted-foreground">{r.elementName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-green-400">
                      {n(r.overrideQty ?? r.recommendedQty)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{r.nProjects ?? "—"}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{r.approvedBy ?? "—"}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{fmtDate(r.approvedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
