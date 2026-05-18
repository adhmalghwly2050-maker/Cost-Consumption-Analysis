import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Layers, RefreshCw, Activity, Database, Filter, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { toast } from "sonner";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#ec4899"];

export default function ProjectContextPage() {
  const qc = useQueryClient();
  const [selectedType, setSelectedType] = useState("الكل");
  const [selectedBranch, setSelectedBranch] = useState("الكل");
  const [runningFilter, setRunningFilter] = useState<{ projectType?: string; branch?: string }>({});

  const { data, isLoading } = useQuery({
    queryKey: ["project-context", selectedType, selectedBranch],
    queryFn: () => api.getProjectContext({
      projectType: selectedType !== "الكل" ? selectedType : undefined,
      branch: selectedBranch !== "الكل" ? selectedBranch : undefined,
    }),
  });

  const runMutation = useMutation({
    mutationFn: () => api.runAnalytics(runningFilter),
    onSuccess: (d) => {
      toast.success(`تم التحليل بنجاح — ${d.analyzedGroups} مجموعة عنصر`);
      qc.invalidateQueries({ queryKey: ["analytics"] });
      qc.invalidateQueries({ queryKey: ["adaptive-standards"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filters = data?.filters;
  const summary = data?.summary ?? [];

  const chartData = summary
    .sort((a, b) => b.projectCount - a.projectCount)
    .map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            تصنيف سياق المشاريع
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تحليل سلوك الاستهلاك حسب تصنيف المشروع — الأساس لمعايير مختلفة لسياقات مختلفة
          </p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Activity className={`w-4 h-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
          {runningFilter.projectType ? `تحليل: ${runningFilter.projectType}` : "تشغيل التحليل الكلي"}
        </button>
      </div>

      {/* Context info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <p className="text-sm text-blue-300 font-semibold mb-1">الهدف من تصنيف سياق المشاريع</p>
        <p className="text-xs text-blue-300/80">
          المشاريع المختلفة (حسب النوع، المنطقة، المقاول، الحجم) قد تُظهر سلوكاً مختلفاً في الاستهلاك.
          هذا القسم يُتيح تصفية التحليل حسب التصنيف، ومستقبلاً إنشاء معايير مخصصة لكل سياق.
        </p>
      </div>

      {/* Classification Dimensions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "أنواع المشاريع", value: filters?.projectTypes.length ?? 0, icon: Layers, color: "text-primary" },
          { label: "الفروع", value: filters?.branches.length ?? 0, icon: Database, color: "text-green-400" },
          { label: "إجمالي السجلات", value: data?.totalRecords?.toLocaleString("ar-EG") ?? 0, icon: BarChart3, color: "text-orange-400" },
          { label: "تصنيفات مكتشفة", value: summary.length, icon: Filter, color: "text-purple-400" },
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

      {/* Filters */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          أبعاد التصنيف — فلترة التحليل
        </h3>
        <div className="flex gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">نوع المشروع</label>
            <select
              value={selectedType}
              onChange={e => { setSelectedType(e.target.value); setRunningFilter(prev => ({ ...prev, projectType: e.target.value !== "الكل" ? e.target.value : undefined })); }}
              className="bg-secondary border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="الكل">الكل</option>
              {filters?.projectTypes.map(t => <option key={t} value={t!}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الفرع / المنطقة</label>
            <select
              value={selectedBranch}
              onChange={e => { setSelectedBranch(e.target.value); setRunningFilter(prev => ({ ...prev, branch: e.target.value !== "الكل" ? e.target.value : undefined })); }}
              className="bg-secondary border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="الكل">الكل</option>
              {filters?.branches.map(b => <option key={b} value={b!}>{b}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Chart */}
      {chartData.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">توزيع المشاريع حسب التصنيف</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
              <XAxis
                dataKey="projectType"
                tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }}
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                formatter={(v: number, name: string) => [v, name === "projectCount" ? "عدد المشاريع" : name]}
              />
              <Bar dataKey="projectCount" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary Table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-sm">تفاصيل التصنيفات المكتشفة</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                <th className="px-4 py-3 text-right">نوع المشروع</th>
                <th className="px-4 py-3 text-center">عدد المشاريع</th>
                <th className="px-4 py-3 text-center">عدد السجلات</th>
                <th className="px-4 py-3 text-center">عدد العناصر</th>
                <th className="px-4 py-3 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.map((s, i) => (
                <tr key={i} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{s.projectType}</td>
                  <td className="px-4 py-3 text-center text-primary font-bold">{s.projectCount.toLocaleString("ar-EG")}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{s.recordCount.toLocaleString("ar-EG")}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{s.elementCount.toLocaleString("ar-EG")}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => {
                        setRunningFilter({ projectType: s.projectType });
                        runMutation.mutate();
                      }}
                      disabled={runMutation.isPending}
                      className="px-3 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs disabled:opacity-50"
                    >
                      تحليل مخصص
                    </button>
                  </td>
                </tr>
              ))}
              {summary.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    لا توجد بيانات تصنيف. يرجى رفع ملفات تحتوي على أعمدة "النوع" و"الفرع".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Future roadmap note */}
      <div className="bg-secondary/30 border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-3 text-muted-foreground">خارطة طريق التصنيف السياقي</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { phase: "المرحلة الحالية", desc: "تصفية التحليل حسب نوع المشروع والفرع", status: "مكتمل", color: "text-green-400" },
            { phase: "المرحلة القادمة", desc: "توصيات مخصصة لكل فئة مشروع على حدة", status: "قريباً", color: "text-yellow-400" },
            { phase: "المرحلة المتقدمة", desc: "نماذج تنبؤية تأخذ بعين الاعتبار سياق المشروع", status: "مستقبلي", color: "text-blue-400" },
          ].map(({ phase, desc, status, color }) => (
            <div key={phase} className="bg-card border border-card-border rounded-lg p-4">
              <div className={`text-xs font-bold ${color} mb-1`}>{status}</div>
              <div className="text-sm font-semibold text-foreground mb-1">{phase}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
