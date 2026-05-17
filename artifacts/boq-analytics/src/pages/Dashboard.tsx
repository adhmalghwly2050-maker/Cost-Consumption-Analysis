import { useQuery } from "@tanstack/react-query";
import { api, type DashboardResponse } from "@/lib/api";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import {
  BarChart3, Upload, TrendingUp, Database, AlertTriangle,
  CheckCircle, Activity, ArrowLeft, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("ar-EG");
const fmtPct = (n: string | null | undefined) =>
  n == null ? "—" : `${parseFloat(n).toFixed(1)}%`;

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444"];

const EFF_COLORS: Record<string, string> = {
  "ممتاز": "#22c55e",
  "جيد جداً": "#3b82f6",
  "جيد": "#f59e0b",
  "متوسط": "#f97316",
  "ضعيف": "#ef4444",
  "غير محدد": "#6b7280",
};

function StatCard({
  label, value, sub, icon: Icon, colorClass
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; colorClass: string }) {
  return (
    <div className={`bg-card rounded-xl p-5 border border-card-border ${colorClass}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground font-medium mb-1">{label}</div>
          <div className="text-2xl font-bold text-foreground">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [running, setRunning] = useState(false);
  const { data, isLoading, error, refetch } = useQuery<DashboardResponse>({
    queryKey: ["dashboard"],
    queryFn: api.getDashboard,
  });

  const handleRunAnalytics = async () => {
    setRunning(true);
    try {
      const r = await api.runAnalytics();
      toast.success(`تم التحليل بنجاح — ${r.analyzedGroups} مجموعة عنصر`);
      refetch();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">جار تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
        <p className="text-destructive">{(error as Error).message}</p>
      </div>
    );
  }

  const kpis = data?.kpis;
  const insights = data?.insights;
  const hasData = data?.hasData;

  // Efficiency distribution for pie chart
  const effData = kpis?.efficiencyDistribution
    ? Object.entries(kpis.efficiencyDistribution).map(([name, value]) => ({ name, value }))
    : [];

  // Over allocation chart
  const overAllocData = insights?.worstOverAllocated
    .slice(0, 8)
    .map(r => ({
      name: `${r.boqItemName?.slice(0, 20)}...\n${r.elementName?.slice(0, 15)}`,
      label: r.elementName?.slice(0, 20),
      value: parseFloat(r.avgOverAllocPct || "0"),
    })) ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">لوحة التحكم الرئيسية</h1>
          <p className="text-sm text-muted-foreground mt-1">
            منصة الذكاء التاريخي لبنود الأعمال الإنشائية
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleRunAnalytics}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Activity className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
            {running ? "جار التحليل..." : "تشغيل التحليل"}
          </button>
          <Link
            href="/import"
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            <Upload className="w-4 h-4" />
            استيراد بيانات
          </Link>
        </div>
      </div>

      {/* No data state */}
      {!hasData && (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center">
          <Database className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد نتائج تحليل بعد</h3>
          <p className="text-muted-foreground text-sm mb-6">
            ابدأ برفع ملف Excel يحتوي على البيانات التاريخية، ثم قم بتشغيل التحليل
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link
              href="/import"
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Upload className="w-4 h-4" />
              رفع ملف Excel
            </Link>
            <button
              onClick={handleRunAnalytics}
              disabled={running}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              <Activity className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
              تشغيل التحليل
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="إجمالي البنود المحللة"
          value={fmt(kpis?.totalItemsAnalyzed)}
          sub="مجموعة عنصر"
          icon={BarChart3}
          colorClass="stat-card-blue"
        />
        <StatCard
          label="عدد المشاريع"
          value={fmt(kpis?.totalProjects)}
          sub="مشروع تاريخي"
          icon={Database}
          colorClass="stat-card-green"
        />
        <StatCard
          label="إجمالي السجلات"
          value={fmt(kpis?.totalRowsImported)}
          sub="صف بيانات"
          icon={TrendingUp}
          colorClass="stat-card-orange"
        />
        <StatCard
          label="وسيط معامل الاستهلاك"
          value={kpis?.overallMedianCf ? `${(parseFloat(kpis.overallMedianCf) * 100).toFixed(1)}%` : "—"}
          sub="نسبة الاستهلاك الفعلي"
          icon={Activity}
          colorClass="stat-card-purple"
        />
      </div>

      {hasData && (
        <>
          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Over allocation chart */}
            <div className="bg-card border border-card-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <h3 className="font-semibold text-sm">أعلى 8 عناصر في نسبة الزيادة في التخصيص</h3>
              </div>
              {overAllocData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={overAllocData} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
                    <XAxis
                      type="number"
                      tickFormatter={v => `${v.toFixed(0)}%`}
                      tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={120}
                      tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(1)}%`, "متوسط الزيادة"]}
                      contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                      labelStyle={{ color: "hsl(213 31% 91%)", fontSize: 12 }}
                      itemStyle={{ color: "#f87171" }}
                    />
                    <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
              )}
            </div>

            {/* Efficiency distribution */}
            <div className="bg-card border border-card-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-sm">توزيع تصنيف الكفاءة</h3>
              </div>
              {effData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={effData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      dataKey="value"
                      paddingAngle={3}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {effData.map((entry) => (
                        <Cell key={entry.name} fill={EFF_COLORS[entry.name] || "#6b7280"} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => [v, "عدد العناصر"]}
                      contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                      labelStyle={{ color: "hsl(213 31% 91%)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
              )}
            </div>
          </div>

          {/* Insights tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Most stable */}
            <InsightTable
              title="أكثر العناصر استقراراً"
              icon={<CheckCircle className="w-4 h-4 text-accent" />}
              rows={insights?.mostStable ?? []}
              valueKey="stabilityScore"
              valueLabel="مؤشر الاستقرار"
              color="text-accent"
            />
            {/* Most volatile */}
            <InsightTable
              title="أكثر العناصر تذبذباً"
              icon={<Activity className="w-4 h-4 text-destructive" />}
              rows={insights?.mostVolatile ?? []}
              valueKey="stdCf"
              valueLabel="الانحراف المعياري"
              color="text-destructive"
            />
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <QuickCard
              href="/analysis"
              icon={<BarChart3 className="w-5 h-5 text-primary" />}
              title="تحليل جميع البنود"
              desc="عرض وتصفية نتائج التحليل الإحصائي الكاملة"
            />
            <QuickCard
              href="/item"
              icon={<Search className="w-5 h-5 text-accent" />}
              title="تفاصيل بند محدد"
              desc="عرض التحليل التفصيلي والتوصيات لبند معين"
            />
            <QuickCard
              href="/import"
              icon={<Upload className="w-5 h-5 text-orange-400" />}
              title="إدارة البيانات المرفوعة"
              desc="رفع ملفات Excel وإدارة دفعات الاستيراد"
            />
          </div>
        </>
      )}
    </div>
  );
}

function InsightTable({
  title, icon, rows, valueKey, valueLabel, color
}: {
  title: string;
  icon: React.ReactNode;
  rows: ReturnType<typeof api.getDashboard extends Promise<infer T> ? T : never>["insights"]["mostStable"];
  valueKey: string;
  valueLabel: string;
  color: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="space-y-2">
        {rows.slice(0, 6).map((row, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{row.elementName}</div>
              <div className="text-xs text-muted-foreground truncate">{row.boqItemName}</div>
            </div>
            <div className={`text-sm font-bold ${color} flex-shrink-0 mr-2`}>
              {(() => {
                const v = (row as Record<string, unknown>)[valueKey];
                return v != null ? parseFloat(v as string).toFixed(3) : "—";
              })()}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-4">لا توجد بيانات</div>
        )}
      </div>
    </div>
  );
}

function QuickCard({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="block bg-card border border-card-border rounded-xl p-5 hover:border-primary/50 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
          {icon}
        </div>
        <div>
          <div className="font-semibold text-sm text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground mt-1">{desc}</div>
        </div>
        <ArrowLeft className="w-4 h-4 text-muted-foreground mr-auto flex-shrink-0 group-hover:text-primary transition-colors rotate-180" />
      </div>
    </Link>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Search({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
}
