import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type AnalyticsRow } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, ReferenceLine,
} from "recharts";
import { RefreshCw, AlertTriangle, FileBarChart2, TrendingDown, Info, Printer } from "lucide-react";
import { toast } from "sonner";

const n = (v: string | number | null | undefined, d = 3) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

const pct = (v: string | number | null | undefined, d = 1) =>
  v == null || v === "" ? "—" : `${parseFloat(String(v)).toFixed(d)}%`;

function SeverityBadge({ pct: p }: { pct: number }) {
  if (p > 100) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">شديدة جداً</span>;
  if (p > 50)  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">شديدة</span>;
  if (p > 20)  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">متوسطة</span>;
  return        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">خفيفة</span>;
}

export default function OverAllocReportPage() {
  const queryClient = useQueryClient();
  const [minPct, setMinPct] = useState(10);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["adaptive-standards"],
    queryFn: api.getAdaptiveStandards,
  });

  const runMutation = useMutation({
    mutationFn: api.runAnalytics,
    onSuccess: (d) => {
      toast.success(`تم تحديث ${d.analyzedGroups} مجموعة`);
      queryClient.invalidateQueries({ queryKey: ["adaptive-standards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allRows = data?.standards ?? [];

  // Only rows with stdOverAllocPct > 0 (actual over-allocation, not under)
  const overAllocRows = useMemo(() => {
    let r = allRows.filter(row => {
      if (!row.stdOverAllocPct || !row.origStdQty || !row.medianClearedQty) return false;
      return parseFloat(row.stdOverAllocPct) >= minPct;
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row =>
        row.boqItemName?.toLowerCase().includes(q) || row.elementName?.toLowerCase().includes(q)
      );
    }
    return r.sort((a, b) =>
      parseFloat(b.stdOverAllocPct ?? "0") - parseFloat(a.stdOverAllocPct ?? "0")
    );
  }, [allRows, minPct, search]);

  // Summary stats
  const totalElements    = allRows.filter(r => r.stdOverAllocPct != null).length;
  const overAllocCount   = allRows.filter(r => r.stdOverAllocPct && parseFloat(r.stdOverAllocPct) > 10).length;
  const underAllocCount  = allRows.filter(r => r.stdOverAllocPct && parseFloat(r.stdOverAllocPct) < -10).length;
  const severeCount      = allRows.filter(r => r.stdOverAllocPct && parseFloat(r.stdOverAllocPct) > 50).length;
  const avgOverAlloc     = overAllocRows.length > 0
    ? overAllocRows.reduce((s, r) => s + parseFloat(r.stdOverAllocPct ?? "0"), 0) / overAllocRows.length : 0;

  // Bar chart data — top 15 by over-alloc
  const chartData = overAllocRows.slice(0, 15).map(r => ({
    name: (r.elementName ?? "").slice(0, 16),
    "المعيار الأصلي": parseFloat(r.origStdQty ?? "0"),
    "التاريخي الفعلي": parseFloat(r.medianClearedQty ?? "0"),
    نسبة_المبالغة: parseFloat(r.stdOverAllocPct ?? "0"),
  }));

  // Correction ratio distribution chart
  const corrBuckets = [
    { label: "< 50%", color: "#dc2626" },
    { label: "50–80%", color: "#f97316" },
    { label: "80–95%", color: "#f59e0b" },
    { label: "95–105%", color: "#22c55e" },
    { label: "> 105%", color: "#3b82f6" },
  ];
  const corrDist = corrBuckets.map(({ label, color }) => {
    let count = 0;
    for (const r of allRows) {
      const cr = r.correctionRatio ? parseFloat(r.correctionRatio) : null;
      if (cr == null) continue;
      if      (label === "< 50%"    && cr < 0.50)            count++;
      else if (label === "50–80%"   && cr >= 0.50 && cr < 0.80) count++;
      else if (label === "80–95%"   && cr >= 0.80 && cr < 0.95) count++;
      else if (label === "95–105%"  && cr >= 0.95 && cr <= 1.05) count++;
      else if (label === "> 105%"   && cr > 1.05)            count++;
    }
    return { label, count, color };
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  if (allRows.length === 0) return (
    <div className="bg-card border border-card-border rounded-xl p-10 text-center" dir="rtl">
      <FileBarChart2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-semibold text-foreground mb-2">لا توجد بيانات تحليلية</h3>
      <p className="text-sm text-muted-foreground mb-4">يرجى رفع بيانات تاريخية ثم تشغيل التحليل أولاً</p>
      <button
        onClick={() => runMutation.mutate()}
        disabled={runMutation.isPending}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
        تشغيل التحليل
      </button>
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingDown className="w-6 h-6 text-destructive" />
            تقرير العناصر ذات المبالغة التاريخية في التعزيز
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            عناصر تُخصَّص بكميات أعلى تاريخياً من الاستخدام الفعلي — أساس لتصحيح المعايير وترشيد التخصيص المالي
          </p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
          تحديث التحليل
        </button>
      </div>

      {/* Definition note */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          <p className="font-semibold mb-1">أساس الحساب: قيم منسّبة لكل وحدة بند</p>
          <p className="text-xs text-blue-300/80">
            جميع الكميات محسوبة بقسمة الكمية الفعلية على كمية بند العقد (العمود AC)، مما يجعل المقارنة بين المشاريع ذات الأحجام المختلفة صحيحة رياضياً.
            نسبة المبالغة = (الكمية المعيارية − الوسيط التاريخي الفعلي) ÷ الوسيط التاريخي الفعلي × 100
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "عناصر مرتبطة بمعيار", value: totalElements.toLocaleString("ar-EG"), color: "text-primary" },
          { label: "عناصر بمبالغة (>10%)", value: overAllocCount.toLocaleString("ar-EG"), color: "text-orange-400" },
          { label: "مبالغة شديدة (>50%)", value: severeCount.toLocaleString("ar-EG"), color: "text-red-400" },
          { label: "عناصر بتقليص (<-10%)", value: underAllocCount.toLocaleString("ar-EG"), color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top over-allocated: Standard vs Actual */}
        {chartData.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              أعلى 15 عنصراً: الكمية المعيارية مقابل الوسيط التاريخي (لكل وحدة بند)
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
                <XAxis type="number" tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(215 15% 55%)", fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                  formatter={(v: number, name: string) => [v.toFixed(4), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215 15% 55%)" }} />
                <Bar dataKey="المعيار الأصلي" fill="#6b7280" radius={[0, 3, 3, 0]} />
                <Bar dataKey="التاريخي الفعلي" fill="#f59e0b" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Correction ratio distribution */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">توزيع نسب التصحيح المطلوبة</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={corrDist} margin={{ bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
              <XAxis dataKey="label" tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                formatter={(v: number) => [v, "عدد العناصر"]}
              />
              <ReferenceLine x="95–105%" stroke="#22c55e" strokeDasharray="4 4" />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {corrDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            نسبة التصحيح = الكمية التكيفية ÷ الكمية المعيارية الأصلية
          </p>
        </div>
      </div>

      {/* Over-allocation severity bar chart */}
      {chartData.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">نسبة مبالغة المعيار الأصلي مقارنة بالوسيط التاريخي (أعلى 15)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.map(d => ({ name: d.name, مبالغة: d.نسبة_المبالغة }))} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
              <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(215 15% 55%)", fontSize: 9 }} />
              <Tooltip
                contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                formatter={(v: number) => [`${v.toFixed(1)}%`, "نسبة المبالغة"]}
              />
              <ReferenceLine x={0} stroke="#6b7280" />
              <Bar dataKey="مبالغة" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.نسبة_المبالغة > 100 ? "#dc2626" : entry.نسبة_المبالغة > 50 ? "#f97316" : "#f59e0b"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filter controls */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث عن بند أو عنصر..."
          className="flex-1 min-w-48 bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">الحد الأدنى للمبالغة:</label>
          <select
            value={minPct}
            onChange={e => setMinPct(Number(e.target.value))}
            className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            {[0, 10, 20, 50, 100].map(v => (
              <option key={v} value={v}>{v}%+</option>
            ))}
          </select>
        </div>
        {avgOverAlloc > 0 && (
          <span className="text-xs text-muted-foreground">
            متوسط المبالغة في النتائج: <span className="text-orange-400 font-bold">{avgOverAlloc.toFixed(1)}%</span>
          </span>
        )}
        <span className="text-xs text-muted-foreground whitespace-nowrap">{overAllocRows.length.toLocaleString("ar-EG")} عنصر</span>
      </div>

      {/* Main ranked table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            العناصر مرتبة حسب شدة المبالغة (تنازلياً)
          </h3>
          <span className="text-xs text-muted-foreground">القيم لكل وحدة بند (منسّبة)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: "1100px" }}>
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                <th className="px-3 py-3 text-center">#</th>
                <th className="px-3 py-3 text-right">البند</th>
                <th className="px-3 py-3 text-right">العنصر</th>
                <th className="px-3 py-3 text-center text-primary/70">الكمية المعيارية<br/><span className="text-xs font-normal">لكل وحدة بند</span></th>
                <th className="px-3 py-3 text-center text-yellow-400/80">الوسيط التاريخي الفعلي<br/><span className="text-xs font-normal">لكل وحدة بند</span></th>
                <th className="px-3 py-3 text-center text-yellow-300/80">P80 التاريخي الفعلي</th>
                <th className="px-3 py-3 text-center text-red-400">نسبة المبالغة<br/><span className="text-xs font-normal">(معيار − فعلي) / فعلي</span></th>
                <th className="px-3 py-3 text-center">شدة المبالغة</th>
                <th className="px-3 py-3 text-center text-green-400">الكمية المقترحة الجديدة</th>
                <th className="px-3 py-3 text-center text-green-300">نسبة التصحيح</th>
                <th className="px-3 py-3 text-center">الثقة</th>
                <th className="px-3 py-3 text-center">مشاريع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overAllocRows.slice(0, 250).map((row: AnalyticsRow, i) => {
                const overPct  = parseFloat(row.stdOverAllocPct ?? "0");
                const corrRatio = row.correctionRatio ? parseFloat(row.correctionRatio) : null;
                const confColor: Record<string, string> = { "عالية": "text-green-400", "متوسطة": "text-yellow-400", "منخفضة": "text-red-400" };
                return (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2.5 max-w-[150px]">
                      <div className="truncate font-medium text-foreground">{row.boqItemName}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[130px]">
                      <div className="truncate text-muted-foreground">{row.elementName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-foreground/70">{n(row.origStdQty, 4)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-yellow-400">{n(row.medianClearedQty, 4)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-yellow-300">{n(row.p80ClearedQty, 4)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold text-sm ${overPct > 100 ? "text-red-400" : overPct > 50 ? "text-orange-400" : "text-yellow-400"}`}>
                        {pct(row.stdOverAllocPct)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <SeverityBadge pct={overPct} />
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-green-400">{n(row.adaptiveQty, 4)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold ${corrRatio == null ? "text-muted-foreground" : corrRatio < 0.8 ? "text-red-400" : corrRatio < 0.95 ? "text-orange-400" : "text-green-400"}`}>
                        {corrRatio != null ? `${(corrRatio * 100).toFixed(0)}%` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-xs font-medium ${confColor[row.confidenceLevel ?? ""] ?? "text-muted-foreground"}`}>
                        {row.confidenceLevel ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{row.nProjects}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {overAllocRows.length === 0 && (
          <div className="p-10 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد عناصر بمبالغة تتجاوز الحد المحدد</p>
            <p className="text-xs text-muted-foreground mt-1">
              {allRows.some(r => r.stdOverAllocPct) ? "جرّب تخفيض الحد الأدنى" : "قم بتشغيل التحليل أولاً لحساب البيانات المنسّبة"}
            </p>
          </div>
        )}
        {overAllocRows.length > 250 && (
          <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
            يُعرض أول 250 نتيجة من {overAllocRows.length.toLocaleString("ar-EG")}. استخدم البحث للتضييق.
          </div>
        )}
      </div>
    </div>
  );
}
