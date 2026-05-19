import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, RefreshCw, AlertTriangle, GitCompareArrows, BookOpen, TrendingUp, TrendingDown, Download, Pencil, Check, X, Printer } from "lucide-react";
import { toast } from "sonner";

interface ComparisonElement {
  elementName: string;
  elementUnit: string | null;
  hasStandard: boolean;
  stdQty: string | null;
  stdPrice: string | null;
  stdAmount: string | null;
  medianReqQty: string | null;
  totalReqQty: string | null;
  totalReqAmount: string | null;
  medianClrQty: string | null;
  totalClrQty: string | null;
  totalClrAmount: string | null;
  nProjects: number;
  nCleared: number;
}

const fmt = (v: string | number | null | undefined, d = 4) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: d });

const fmtAmt = (v: string | number | null | undefined) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function DiffBadge({ std, actual }: { std: string | null; actual: string | null }) {
  if (!std || !actual) return null;
  const s = parseFloat(std);
  const a = parseFloat(actual);
  if (s <= 0) return null;
  const pct = ((a - s) / s) * 100;
  const abs = Math.abs(pct);
  if (abs < 5) return <span className="text-xs text-green-400 ml-1">(مطابق)</span>;
  const color = pct > 0 ? "text-blue-400" : "text-orange-400";
  const sign = pct > 0 ? "+" : "";
  return <span className={`text-xs ${color} ml-1`}>({sign}{pct.toFixed(0)}%)</span>;
}

function EditableCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setDraft(value ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 10);
  };
  const save = () => {
    onSave(draft);
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
          className="w-24 bg-background border border-primary rounded px-2 py-0.5 text-xs text-foreground outline-none text-center"
        />
        <button onClick={save} className="text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={cancel} className="text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-1 group">
      <span className={value ? "text-foreground" : "text-muted-foreground/50 italic text-xs"}>
        {value ? fmt(value, 4) : "أدخل يدوياً"}
      </span>
      <button onClick={start} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity">
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function ItemComparisonPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [showList, setShowList] = useState(false);
  const [manualStd, setManualStd] = useState<Record<string, { qty?: string; price?: string }>>({});

  const { data: allItemsData } = useQuery({
    queryKey: ["boq-items-all"],
    queryFn: api.getBoqItemsAll,
  });
  const allItems = allItemsData?.items ?? [];
  const filtered = allItems.filter(i => i.toLowerCase().includes(search.toLowerCase()));

  const seedMutation = useMutation({
    mutationFn: api.seedStandard,
    onSuccess: (d) => {
      toast.success(`تم تحميل ${d.inserted} عنصر من المرجع المعياري`);
      qc.invalidateQueries({ queryKey: ["item-comparison", selected] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["item-comparison", selected],
    queryFn: () => api.getItemComparison(selected),
    enabled: !!selected,
  });

  const elements: ComparisonElement[] = data?.elements ?? [];
  const boqUnit = data?.boqUnit ?? null;

  const getStdQty = (el: ComparisonElement) =>
    manualStd[el.elementName]?.qty ?? el.stdQty;
  const getStdPrice = (el: ComparisonElement) =>
    manualStd[el.elementName]?.price ?? el.stdPrice;
  const getStdAmount = (el: ComparisonElement) => {
    const q = parseFloat(getStdQty(el) ?? "");
    const p = parseFloat(getStdPrice(el) ?? "");
    if (!isNaN(q) && !isNaN(p)) return (q * p).toFixed(2);
    return el.stdAmount;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GitCompareArrows className="w-6 h-6 text-primary" />
            مقارنة بند
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            جدول مقارنة ثلاثي: الكميات المعيارية · التعزيز (الطلب) · الإخلاء — لكل عنصر بالنسبة لوحدة البند
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <button
            onClick={() => seedMutation.mutate(undefined)}
            disabled={seedMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground border border-border rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${seedMutation.isPending ? "animate-spin" : ""}`} />
            تحميل المرجع المعياري
          </button>
          {selected && elements.length > 0 && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Printer className="w-4 h-4" />
              طباعة المقارنة
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-secondary/50 border border-border inline-block" />
            <span className="font-semibold text-primary/80">الطبقة 1 — المعياري:</span>
            <span className="text-muted-foreground">الكميات المرجعية من جداول المعيار. قابلة للإدخال اليدوي إذا لم تُحمَّل.</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-blue-400/20 border border-blue-400/30 inline-block" />
            <span className="font-semibold text-blue-400">الطبقة 2 — التعزيز:</span>
            <span className="text-muted-foreground">وسيط الكميات التي طلبها الفرع (عزّز بها) مقسومة على كمية البند.</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-green-400/20 border border-green-400/30 inline-block" />
            <span className="font-semibold text-green-400">الطبقة 3 — الإخلاء:</span>
            <span className="text-muted-foreground">وسيط الكميات التي أخلاها الفرع فعلياً (الصفر مُستثنى من الوسيط).</span>
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <label className="block text-sm font-medium text-foreground mb-2">ابحث عن البند</label>
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setShowList(true); }}
            onFocus={() => setShowList(true)}
            placeholder="اكتب اسم البند..."
            className="w-full bg-background border border-input rounded-lg py-2.5 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
          />
        </div>
        {showList && search && filtered.length > 0 && (
          <div className="mt-2 bg-background border border-border rounded-lg max-h-56 overflow-y-auto shadow-lg z-10 relative">
            {filtered.slice(0, 30).map(item => (
              <button
                key={item}
                onClick={() => { setSelected(item); setSearch(item); setShowList(false); setManualStd({}); }}
                className={`w-full text-right px-4 py-2.5 text-sm hover:bg-secondary transition-colors border-b border-border last:border-0
                  ${selected === item ? "bg-primary/10 text-primary font-medium" : "text-foreground"}`}
              >
                {item}
              </button>
            ))}
          </div>
        )}
        {!selected && (
          <p className="text-xs text-muted-foreground mt-2">اختر بنداً من القائمة لعرض جدول المقارنة</p>
        )}
      </div>

      {/* Loading */}
      {isLoading && selected && (
        <div className="flex items-center justify-center h-40">
          <RefreshCw className="w-7 h-7 text-primary animate-spin" />
        </div>
      )}

      {/* No data */}
      {!isLoading && selected && elements.length === 0 && (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">لا توجد بيانات لهذا البند. تأكد من رفع ملف البيانات التاريخية.</p>
        </div>
      )}

      {/* Comparison Table */}
      {!isLoading && selected && elements.length > 0 && (
        <div className="space-y-3">
          {/* BOQ item summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-foreground">{selected}</span>
            {boqUnit && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">الوحدة: {boqUnit}</span>}
            <span className="text-xs text-muted-foreground">{elements.length} عنصر</span>
            {elements.some(e => !e.hasStandard && !manualStd[e.elementName]?.qty) && (
              <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
                <BookOpen className="w-3 h-3" />
                بعض العناصر بدون مرجع معياري — يمكن الإدخال يدوياً
              </span>
            )}
          </div>

          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "900px" }}>
                <thead>
                  <tr className="border-b border-border bg-secondary/10 text-center text-xs">
                    <th className="px-3 py-2 text-right border-l border-border" colSpan={2} />
                    <th className="px-3 py-2 font-semibold text-primary/80 border border-border/50 bg-secondary/20" colSpan={3}>
                      الطبقة 1 — المعياري الأصلي
                    </th>
                    <th className="px-3 py-2 font-semibold text-blue-400 border border-border/50 bg-blue-400/5" colSpan={3}>
                      الطبقة 2 — التعزيز (الطلب)
                    </th>
                    <th className="px-3 py-2 font-semibold text-green-400 border border-border/50 bg-green-400/5" colSpan={3}>
                      الطبقة 3 — الإخلاء الفعلي
                    </th>
                    <th className="px-3 py-2 text-muted-foreground/60 border-r border-border/50" colSpan={2}>
                      مشاريع
                    </th>
                  </tr>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                    <th className="px-3 py-2 text-right whitespace-nowrap">العنصر</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">الوحدة</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap text-primary/70">الكمية / وحدة البند</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap text-primary/70">سعر الوحدة</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap text-primary/70">المبلغ / وحدة</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap text-blue-400/80">وسيط الطلب / وحدة</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap text-blue-400/80">إجمالي الطلبات</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap text-blue-400/80">مبلغ الطلبات</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap text-green-400">وسيط الإخلاء / وحدة</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap text-green-400">إجمالي الإخلاء</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap text-green-400">مبلغ الإخلاء</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">الكل</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">أُخلي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {elements.map((el, i) => {
                    const stdQty = getStdQty(el);
                    const stdPrice = getStdPrice(el);
                    const stdAmount = getStdAmount(el);
                    const hasAnyStd = !!stdQty || !!stdPrice;
                    return (
                      <tr key={i} className={`hover:bg-secondary/20 transition-colors ${!hasAnyStd ? "bg-yellow-400/3" : ""}`}>
                        {/* Element name */}
                        <td className="px-3 py-2.5 max-w-[180px]">
                          <div className="font-medium text-foreground truncate">{el.elementName}</div>
                          {!el.hasStandard && (
                            <div className="text-xs text-yellow-400/80 mt-0.5">بدون مرجع معياري</div>
                          )}
                        </td>
                        {/* Unit */}
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{el.elementUnit || "—"}</td>

                        {/* Layer 1 — Standard */}
                        <td className="px-3 py-2.5 text-center bg-secondary/5">
                          <EditableCell
                            value={manualStd[el.elementName]?.qty ?? el.stdQty}
                            onSave={v => setManualStd(prev => ({
                              ...prev,
                              [el.elementName]: { ...prev[el.elementName], qty: v },
                            }))}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-foreground/70 bg-secondary/5">
                          {stdPrice ? (
                            <EditableCell
                              value={manualStd[el.elementName]?.price ?? el.stdPrice}
                              onSave={v => setManualStd(prev => ({
                                ...prev,
                                [el.elementName]: { ...prev[el.elementName], price: v },
                              }))}
                            />
                          ) : (
                            <EditableCell
                              value={manualStd[el.elementName]?.price ?? null}
                              onSave={v => setManualStd(prev => ({
                                ...prev,
                                [el.elementName]: { ...prev[el.elementName], price: v },
                              }))}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-foreground/70 bg-secondary/5">
                          {stdAmount ? fmtAmt(stdAmount) : "—"}
                        </td>

                        {/* Layer 2 — Requested */}
                        <td className="px-3 py-2.5 text-center font-mono text-blue-400 bg-blue-400/3">
                          <div className="flex items-center justify-center gap-1">
                            {fmt(el.medianReqQty)}
                            <DiffBadge std={stdQty} actual={el.medianReqQty} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-blue-300 bg-blue-400/3">
                          {fmt(el.totalReqQty, 1)}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-blue-400 bg-blue-400/3">
                          {fmtAmt(el.totalReqAmount)}
                        </td>

                        {/* Layer 3 — Cleared */}
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-green-400 bg-green-400/3">
                          <div className="flex items-center justify-center gap-1">
                            {el.medianClrQty ? fmt(el.medianClrQty) : <span className="text-muted-foreground/50 text-xs">لم يُخلَ</span>}
                            {el.medianClrQty && <DiffBadge std={stdQty} actual={el.medianClrQty} />}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-green-300 bg-green-400/3">
                          {fmt(el.totalClrQty, 1)}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-green-400 bg-green-400/3">
                          {fmtAmt(el.totalClrAmount)}
                        </td>

                        {/* Projects */}
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{el.nProjects}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-xs font-medium ${el.nCleared > 0 ? "text-green-400" : "text-red-400/60"}`}>
                            {el.nCleared}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "إجمالي مبالغ الطلبات",
                value: fmtAmt(elements.reduce((s, e) => s + parseFloat(e.totalReqAmount ?? "0"), 0)),
                color: "text-blue-400",
              },
              {
                label: "إجمالي مبالغ الإخلاء",
                value: fmtAmt(elements.reduce((s, e) => s + parseFloat(e.totalClrAmount ?? "0"), 0)),
                color: "text-green-400",
              },
              {
                label: "إجمالي المبالغ المعيارية",
                value: fmtAmt(elements.reduce((s, e) => {
                  const a = parseFloat(getStdAmount(e) ?? "0");
                  return s + (isNaN(a) ? 0 : a);
                }, 0)),
                color: "text-primary",
              },
              {
                label: "نسبة الإخلاء من الطلب",
                value: (() => {
                  const req = elements.reduce((s, e) => s + parseFloat(e.totalReqAmount ?? "0"), 0);
                  const clr = elements.reduce((s, e) => s + parseFloat(e.totalClrAmount ?? "0"), 0);
                  return req > 0 ? `${((clr / req) * 100).toFixed(1)}%` : "—";
                })(),
                color: "text-yellow-400",
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-card-border rounded-xl p-4">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className={`text-lg font-bold ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Clearance gap analysis */}
          {elements.some(e => e.medianReqQty && e.medianClrQty) && (
            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-orange-400" />
                تحليل الفجوة — العناصر التي يختلف فيها الإخلاء عن الطلب
              </h3>
              <div className="space-y-2">
                {elements
                  .filter(e => e.medianReqQty && e.medianClrQty)
                  .map(e => {
                    const req = parseFloat(e.medianReqQty!);
                    const clr = parseFloat(e.medianClrQty!);
                    const pct = req > 0 ? ((clr - req) / req) * 100 : 0;
                    return { ...e, pct };
                  })
                  .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
                  .slice(0, 8)
                  .map((e, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-foreground truncate">{e.elementName}</div>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        {e.pct > 5
                          ? <TrendingUp className="w-3 h-3 text-blue-400" />
                          : e.pct < -5
                          ? <TrendingDown className="w-3 h-3 text-orange-400" />
                          : null}
                        <span className={
                          e.pct > 20 ? "text-blue-400" :
                          e.pct > 5  ? "text-blue-300" :
                          e.pct < -20 ? "text-red-400" :
                          e.pct < -5  ? "text-orange-400" :
                          "text-green-400"
                        }>
                          {e.pct > 0 ? "+" : ""}{e.pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-40 h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${e.pct > 0 ? "bg-blue-400" : "bg-orange-400"}`}
                          style={{ width: `${Math.min(100, Math.abs(e.pct) / 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
