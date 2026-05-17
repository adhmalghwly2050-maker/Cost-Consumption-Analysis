import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Batch } from "@/lib/api";
import { toast } from "sonner";
import {
  Upload, Trash2, RefreshCw, CheckCircle, AlertCircle,
  FileSpreadsheet, Database, Activity, ChevronDown, ChevronUp
} from "lucide-react";

export default function ImportPage() {
  const qc = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, refetch } = useQuery({ queryKey: ["batches"], queryFn: api.getBatches });
  const batches = data?.batches ?? [];

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("يرجى رفع ملف Excel (.xlsx أو .xls)");
      return;
    }
    setUploading(true);
    try {
      const r = await api.importExcel(file);
      toast.success(`تم استيراد ${r.rowsImported.toLocaleString("ar-EG")} سجل بنجاح`);
      refetch();
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSeedStandard = async () => {
    setSeeding(true);
    try {
      const r = await api.seedStandard();
      toast.success(`تم تحميل ${r.inserted} عنصر من المرجع المعياري`);
      qc.invalidateQueries({ queryKey: ["standard"] });
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  const handleRunAnalytics = async () => {
    setRunning(true);
    try {
      const r = await api.runAnalytics();
      toast.success(`تم التحليل — ${r.analyzedGroups} مجموعة عنصر`);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["boq-items"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل تريد حذف هذه الدفعة؟ سيتم حذف جميع بياناتها.")) return;
    try {
      await api.deleteBatch(id);
      toast.success("تم حذف الدفعة");
      refetch();
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">استيراد البيانات التاريخية</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ارفع ملفات Excel تحتوي على بيانات المشاريع التاريخية المكتملة
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
          ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div>
            <RefreshCw className="w-10 h-10 text-primary animate-spin mx-auto mb-3" />
            <p className="text-foreground font-medium">جار رفع الملف وتحليله...</p>
          </div>
        ) : (
          <div>
            <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">اسحب ملف Excel هنا أو انقر للاختيار</p>
            <p className="text-sm text-muted-foreground">يدعم ملفات .xlsx و .xls حتى 50 ميجابايت</p>
          </div>
        )}
      </div>

      {/* Excel structure guide */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">هيكل ملف Excel المطلوب</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          يجب أن يحتوي الملف على الأعمدة التالية (أو ما يشابهها):
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {["رقم المشروع","اسم المشروع","النوع","الحالة","م البند","البند","الفرع","الوحدة","الكمية","سعر الوحدة","القيمة","رمز الصنف","اسم الصنف","كمية الطلب","مبلغ الطلبات","كمية الاخلاء","مبلغ الاخلاء","اجمالي الطلبات","اجمالي ما تم اخلاؤه"].map(col => (
            <div key={col} className="bg-secondary rounded px-2 py-1 text-xs text-center text-foreground">
              {col}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleSeedStandard}
          disabled={seeding}
          className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors"
        >
          {seeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          تحميل المرجع المعياري
        </button>
        <button
          onClick={handleRunAnalytics}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          تشغيل التحليل الإحصائي
        </button>
      </div>

      {/* Batches list */}
      {batches.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-sm">دفعات الاستيراد ({batches.length})</h3>
          </div>
          <div className="divide-y divide-border">
            {batches.map((batch: Batch) => (
              <div key={batch.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${batch.status === "done" ? "bg-accent/10" : "bg-destructive/10"}`}>
                      {batch.status === "done"
                        ? <CheckCircle className="w-4 h-4 text-accent" />
                        : <AlertCircle className="w-4 h-4 text-destructive" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{batch.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(batch.importedAt).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {" · "}
                        {batch.rowCount.toLocaleString("ar-EG")} سجل
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                    <button
                      onClick={() => setExpanded(expanded === batch.id ? null : batch.id)}
                      className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground"
                    >
                      {expanded === batch.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(batch.id)}
                      className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {expanded === batch.id && (
                  <div className="mt-3 mr-11 p-3 bg-secondary/50 rounded-lg">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">الحالة: </span><span className="text-foreground">{batch.status === "done" ? "مكتمل" : batch.status}</span></div>
                      <div><span className="text-muted-foreground">رقم الدفعة: </span><span className="text-foreground">{batch.id}</span></div>
                      <div><span className="text-muted-foreground">عدد السجلات: </span><span className="text-foreground">{batch.rowCount.toLocaleString("ar-EG")}</span></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {batches.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>لم يتم رفع أي ملفات بعد</p>
        </div>
      )}
    </div>
  );
}
