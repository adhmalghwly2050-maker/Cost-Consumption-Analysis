import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { BookOpen, Search, RefreshCw, Database, ChevronDown, ChevronUp, Upload, FileSpreadsheet } from "lucide-react";

const SHEET_COLORS: Record<string, string> = {
  "الرصيف": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "هندهول": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "منهولات": "bg-green-500/10 text-green-400 border-green-500/20",
  "اعمده تعليق": "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  "الاسفلت": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "اسفلت": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "غرفه تفتيش": "bg-teal-500/10 text-teal-400 border-teal-500/20",
  "خرسانه تحت الاسفلت": "bg-red-500/10 text-red-400 border-red-500/20",
  "شلتر": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  "لياسه": "bg-pink-500/10 text-pink-400 border-pink-500/20",
  "WFBB": "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

const fmtNum = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const fmtPrice = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function StandardPage() {
  const qc = useQueryClient();
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [sheetFilter, setSheetFilter] = useState("الكل");
  const [expanded, setExpanded] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["standard"],
    queryFn: api.getStandard,
  });

  const items = data?.items ?? [];

  const sheets = useMemo(() => {
    const s = new Set(items.map(i => i.item.sheet).filter(Boolean));
    return ["الكل", ...Array.from(s)];
  }, [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(i =>
        i.item.name.toLowerCase().includes(q) ||
        i.item.number.includes(q) ||
        i.elements.some((e: { name: string }) => e.name.toLowerCase().includes(q))
      );
    }
    if (sheetFilter !== "الكل") {
      r = r.filter(i => i.item.sheet === sheetFilter);
    }
    return r;
  }, [items, search, sheetFilter]);

  const handleSeedStandard = async () => {
    setSeeding(true);
    try {
      const r = await api.seedStandard();
      toast.success(`تم تحميل ${r.inserted} عنصر من قاعدة المرجع المعياري`);
      qc.invalidateQueries({ queryKey: ["standard"] });
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  const handleImportFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("يرجى رفع ملف Excel أو CSV (.xlsx / .xls / .csv)");
      return;
    }
    setImporting(true);
    try {
      const r = await api.importStandardFromExcel(file);
      toast.success(`تم استيراد ${r.inserted} صنف لـ ${r.items} بند معياري`);
      qc.invalidateQueries({ queryKey: ["standard"] });
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">قاعدة البيانات المرجعية المعيارية</h1>
          <p className="text-sm text-muted-foreground mt-1">
            الكميات والأسعار المعيارية لجميع البنود الإنشائية — {items.length} بند
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Import from Excel */}
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => handleImportFile(e.target.files)}
          />
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            title="استيراد كميات معيارية من ملف Excel أو CSV"
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors border border-border"
          >
            {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-green-400" />}
            استيراد من Excel
          </button>
          <button
            onClick={handleSeedStandard}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {seeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {items.length === 0 ? "تحميل البيانات المعيارية" : "إعادة تحميل البيانات"}
          </button>
        </div>
      </div>

      {/* Import format hint */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
        <FileSpreadsheet className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <span className="text-blue-400 font-medium">تنسيق ملف الاستيراد: </span>
          يجب أن يحتوي الملف على أعمدة: <span className="font-mono text-foreground">اسم البند</span> ،{" "}
          <span className="font-mono text-foreground">اسم الصنف</span> ،{" "}
          <span className="font-mono text-foreground">الكمية</span> (إلزامي) +{" "}
          <span className="font-mono text-foreground">رقم البند</span> ،{" "}
          <span className="font-mono text-foreground">الورقة</span> ،{" "}
          <span className="font-mono text-foreground">وحدة البند</span> ،{" "}
          <span className="font-mono text-foreground">وحدة الصنف</span> ،{" "}
          <span className="font-mono text-foreground">سعر الوحدة</span> (اختياري) — صف واحد لكل صنف.
        </div>
      </div>

      {/* Load data notice */}
      {items.length === 0 && !isLoading && (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">قاعدة البيانات المرجعية فارغة</h3>
          <p className="text-sm text-muted-foreground mb-5">
            انقر على "تحميل البيانات المعيارية" لاستيراد الكميات والأسعار المعيارية لجميع البنود
          </p>
          <button
            onClick={handleSeedStandard}
            disabled={seeding}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 mx-auto"
          >
            {seeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            تحميل البيانات المعيارية
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-48">
              <SearchIcon className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الرقم أو الصنف..."
                className="w-full bg-card border border-input rounded-lg py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
              />
            </div>
            <select
              value={sheetFilter}
              onChange={e => setSheetFilter(e.target.value)}
              className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              {sheets.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {filtered.length} بند
            </span>
          </div>

          {/* Sheet summary badges */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(
              items.reduce((acc, i) => {
                acc[i.item.sheet || "أخرى"] = (acc[i.item.sheet || "أخرى"] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([sheet, count]) => (
              <button
                key={sheet}
                onClick={() => setSheetFilter(sheetFilter === sheet ? "الكل" : sheet)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
                  ${SHEET_COLORS[sheet] || "bg-muted/50 text-muted-foreground border-muted"}
                  ${sheetFilter === sheet ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
              >
                {sheet} ({count})
              </button>
            ))}
          </div>

          {/* Items list */}
          <div className="space-y-3">
            {filtered.map(({ item, elements }) => {
              const isOpen = expanded === item.id;
              const totalStdCost = (elements as Array<{ qty: number; price: number }>)
                .reduce((s, e) => s + e.qty * e.price, 0);

              return (
                <div key={item.id} className="bg-card border border-card-border rounded-xl overflow-hidden">
                  {/* Item header */}
                  <button
                    className="w-full flex items-center justify-between p-4 text-right hover:bg-secondary/20 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {item.number && (
                        <span className="bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1 rounded-md flex-shrink-0">
                          {item.number}
                        </span>
                      )}
                      <div className="min-w-0 text-right">
                        <div className="font-semibold text-sm text-foreground truncate">{item.name}</div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${SHEET_COLORS[item.sheet] || "bg-muted/50 text-muted-foreground border-muted"}`}>
                            {item.sheet}
                          </span>
                          <span className="text-xs text-muted-foreground">الوحدة: {item.unit || "—"}</span>
                          <span className="text-xs text-muted-foreground">{elements.length} عنصر</span>
                          {totalStdCost > 0 && (
                            <span className="text-xs text-accent font-medium">
                              الإجمالي: {fmtPrice(totalStdCost)} ر.ي
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 mr-3 text-muted-foreground">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {/* Elements table */}
                  {isOpen && (
                    <div className="border-t border-border">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[500px]">
                          <thead>
                            <tr className="bg-secondary/30">
                              <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground w-8">م</th>
                              <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">اسم الصنف</th>
                              <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground w-20">الوحدة</th>
                              <th className="px-4 py-2.5 text-center font-semibold text-yellow-400 w-28">الكمية للوحدة</th>
                              <th className="px-4 py-2.5 text-center font-semibold text-purple-400 w-28">سعر الوحدة</th>
                              <th className="px-4 py-2.5 text-center font-semibold text-green-400 w-32">الإجمالي</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(elements as Array<{ name: string; unit: string; qty: number; price: number }>)
                              .map((el, i) => {
                                const total = el.qty * el.price;
                                return (
                                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                                    <td className="px-4 py-2.5 text-muted-foreground text-center">{i + 1}</td>
                                    <td className="px-4 py-2.5 font-medium text-foreground">{el.name}</td>
                                    <td className="px-4 py-2.5 text-center text-muted-foreground">{el.unit || "—"}</td>
                                    <td className="px-4 py-2.5 text-center font-mono text-yellow-400">
                                      {fmtNum(el.qty)}
                                    </td>
                                    <td className="px-4 py-2.5 text-center font-mono text-purple-400">
                                      {fmtPrice(el.price)}
                                    </td>
                                    <td className="px-4 py-2.5 text-center font-mono font-bold text-green-400">
                                      {total > 0 ? fmtPrice(total) : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                          {totalStdCost > 0 && (
                            <tfoot>
                              <tr className="bg-secondary/50 border-t-2 border-primary/30">
                                <td colSpan={5} className="px-4 py-2.5 font-bold text-foreground text-left">
                                  إجمالي التكلفة المعيارية للوحدة
                                </td>
                                <td className="px-4 py-2.5 text-center font-bold text-accent">
                                  {fmtPrice(totalStdCost)} ر.ي
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <SearchIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>لا توجد نتائج مطابقة للبحث</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
}
