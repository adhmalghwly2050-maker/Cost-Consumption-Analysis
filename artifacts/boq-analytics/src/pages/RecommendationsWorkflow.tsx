import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type WorkflowRec } from "@/lib/api";
import {
  GitBranch, RefreshCw, CheckCircle, XCircle, Clock, Zap,
  AlertTriangle, Eye, Edit, Send, ChevronDown, ChevronUp, Info
} from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  "مسودة":       { color: "text-muted-foreground", bg: "bg-muted/20 border-muted/30", icon: Clock, label: "مسودة" },
  "قيد المراجعة": { color: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/30", icon: Eye, label: "قيد المراجعة" },
  "معتمد":       { color: "text-green-400",   bg: "bg-green-400/10 border-green-400/30",  icon: CheckCircle, label: "معتمد" },
  "مرفوض":       { color: "text-red-400",     bg: "bg-red-400/10 border-red-400/30",      icon: XCircle, label: "مرفوض" },
  "مُطبَّق":      { color: "text-primary",     bg: "bg-primary/10 border-primary/30",       icon: Zap, label: "مُطبَّق" },
};

const n = (v: string | number | null | undefined, d = 3) =>
  v == null || v === "" ? "—" : parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

function ConfidenceBar({ score }: { score: string | null }) {
  if (!score) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.min(100, parseFloat(score));
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-secondary rounded-full h-1.5 min-w-[60px]">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{pct.toFixed(0)}%</span>
    </div>
  );
}

function WorkflowRow({ rec, onAction }: { rec: WorkflowRec; onAction: (id: number, action: string, extra?: Record<string, string>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideQty, setOverrideQty] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  const [justification, setJustification] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const cfg = STATUS_CONFIG[rec.status] ?? STATUS_CONFIG["مسودة"];
  const Icon = cfg.icon;

  return (
    <>
      <tr className="hover:bg-secondary/10 transition-colors cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <td className="px-3 py-3 max-w-[160px]">
          <div className="truncate font-medium text-foreground text-xs">{rec.boqItemName}</div>
        </td>
        <td className="px-3 py-3 max-w-[130px]">
          <div className="truncate text-muted-foreground text-xs">{rec.elementName}</div>
        </td>
        <td className="px-3 py-3 text-center">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
            <Icon className="w-3 h-3" />
            {rec.status}
          </span>
        </td>
        <td className="px-3 py-3 text-center font-mono text-xs text-foreground/80">{n(rec.recommendedQty, 4)}</td>
        <td className="px-3 py-3 text-center">
          <ConfidenceBar score={rec.confidenceScore} />
        </td>
        <td className="px-3 py-3 text-center text-xs text-muted-foreground">{rec.nProjects ?? "—"}</td>
        <td className="px-3 py-3 text-center">
          <span className={`text-xs ${rec.volatilityLevel === "مستقر جداً" ? "text-green-400" : rec.volatilityLevel === "مستقر" ? "text-blue-400" : rec.volatilityLevel === "متذبذب" ? "text-yellow-400" : "text-red-400"}`}>
            {rec.volatilityLevel ?? "—"}
          </span>
        </td>
        <td className="px-3 py-3 text-center">
          {expanded ? <ChevronUp className="w-4 h-4 mx-auto text-muted-foreground" /> : <ChevronDown className="w-4 h-4 mx-auto text-muted-foreground" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-secondary/10">
          <td colSpan={8} className="px-4 py-4">
            <div className="space-y-4">
              {/* Detail Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "الكمية الموصى بها", value: n(rec.recommendedQty, 4), sub: "التكيفي" },
                  { label: "السعر الموصى به", value: n(rec.recommendedPrice, 0), sub: "ر.ي" },
                  { label: "الكمية السابقة", value: n(rec.previousQty, 4), sub: "المعياري الأصلي" },
                  { label: "السعر السابق", value: n(rec.previousPrice, 0), sub: "ر.ي" },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="bg-card border border-card-border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">{label}</div>
                    <div className="font-mono font-bold text-foreground">{value}</div>
                    <div className="text-xs text-muted-foreground">{sub}</div>
                  </div>
                ))}
              </div>

              {rec.overrideQty && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <div className="text-xs font-semibold text-yellow-400 mb-1">تجاوز هندسي مُطبَّق</div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><span className="text-muted-foreground">الكمية: </span><span className="font-mono text-yellow-300">{n(rec.overrideQty, 4)}</span></div>
                    <div><span className="text-muted-foreground">السعر: </span><span className="font-mono text-yellow-300">{n(rec.overridePrice, 0)}</span></div>
                  </div>
                  {rec.overrideJustification && (
                    <div className="text-xs text-yellow-300/80 mt-2">المبرر: {rec.overrideJustification}</div>
                  )}
                </div>
              )}

              {rec.reviewerComment && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                  <span className="font-semibold">تعليق المراجع: </span>{rec.reviewerComment}
                </div>
              )}

              {rec.rejectionReason && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-300">
                  <span className="font-semibold">سبب الرفض: </span>{rec.rejectionReason}
                </div>
              )}

              {/* Override Form */}
              {overrideMode && (
                <div className="bg-card border border-yellow-500/30 rounded-lg p-4 space-y-3">
                  <div className="text-xs font-semibold text-yellow-400 flex items-center gap-2">
                    <Edit className="w-3.5 h-3.5" /> تجاوز هندسي يدوي
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">الكمية البديلة</label>
                      <input value={overrideQty} onChange={e => setOverrideQty(e.target.value)}
                        placeholder="أدخل الكمية..." type="number" step="any"
                        className="w-full bg-secondary border border-input rounded px-3 py-2 text-sm outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">السعر البديل</label>
                      <input value={overridePrice} onChange={e => setOverridePrice(e.target.value)}
                        placeholder="أدخل السعر..." type="number" step="any"
                        className="w-full bg-secondary border border-input rounded px-3 py-2 text-sm outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">مبرر التجاوز الهندسي (إلزامي)</label>
                    <textarea value={justification} onChange={e => setJustification(e.target.value)}
                      placeholder="اشرح سبب التجاوز الهندسي (ظروف خاصة، متطلبات تنفيذية، إلخ)..."
                      rows={2}
                      className="w-full bg-secondary border border-input rounded px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {
                      if (!justification.trim()) { toast.error("مبرر التجاوز إلزامي"); return; }
                      onAction(rec.id, "override", { overrideQty, overridePrice, overrideJustification: justification });
                      setOverrideMode(false);
                    }}
                      className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded text-xs hover:bg-yellow-500/30">
                      تطبيق التجاوز
                    </button>
                    <button onClick={() => setOverrideMode(false)}
                      className="px-3 py-1.5 bg-secondary text-muted-foreground rounded text-xs hover:bg-secondary/80">
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              {/* Comment for review */}
              {rec.status === "مسودة" && (
                <div className="space-y-2">
                  <input value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                    placeholder="تعليق للمراجعة (اختياري)..."
                    className="w-full bg-secondary border border-input rounded px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
              )}

              {rec.status === "قيد المراجعة" && (
                <div className="space-y-2">
                  <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    placeholder="سبب الرفض (إن اخترت الرفض)..."
                    className="w-full bg-secondary border border-input rounded px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {rec.status === "مسودة" && (
                  <>
                    <button onClick={() => onAction(rec.id, "review", { comment: reviewComment })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded text-xs hover:bg-yellow-500/20">
                      <Eye className="w-3 h-3" /> إرسال للمراجعة
                    </button>
                    <button onClick={() => setOverrideMode(o => !o)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded text-xs hover:bg-orange-500/20">
                      <Edit className="w-3 h-3" /> تجاوز هندسي
                    </button>
                  </>
                )}
                {rec.status === "قيد المراجعة" && (
                  <>
                    <button onClick={() => onAction(rec.id, "approve", { approvedBy: "المدير", comment: reviewComment })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded text-xs hover:bg-green-500/20">
                      <CheckCircle className="w-3 h-3" /> اعتماد
                    </button>
                    <button onClick={() => onAction(rec.id, "reject", { approvedBy: "المدير", rejectionReason: rejectReason })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded text-xs hover:bg-red-500/20">
                      <XCircle className="w-3 h-3" /> رفض
                    </button>
                    <button onClick={() => setOverrideMode(o => !o)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded text-xs hover:bg-orange-500/20">
                      <Edit className="w-3 h-3" /> تجاوز هندسي
                    </button>
                  </>
                )}
                {rec.status === "معتمد" && (
                  <button onClick={() => onAction(rec.id, "apply", {})}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/30 rounded text-xs hover:bg-primary/20">
                    <Send className="w-3 h-3" /> تطبيق المعيار
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function WorkflowPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["workflow", statusFilter],
    queryFn: () => api.getWorkflow(statusFilter),
  });

  const generateMutation = useMutation({
    mutationFn: api.generateWorkflow,
    onSuccess: (d) => {
      toast.success(`تم إنشاء ${d.generated} توصية جديدة`);
      qc.invalidateQueries({ queryKey: ["workflow"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, extra }: { id: number; action: string; extra?: Record<string, string> }) =>
      api.updateWorkflow(id, { action: action as "approve" | "reject" | "review" | "apply" | "override", ...extra }),
    onSuccess: () => {
      toast.success("تم تحديث حالة التوصية");
      qc.invalidateQueries({ queryKey: ["workflow"] });
      qc.invalidateQueries({ queryKey: ["standard-versions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAction = (id: number, action: string, extra?: Record<string, string>) => {
    actionMutation.mutate({ id, action, extra });
  };

  const recs = data?.recommendations ?? [];
  const filtered = recs.filter(r =>
    !search.trim() ||
    r.boqItemName.toLowerCase().includes(search.toLowerCase()) ||
    r.elementName.toLowerCase().includes(search.toLowerCase())
  );

  const statusCounts = recs.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
            <GitBranch className="w-6 h-6 text-primary" />
            سير عمل التوصيات والاعتماد
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            حوكمة التوصيات — مراجعة، اعتماد، رفض، أو تجاوز هندسي قبل تطبيق أي معيار جديد
          </p>
        </div>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Zap className={`w-4 h-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
          توليد توصيات جديدة
        </button>
      </div>

      {/* Workflow info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          <p className="font-semibold mb-1">دورة حياة التوصية</p>
          <div className="flex flex-wrap gap-2 text-xs text-blue-300/80">
            {["مسودة", "→", "قيد المراجعة", "→", "معتمد / مرفوض", "→", "مُطبَّق"].map((s, i) => (
              <span key={i} className={s === "→" ? "text-blue-400/40" : "px-2 py-0.5 bg-blue-500/10 rounded"}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Status KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status === statusFilter ? "الكل" : status)}
              className={`p-4 rounded-xl border transition-all text-right ${statusFilter === status ? cfg.bg + " border-opacity-60" : "bg-card border-card-border"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${cfg.color}`} />
                <span className="text-xs text-muted-foreground">{status}</span>
              </div>
              <div className={`text-xl font-bold ${cfg.color}`}>{(statusCounts[status] ?? 0).toLocaleString("ar-EG")}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن بند أو عنصر..."
            className="w-full bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary">
          {["الكل", ...Object.keys(STATUS_CONFIG)].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length.toLocaleString("ar-EG")} توصية</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center">
          <GitBranch className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-2">لا توجد توصيات</h3>
          <p className="text-sm text-muted-foreground mb-4">
            قم بتشغيل التحليل الإحصائي أولاً، ثم اضغط "توليد توصيات جديدة"
          </p>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "900px" }}>
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                  <th className="px-3 py-3 text-right">البند</th>
                  <th className="px-3 py-3 text-right">العنصر</th>
                  <th className="px-3 py-3 text-center">الحالة</th>
                  <th className="px-3 py-3 text-center">الكمية الموصى بها</th>
                  <th className="px-3 py-3 text-center">درجة الثقة</th>
                  <th className="px-3 py-3 text-center">المشاريع</th>
                  <th className="px-3 py-3 text-center">مستوى التذبذب</th>
                  <th className="px-3 py-3 text-center">تفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.slice(0, 200).map(rec => (
                  <WorkflowRow key={rec.id} rec={rec} onAction={handleAction} />
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 200 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
              يُعرض أول 200 نتيجة من {filtered.length.toLocaleString("ar-EG")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
