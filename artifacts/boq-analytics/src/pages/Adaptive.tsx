import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type AnalyticsRow } from "@/lib/api";
import { Search, RefreshCw, AlertTriangle, Zap, TrendingDown, TrendingUp, Minus, Info, Download } from "lucide-react";
import { toast } from "sonner";

const n = (v: string | number | null | undefined, d = 3) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtAmt = (v: string | number | null | undefined) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function CorrectionBadge({ ratio }: { ratio: string | null }) {
  if (!ratio) return <span className="text-muted-foreground text-xs">—</span>;
  const r = parseFloat(ratio);
  let color = "", icon = null, label = "";
  if (r > 1.20) {
    color = "bg-blue-500/15 text-blue-400 border border-blue-500/30";
    icon = <TrendingUp className="w-3 h-3" />;
    label = `${(r * 100).toFixed(0)}%`;
  } else if (r > 1.05) {
    color = "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30";
    icon = <TrendingUp className="w-3 h-3" />;
    label = `${(r * 100).toFixed(0)}%`;
  } else if (r >= 0.95) {
    color = "bg-green-500/15 text-green-400 border border-green-500/30";
    icon = <Minus className="w-3 h-3" />;
    label = `${(r * 100).toFixed(0)}%`;
  } else if (r >= 0.80) {
    color = "bg-orange-500/15 text-orange-400 border border-orange-500/30";
    icon = <TrendingDown className="w-3 h-3" />;
    label = `${(r * 100).toFixed(0)}%`;
  } else {
    color = "bg-red-500/15 text-red-400 border border-red-500/30";
    icon = <TrendingDown className="w-3 h-3" />;
    label = `${(r * 100).toFixed(0)}%`;
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {icon}{label}
    </span>
  );
}

function ConfidenceDot({ level }: { level: string | null }) {
  if (!level) return <span className="text-muted-foreground text-xs">—</span>;
  const cfg: Record<string, string> = {
    "عالية":   "bg-green-400",
    "متوسطة":  "bg-yellow-400",
    "منخفضة":  "bg-red-400",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg[level] ?? "bg-muted"}`} />
      {level}
    </span>
  );
}

export default function AdaptivePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [itemFilter, setItemFilter] = useState("الكل");
  const [corrFilter, setCorrFilter] = useState("الكل");

  const { data, isLoading } = useQuery({
    queryKey: ["adaptive-standards"],
    queryFn: api.getAdaptiveStandards,
  });

  const runMutation = useMutation({
    mutationFn: api.runAnalytics,
    onSuccess: (d) => {
      toast.success(`تم تحديث ${d.analyzedGroups} مجموعة`);
      queryClient.invalidateQueries({ queryKey: ["adaptive-standards"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedMutation = useMutation({
    mutationFn: api.seedStandard,
    onSuccess: (d) => {
      toast.success(`تم تحميل ${d.inserted} عنصر من المرجع المعياري`);
      queryClient.invalidateQueries({ queryKey: ["adaptive-standards"] });
      queryClient.invalidateQueries({ queryKey: ["standard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.standards ?? [];

  const boqItems = useMemo(() => {
    const s = new Set(rows.map(r => r.boqItemName));
    return ["الكل", ...Array.from(s).sort((a, b) => a.localeCompare(b, "ar"))];
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row => row.boqItemName?.toLowerCase().includes(q) || row.elementName?.toLowerCase().includes(q));
    }
    if (itemFilter !== "الكل") r = r.filter(row => row.boqItemName === itemFilter);
    if (corrFilter !== "الكل") {
      r = r.filter(row => {
        const ratio = row.correctionRatio ? parseFloat(row.correctionRatio) : null;
        if (!ratio) return corrFilter === "غير مرتبط";
        if (corrFilter === "تقليص كبير")  return ratio < 0.80;
        if (corrFilter === "تقليص طفيف")  return ratio >= 0.80 && ratio < 0.95;
        if (corrFilter === "مطابق")        return ratio >= 0.95 && ratio <= 1.05;
        if (corrFilter === "زيادة طفيفة") return ratio > 1.05 && ratio <= 1.20;
        if (corrFilter === "زيادة كبيرة") return ratio > 1.20;
        return true;
      });
    }
    return r;
  }, [rows, search, itemFilter, corrFilter]);

  // Summary stats
  const hasAdaptive = rows.some(r => r.adaptiveQty);
  const totalOrigAmt   = rows.reduce((s, r) => s + (r.origStdAmount   ? parseFloat(r.origStdAmount)   : 0), 0);
  const totalAdaptAmt  = rows.reduce((s, r) => s + (r.adaptiveAmount  ? parseFloat(r.adaptiveAmount)  : 0), 0);
  const savingsEst     = totalOrigAmt - totalAdaptAmt;
  const nWithStd       = rows.filter(r => r.origStdQty).length;
  const nReduced       = rows.filter(r => r.correctionRatio && parseFloat(r.correctionRatio) < 0.95).length;
  const nIncreased     = rows.filter(r => r.correctionRatio && parseFloat(r.correctionRatio) > 1.05).length;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  if (rows.length === 0) return (
    <div className="bg-card border border-card-border rounded-xl p-10 text-center" dir="rtl">
      <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-semibold text-foreground mb-2">لا توجد معايير تكيفية بعد</h3>
      <p className="text-sm text-muted-foreground mb-4">يرجى رفع بيانات تاريخية ثم تشغيل التحليل الإحصائي</p>
      <button
        onClick={() => runMutation.mutate(undefined)}
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
            <Zap className="w-6 h-6 text-primary" />
            المعايير التكيفية الذكية
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            منظومة التصحيح الذاتي للمعايير — مقارنة 3 طبقات: المعياري الأصلي، التاريخي الفعلي، والموصى به التكيفي
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => seedMutation.mutate(undefined)}
            disabled={seedMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground border border-border rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${seedMutation.isPending ? "animate-spin" : ""}`} />
            تحميل المرجع المعياري
          </button>
          <button
            onClick={() => runMutation.mutate(undefined)}
            disabled={runMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
            تحديث التحليل
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">دليل قراءة نسبة التصحيح</span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
            <TrendingDown className="w-3 h-3" /> أقل من 80% — المعيار الأصلي يُبالغ بشكل كبير
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
            <TrendingDown className="w-3 h-3" /> 80%–95% — تبالغ طفيف في التخصيص
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
            <Minus className="w-3 h-3" /> 95%–105% — تطابق جيد مع الواقع
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
            <TrendingUp className="w-3 h-3" /> 105%–120% — المعيار الأصلي أقل من الحاجة قليلاً
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <TrendingUp className="w-3 h-3" /> أكثر من 120% — المعيار الأصلي يُقلّل من الكمية الفعلية
          </span>
        </div>
      </div>

      {/* Summary KPIs */}
      {hasAdaptive && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "عناصر مرتبطة بمعيار", value: nWithStd.toLocaleString("ar-EG"), color: "text-primary" },
            { label: "عناصر تحتاج تقليص", value: nReduced.toLocaleString("ar-EG"), color: "text-orange-400" },
            { label: "عناصر تحتاج زيادة", value: nIncreased.toLocaleString("ar-EG"), color: "text-blue-400" },
            { label: "فرق المبالغ (أصلي - تكيفي)", value: `${fmtAmt(savingsEst)} ر.ي`, color: savingsEst > 0 ? "text-green-400" : "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-card-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن بند أو عنصر..."
            className="w-full bg-card border border-input rounded-lg py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
          />
        </div>
        <select
          value={itemFilter}
          onChange={e => setItemFilter(e.target.value)}
          className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary max-w-[200px]"
        >
          {boqItems.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select
          value={corrFilter}
          onChange={e => setCorrFilter(e.target.value)}
          className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          {["الكل", "تقليص كبير", "تقليص طفيف", "مطابق", "زيادة طفيفة", "زيادة كبيرة", "غير مرتبط"].map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length.toLocaleString("ar-EG")} عنصر</span>
      </div>

      {/* 3-Layer Table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: "1400px" }}>
            <thead>
              {/* Layer header row */}
              <tr className="border-b border-border bg-secondary/10 text-center text-xs">
                <th className="px-3 py-2 text-right border-l border-border" colSpan={2} />
                <th className="px-3 py-2 text-primary/80 font-semibold border border-border/50 bg-secondary/20" colSpan={3}>
                  الطبقة الأولى — المعيار الأصلي
                </th>
                <th className="px-3 py-2 text-yellow-400/80 font-semibold border border-border/50 bg-yellow-400/5" colSpan={4}>
                  الطبقة الثانية — السلوك التاريخي الفعلي
                </th>
                <th className="px-3 py-2 text-green-400/80 font-semibold border border-border/50 bg-green-400/5" colSpan={3}>
                  الطبقة الثالثة — الموصى به التكيفي
                </th>
                <th className="px-3 py-2 border-r border-border/50" colSpan={2} />
              </tr>
              {/* Column header row */}
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                <th className="px-3 py-2 text-right whitespace-nowrap">البند</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">العنصر</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-primary/70">الكمية المعيارية</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-primary/70">السعر المعياري</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-primary/70">المبلغ المعياري</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-yellow-400/80">وسيط الكميات المخلاة</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-yellow-400/80">P80 الكميات</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-yellow-400/80">وسيط السعر الفعلي</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-yellow-400/80">مشاريع</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-green-400">الكمية المقترحة</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-green-400">السعر المقترح</th>
                <th className="px-3 py-2 text-center whitespace-nowrap text-green-400">المبلغ المقترح</th>
                <th className="px-3 py-2 text-center whitespace-nowrap">نسبة التصحيح</th>
                <th className="px-3 py-2 text-center whitespace-nowrap">الثقة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 300).map((row: AnalyticsRow, i) => (
                <tr key={i} className="hover:bg-secondary/20 transition-colors">
                  {/* BOQ Item */}
                  <td className="px-3 py-2.5 max-w-[160px]">
                    <div className="truncate font-medium text-foreground text-xs">{row.boqItemName}</div>
                  </td>
                  {/* Element */}
                  <td className="px-3 py-2.5 max-w-[140px]">
                    <div className="truncate text-muted-foreground">{row.elementName}</div>
                    {row.elementCode && <div className="text-muted-foreground/60 text-xs">{row.elementCode}</div>}
                  </td>
                  {/* Layer 1 */}
                  <td className="px-3 py-2.5 text-center font-mono text-foreground/70 bg-secondary/5">
                    {n(row.origStdQty, 4)}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-foreground/70 bg-secondary/5">
                    {fmtAmt(row.origStdPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-foreground/70 bg-secondary/5">
                    {fmtAmt(row.origStdAmount)}
                  </td>
                  {/* Layer 2 */}
                  <td className="px-3 py-2.5 text-center font-mono text-yellow-400 bg-yellow-400/3">
                    {n(row.medianClearedQty, 3)}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-yellow-300 bg-yellow-400/3">
                    {n(row.p80ClearedQty, 3)}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-orange-400 bg-yellow-400/3">
                    {fmtAmt(row.medianActualPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground bg-yellow-400/3">
                    {row.nProjects}
                  </td>
                  {/* Layer 3 */}
                  <td className="px-3 py-2.5 text-center font-mono font-bold text-green-400 bg-green-400/3">
                    {n(row.adaptiveQty, 3)}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-bold text-green-300 bg-green-400/3">
                    {fmtAmt(row.adaptiveUnitPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-bold text-accent bg-green-400/3">
                    {fmtAmt(row.adaptiveAmount)}
                  </td>
                  {/* Correction */}
                  <td className="px-3 py-2.5 text-center">
                    <CorrectionBadge ratio={row.correctionRatio} />
                  </td>
                  {/* Confidence */}
                  <td className="px-3 py-2.5 text-center">
                    <ConfidenceDot level={row.confidenceLevel} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 300 && (
          <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
            يُعرض أول 300 نتيجة من {filtered.length.toLocaleString("ar-EG")}. استخدم البحث أو الفلتر للتضييق.
          </div>
        )}
        {filtered.length === 0 && (
          <div className="p-10 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد نتائج مطابقة للبحث</p>
          </div>
        )}
      </div>
    </div>
  );
}
