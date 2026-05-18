import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type MatMaterial } from "@/lib/api";
import { BookOpen, RefreshCw, Layers, Search, CheckCircle, Tag } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_COLORS = [
  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "bg-green-500/10 text-green-400 border-green-500/20",
  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "bg-red-500/10 text-red-400 border-red-500/20",
  "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
];

export default function MaterialDictionaryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("الكل");
  const [showAliases, setShowAliases] = useState<number | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["mat-master"], queryFn: api.matGetMaster });

  const seedMutation = useMutation({
    mutationFn: api.matSeedDictionary,
    onSuccess: (d) => {
      toast.success(`تم تهيئة ${d.materials} مادة بـ ${d.aliases} اسم بديل`);
      qc.invalidateQueries({ queryKey: ["mat-master"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkMutation = useMutation({
    mutationFn: api.matAutoLink,
    onSuccess: (d) => {
      toast.success(`تم ربط ${d.linked} عنصر تلقائياً`);
      if (d.unlinked.length > 0) {
        toast.info(`${d.unlinked.length} عنصر لم يُربط: ${d.unlinked.slice(0,3).join("، ")}...`);
      }
      qc.invalidateQueries({ queryKey: ["mat-master"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const materials = data?.materials ?? [];
  const categories = data?.categories ?? [];

  const catColorMap = new Map(categories.map((c, i) => [c.nameAr, CATEGORY_COLORS[i % CATEGORY_COLORS.length]]));

  const filtered = materials.filter(m => {
    if (catFilter !== "الكل" && m.categoryName !== catFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return m.canonicalName.toLowerCase().includes(q) ||
        m.canonicalNameEn?.toLowerCase().includes(q) ||
        m.aliases.some(a => a.toLowerCase().includes(q));
    }
    return true;
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-400" />
            قاموس المواد الموحّد
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            قاعدة بيانات المواد المركزية — توحيد الأسماء المختلفة لنفس المادة عبر المشاريع
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-medium hover:bg-blue-500/20 disabled:opacity-50">
            <BookOpen className={`w-4 h-4 ${seedMutation.isPending ? "animate-spin" : ""}`} />
            تهيئة / إعادة تهيئة القاموس
          </button>
          <button onClick={() => linkMutation.mutate()} disabled={linkMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-lg text-sm font-medium hover:bg-purple-500/20 disabled:opacity-50">
            <Layers className={`w-4 h-4 ${linkMutation.isPending ? "animate-spin" : ""}`} />
            ربط العناصر التلقائي
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المواد", value: materials.length, color: "text-blue-400" },
          { label: "أسماء بديلة", value: materials.reduce((s, m) => s + m.aliases.length, 0), color: "text-purple-400" },
          { label: "الفئات", value: categories.length, color: "text-orange-400" },
          { label: "النتائج الحالية", value: filtered.length, color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className={`text-xl font-bold ${color}`}>{value.toLocaleString("ar-EG")}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث باسم المادة أو الاسم البديل..."
            className="w-full bg-card border border-input rounded-lg py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary">
          <option value="الكل">كل الفئات</option>
          {categories.map(c => <option key={c.id} value={c.nameAr}>{c.nameAr}</option>)}
        </select>
      </div>

      {/* Category chips */}
      <div className="flex gap-2 flex-wrap">
        {["الكل", ...categories.map(c => c.nameAr)].map(cat => (
          <button key={cat} onClick={() => setCatFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${catFilter === cat ? (catColorMap.get(cat) ?? "bg-primary/10 text-primary border-primary/30") : "bg-card border-card-border text-muted-foreground hover:bg-secondary"}`}>
            {cat}
          </button>
        ))}
      </div>

      {materials.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center">
          <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-2">القاموس فارغ</h3>
          <p className="text-sm text-muted-foreground mb-4">اضغط "تهيئة القاموس" لإنشاء قاعدة المواد الأولية</p>
          <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
            تهيئة القاموس
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((mat: MatMaterial) => {
            const catColor = catColorMap.get(mat.categoryName ?? "") ?? "bg-muted/20 text-muted-foreground border-muted/30";
            const isOpen = showAliases === mat.id;
            return (
              <div key={mat.id} className="bg-card border border-card-border rounded-xl p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="font-bold text-foreground">{mat.canonicalName}</div>
                    {mat.canonicalNameEn && (
                      <div className="text-xs text-muted-foreground font-mono">{mat.canonicalNameEn}</div>
                    )}
                  </div>
                  {mat.categoryName && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${catColor}`}>
                      {mat.categoryName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  {mat.unit && <span className="bg-secondary px-2 py-0.5 rounded font-mono">{mat.unit}</span>}
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {mat.aliases.length} اسم بديل
                  </span>
                </div>
                <button onClick={() => setShowAliases(isOpen ? null : mat.id)}
                  className="text-xs text-primary hover:underline">
                  {isOpen ? "إخفاء الأسماء البديلة" : "عرض الأسماء البديلة"}
                </button>
                {isOpen && mat.aliases.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {mat.aliases.map((alias, i) => (
                      <span key={i} className="px-2 py-0.5 bg-secondary text-muted-foreground rounded text-xs">{alias}</span>
                    ))}
                  </div>
                )}
                {isOpen && mat.aliases.length === 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">لا توجد أسماء بديلة مسجّلة</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
