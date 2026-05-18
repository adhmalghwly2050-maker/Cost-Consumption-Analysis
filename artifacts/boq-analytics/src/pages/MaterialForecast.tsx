import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ForecastRow } from "@/lib/api";
import {
  TrendingUp, RefreshCw, Plus, Trash2, Brain, BarChart3,
  ChevronDown, ChevronUp, Download, AlertTriangle, CheckCircle
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend
} from "recharts";

const n = (v: number, d = 2) => v.toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

const CONF_COLOR = (c: number) => c >= 70 ? "text-green-400" : c >= 40 ? "text-yellow-400" : "text-red-400";
const CONF_BG = (c: number) => c >= 70 ? "bg-green-500" : c >= 40 ? "bg-yellow-500" : "bg-red-500";

function ConfBar({ val, max }: { val: number; max: number }) {
  const pct = max > 0 ? (val / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-secondary rounded-full h-1.5 min-w-[60px]">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{n(val, 2)}</span>
    </div>
  );
}

interface BoqInputRow { boqItemName: string; quantity: number }

export default function MaterialForecastPage() {
  const qc = useQueryClient();
  const [forecastName, setForecastName] = useState("");
  const [projectType, setProjectType] = useState("");
  const [boqRows, setBoqRows] = useState<BoqInputRow[]>([{ boqItemName: "", quantity: 1 }]);
  const [result, setResult] = useState<ForecastRow[] | null>(null);
  const [avgConf, setAvgConf] = useState(0);
  const [expandedMat, setExpandedMat] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: boqItemsData } = useQuery({ queryKey: ["mat-boq-items"], queryFn: api.matGetBoqItemsWithCoeffs });
  const { data: forecastsData } = useQuery({ queryKey: ["mat-forecasts"], queryFn: api.matGetForecasts });

  const forecastMutation = useMutation({
    mutationFn: api.matForecast,
    onSuccess: (d) => {
      setResult(d.forecast);
      setAvgConf(d.avgConfidence);
      toast.success(`تم التقدير: ${d.forecast.length} مادة، متوسط الثقة ${d.avgConfidence.toFixed(1)}%`);
      qc.invalidateQueries({ queryKey: ["mat-forecasts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const boqItems = boqItemsData?.items ?? [];
  const forecasts = forecastsData?.forecasts ?? [];

  const addRow = () => setBoqRows(r => [...r, { boqItemName: "", quantity: 1 }]);
  const removeRow = (i: number) => setBoqRows(r => r.filter((_, j) => j !== i));
  const updateRow = (i: number, field: keyof BoqInputRow, value: string | number) =>
    setBoqRows(r => r.map((row, j) => j === i ? { ...row, [field]: value } : row));

  const runForecast = () => {
    const valid = boqRows.filter(r => r.boqItemName && r.quantity > 0);
    if (!valid.length) { toast.error("يرجى إدخال بند BOQ واحد على الأقل"); return; }
    forecastMutation.mutate({
      forecastName: forecastName || `تقدير ${new Date().toLocaleDateString("ar-EG")}`,
      projectType: projectType || undefined,
      boqItems: valid,
    });
  };

  const maxQty = result ? Math.max(...result.map(r => r.p80Qty)) : 1;
  const chartData = result?.slice(0, 12).map(r => ({
    name: r.materialName.slice(0, 12),
    "وسيط الطلب": +r.medianQty.toFixed(2),
    "P80 (آمن)": +r.p80Qty.toFixed(2),
    unit: r.unit,
  })) ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            محرك تقدير الاحتياج الكلي للمشروع
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            أدخل كميات بنود BOQ للمشروع الجديد واحصل على تقدير كامل للاحتياج المادي مع درجة الثقة
          </p>
        </div>
        <button onClick={() => setHistoryOpen(o => !o)}
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80">
          <BarChart3 className="w-4 h-4" />
          سجل التقديرات ({forecasts.length})
        </button>
      </div>

      {/* Input Panel */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          بيانات المشروع الجديد
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">اسم التقدير</label>
            <input value={forecastName} onChange={e => setForecastName(e.target.value)}
              placeholder={`تقدير ${new Date().toLocaleDateString("ar-EG")}`}
              className="w-full bg-secondary border border-input rounded-lg py-2 px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">نوع المشروع (اختياري)</label>
            <input value={projectType} onChange={e => setProjectType(e.target.value)}
              placeholder="مثال: طرق، مجاري، كهرباء..."
              className="w-full bg-secondary border border-input rounded-lg py-2 px-3 text-sm outline-none focus:border-primary" />
          </div>
        </div>

        {/* BOQ Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground">بنود BOQ للمشروع</label>
            <span className="text-xs text-muted-foreground">{boqRows.length} بند</span>
          </div>
          <div className="space-y-2">
            {boqRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={row.boqItemName}
                  onChange={e => updateRow(i, "boqItemName", e.target.value)}
                  className="flex-1 bg-secondary border border-input rounded-lg py-2 px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">اختر بند BOQ...</option>
                  {boqItems.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <input
                  type="number" min="0" step="any"
                  value={row.quantity}
                  onChange={e => updateRow(i, "quantity", parseFloat(e.target.value) || 0)}
                  placeholder="الكمية"
                  className="w-28 bg-secondary border border-input rounded-lg py-2 px-3 text-sm outline-none focus:border-primary text-center"
                />
                <button onClick={() => removeRow(i)} disabled={boqRows.length === 1}
                  className="p-2 text-muted-foreground hover:text-red-400 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {boqItems.length === 0 && (
            <div className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              لا توجد بنود BOQ مربوطة بمعاملات — يرجى تهيئة القاموس وحساب المعاملات أولاً
            </div>
          )}
          <button onClick={addRow}
            className="mt-2 flex items-center gap-2 text-xs text-primary hover:underline">
            <Plus className="w-3 h-3" /> إضافة بند
          </button>
        </div>

        <button onClick={runForecast} disabled={forecastMutation.isPending}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
          {forecastMutation.isPending
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> يحسب التقدير...</>
            : <><Brain className="w-4 h-4" /> تشغيل محرك التقدير</>}
        </button>
      </div>

      {/* Results */}
      {result && result.length > 0 && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "إجمالي المواد المُقدَّرة", value: result.length.toLocaleString("ar-EG"), color: "text-primary" },
              { label: "متوسط الثقة", value: `${avgConf.toFixed(1)}%`, color: CONF_COLOR(avgConf) },
              { label: "مواد عالية الثقة (≥70%)", value: result.filter(r => r.confidence >= 70).length.toLocaleString("ar-EG"), color: "text-green-400" },
              { label: "مواد تحتاج مراجعة (<40%)", value: result.filter(r => r.confidence < 40).length.toLocaleString("ar-EG"), color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-card-border rounded-xl p-4">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className={`text-xl font-bold ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-4">الاحتياج المتوقع — أعلى 12 مادة (وسيط وP80)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ left: 8, right: 16, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                    formatter={(v: number, name: string) => [n(v), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215 15% 55%)" }} />
                  <Bar dataKey="وسيط الطلب" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="P80 (آمن)" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detail Table */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                تقرير الاحتياج الكلي المتوقع للمشروع
              </h3>
              <span className="text-xs text-muted-foreground">{result.length} مادة</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "950px" }}>
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                    <th className="px-3 py-3 text-right">المادة</th>
                    <th className="px-3 py-3 text-center">الوحدة</th>
                    <th className="px-3 py-3 text-center text-blue-400">الطلب الوسيطي</th>
                    <th className="px-3 py-3 text-center text-green-400">P80 (آمن)</th>
                    <th className="px-3 py-3 text-center text-orange-400">P90 (محافظ)</th>
                    <th className="px-3 py-3 text-center">المبلغ المتوقع</th>
                    <th className="px-3 py-3 text-center">درجة الثقة</th>
                    <th className="px-3 py-3 text-center">التذبذب</th>
                    <th className="px-3 py-3 text-center">مشاريع</th>
                    <th className="px-3 py-3 text-center">تفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.map((row) => {
                    const open = expandedMat === row.materialId;
                    return (
                      <>
                        <tr key={row.materialId} className="hover:bg-secondary/20 transition-colors">
                          <td className="px-3 py-2.5 font-semibold text-foreground">{row.materialName}</td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">{row.unit}</td>
                          <td className="px-3 py-2.5 text-center">
                            <ConfBar val={row.medianQty} max={maxQty} />
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono font-bold text-green-400">{n(row.p80Qty)}</td>
                          <td className="px-3 py-2.5 text-center font-mono text-orange-400">{n(row.p90Qty)}</td>
                          <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                            {row.predictedAmount > 0 ? n(row.predictedAmount, 0) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <div className="w-12 bg-secondary rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${CONF_BG(row.confidence)}`} style={{ width: `${row.confidence}%` }} />
                              </div>
                              <span className={`text-xs font-bold ${CONF_COLOR(row.confidence)}`}>{row.confidence.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs">{row.volatilityLevel}</td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground">{row.nProjects}</td>
                          <td className="px-3 py-2.5 text-center">
                            <button onClick={() => setExpandedMat(open ? null : row.materialId)}
                              className="text-primary hover:underline text-xs">
                              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                        {open && (
                          <tr key={`${row.materialId}-exp`} className="bg-secondary/10">
                            <td colSpan={10} className="px-4 py-3">
                              <div className="text-xs">
                                <div className="font-semibold text-muted-foreground mb-2">مساهمة كل بند BOQ في الاحتياج:</div>
                                <div className="flex flex-wrap gap-2">
                                  {row.boqContributions.map((bc, i) => (
                                    <div key={i} className="bg-card border border-border rounded px-3 py-1.5">
                                      <div className="font-medium text-foreground">{bc.boqItemName}</div>
                                      <div className="text-muted-foreground">
                                        معامل: <span className="font-mono text-primary">{bc.coefficient.toFixed(4)}</span>
                                        {" → "}
                                        <span className="font-mono text-green-400">{bc.qty.toFixed(3)} {row.unit}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {result && result.length === 0 && (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-2">لا توجد نتائج</h3>
          <p className="text-sm text-muted-foreground">
            لم يتم العثور على معاملات استهلاك لبنود BOQ المُدخلة.
            تأكد من تهيئة القاموس، الربط التلقائي، وحساب المعاملات.
          </p>
        </div>
      )}

      {/* History */}
      {historyOpen && forecasts.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-sm">سجل التقديرات السابقة</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                <th className="px-3 py-3 text-right">اسم التقدير</th>
                <th className="px-3 py-3 text-center">نوع المشروع</th>
                <th className="px-3 py-3 text-center">عدد المواد</th>
                <th className="px-3 py-3 text-center">متوسط الثقة</th>
                <th className="px-3 py-3 text-center">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {forecasts.map(f => (
                <tr key={f.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-foreground">{f.forecastName}</td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{f.projectType ?? "—"}</td>
                  <td className="px-3 py-2.5 text-center text-primary">{f.totalMaterials}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={CONF_COLOR(parseFloat(f.avgConfidence ?? "0"))}>{parseFloat(f.avgConfidence ?? "0").toFixed(1)}%</span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">
                    {new Date(f.createdAt).toLocaleDateString("ar-EG")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
