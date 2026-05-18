import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { FileX2, Printer, RefreshCw, AlertTriangle, TrendingDown } from "lucide-react";

const fmtNum = (n: string | null | undefined) =>
  n ? parseFloat(n).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "—";

const fmtPct = (n: string | null | undefined) =>
  n ? `${parseFloat(n).toFixed(1)}%` : "—";

function getPctColor(pct: string) {
  const v = parseFloat(pct);
  if (v >= 90) return "text-red-400 font-bold";
  if (v >= 75) return "text-orange-400 font-semibold";
  return "text-yellow-400";
}

export default function UnexecutedReportPage() {
  const printRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["report-unexecuted"],
    queryFn: api.getUnexecutedReport,
  });

  const rows = data?.rows ?? [];

  const handlePrint = () => window.print();

  const totalRequestedAmount = rows.reduce((s, r) => s + parseFloat(r.totalRequestedAmount || "0"), 0);
  const fullyUnexecuted = rows.filter(r => parseFloat(r.pctUnexecuted) >= 90).length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileX2 className="w-6 h-6 text-orange-400" />
            تقرير البنود المطلوبة وغير المنفذة
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            عناصر تم طلبها تاريخياً ولم يتم تنفيذها (إخلاء) بشكل فعلي في أغلب المشاريع
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Printer className="w-4 h-4" />
            طباعة التقرير
          </button>
        </div>
      </div>

      {/* Printable content */}
      <div ref={printRef}>
        {/* Print header */}
        <div className="hidden print:block mb-8 border-b-2 border-gray-800 pb-4">
          <h1 className="text-2xl font-bold text-center text-gray-900">
            تقرير البنود المطلوبة وغير المنفذة فعلياً
          </h1>
          <p className="text-center text-gray-600 text-sm mt-1">
            منصة الذكاء الإنشائي التكيفي — {new Date().toLocaleDateString("ar-SA")}
          </p>
        </div>

        {/* KPI cards */}
        {!isLoading && rows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-5 print:border-gray-300">
              <div className="text-xs text-muted-foreground mb-1 print:text-gray-600">إجمالي العناصر غير المنفذة</div>
              <div className="text-3xl font-bold text-orange-400 print:text-gray-900">{rows.length}</div>
              <div className="text-xs text-muted-foreground mt-1 print:text-gray-600">عنصر في بنود متعددة</div>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5 print:border-gray-300">
              <div className="text-xs text-muted-foreground mb-1 print:text-gray-600">مُهمَل كلياً (+90%)</div>
              <div className="text-3xl font-bold text-red-400 print:text-gray-900">{fullyUnexecuted}</div>
              <div className="text-xs text-muted-foreground mt-1 print:text-gray-600">عنصر لم يُنفَّذ في أغلب المشاريع</div>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5 print:border-gray-300">
              <div className="text-xs text-muted-foreground mb-1 print:text-gray-600">إجمالي المبالغ المطلوبة (غير منفذة)</div>
              <div className="text-2xl font-bold text-yellow-400 print:text-gray-900">
                {totalRequestedAmount.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-muted-foreground mt-1 print:text-gray-600">ر.ي</div>
            </div>
          </div>
        )}

        {/* Executive summary for print */}
        {!isLoading && rows.length > 0 && (
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5 print:border-gray-300 print:bg-gray-50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5 print:hidden" />
              <div>
                <h3 className="font-semibold text-foreground mb-2 print:text-gray-900">الملخص التنفيذي</h3>
                <p className="text-sm text-muted-foreground leading-relaxed print:text-gray-700">
                  رصدت المنصة <strong className="text-foreground print:text-gray-900">{rows.length}</strong> عنصراً تاريخياً يُطلب ولا يُنفَّذ فعلياً في أغلب المشاريع،
                  منها <strong className="text-red-400 print:text-gray-900">{fullyUnexecuted}</strong> عنصراً يُهمَل بنسبة تزيد عن 90%.
                  {totalRequestedAmount > 0 && (
                    <> يمثل ذلك ميزانية طلبات غير منفذة تبلغ{" "}
                    <strong className="text-orange-400 print:text-gray-900">
                      {totalRequestedAmount.toLocaleString("ar-EG", { maximumFractionDigits: 0 })} ر.ي
                    </strong>{" "}
                    يُوصى بمراجعة هذه البنود وتعديل الكميات المعيارية بما يعكس الواقع الفعلي للتنفيذ.</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center h-32 print:hidden">
            <RefreshCw className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="bg-card border border-card-border rounded-xl p-10 text-center print:hidden">
            <TrendingDown className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">لا توجد عناصر غير منفذة</h3>
            <p className="text-sm text-muted-foreground">
              جميع العناصر التاريخية تُنفَّذ بنسب مقبولة، أو لم يتم تشغيل التحليل بعد
            </p>
          </div>
        )}

        {/* Main table */}
        {!isLoading && rows.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden print:border-gray-300">
            <div className="px-5 py-4 border-b border-border print:border-gray-300 flex items-center gap-2">
              <FileX2 className="w-4 h-4 text-orange-400 print:hidden" />
              <h2 className="font-semibold text-foreground print:text-gray-900">تفاصيل العناصر غير المنفذة</h2>
              <span className="text-xs text-muted-foreground print:text-gray-600">({rows.length} عنصر)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[700px] print:text-xs">
                <thead>
                  <tr className="bg-secondary/30 print:bg-gray-100">
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground print:text-gray-700 w-8">م</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground print:text-gray-700">اسم البند</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground print:text-gray-700">اسم العنصر</th>
                    <th className="px-4 py-3 text-center font-semibold text-muted-foreground print:text-gray-700 w-20">المشاريع</th>
                    <th className="px-4 py-3 text-center font-semibold text-muted-foreground print:text-gray-700 w-28">السجلات</th>
                    <th className="px-4 py-3 text-center font-semibold text-red-400 print:text-gray-700 w-28">نسبة عدم التنفيذ</th>
                    <th className="px-4 py-3 text-center font-semibold text-muted-foreground print:text-gray-700 w-36">متوسط الكمية المطلوبة</th>
                    <th className="px-4 py-3 text-center font-semibold text-orange-400 print:text-gray-700 w-36">إجمالي المبلغ المطلوب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border print:divide-gray-200">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-secondary/20 print:hover:bg-transparent transition-colors">
                      <td className="px-4 py-3 text-center text-muted-foreground print:text-gray-600">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-foreground print:text-gray-900 max-w-[160px] truncate">{row.boqItemName}</td>
                      <td className="px-4 py-3 text-foreground print:text-gray-800">{row.elementName}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground print:text-gray-600">{row.projectCount}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground print:text-gray-600">
                        {row.zeroCleared}/{row.totalRecords}
                      </td>
                      <td className={`px-4 py-3 text-center print:text-gray-900 ${getPctColor(row.pctUnexecuted)}`}>
                        {fmtPct(row.pctUnexecuted)}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-yellow-400 print:text-gray-800">
                        {fmtNum(row.avgRequestedQty)}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-orange-400 font-semibold print:text-gray-900">
                        {fmtNum(row.totalRequestedAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-secondary/50 border-t-2 border-primary/30 print:bg-gray-100 print:border-gray-400">
                    <td colSpan={7} className="px-4 py-3 font-bold text-foreground print:text-gray-900 text-left">
                      إجمالي المبالغ المطلوبة غير المنفذة
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-orange-400 print:text-gray-900 font-mono">
                      {totalRequestedAmount.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Print footer */}
        <div className="hidden print:block mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
          <p>منصة الذكاء الإنشائي التكيفي · تم إنشاء هذا التقرير بتاريخ {new Date().toLocaleDateString("ar-SA")}</p>
          <p className="mt-1">سري — للاستخدام الداخلي فقط</p>
        </div>
      </div>
    </div>
  );
}
