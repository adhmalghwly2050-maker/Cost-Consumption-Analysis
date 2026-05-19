import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "wouter";
import {
  Brain, Database, BarChart3, TrendingUp, BookOpen,
  ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, Zap, Layers
} from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  {
    step: 1,
    title: "تهيئة قاموس المواد",
    desc: "إنشاء قاعدة بيانات المواد الموحّدة مع أسمائها البديلة",
    action: "seed",
    link: "/material-dictionary",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    icon: BookOpen,
  },
  {
    step: 2,
    title: "ربط العناصر تلقائياً",
    desc: "مطابقة أسماء العناصر التاريخية بالمواد في القاموس",
    action: "link",
    link: "/material-dictionary",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    icon: Layers,
  },
  {
    step: 3,
    title: "حساب معاملات الاستهلاك",
    desc: "استخراج المعاملات التاريخية الإحصائية لكل زوج (مادة + بند BOQ)",
    action: "coefficients",
    link: "/material-coefficients",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    icon: BarChart3,
  },
  {
    step: 4,
    title: "إنشاء تقدير المشروع",
    desc: "إدخال كميات بنود المشروع واستقاء التوقعات المادية الكاملة",
    action: null,
    link: "/material-forecast",
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
    icon: TrendingUp,
  },
];

export default function MaterialHubPage() {
  const qc = useQueryClient();

  const { data: masterData } = useQuery({ queryKey: ["mat-master"], queryFn: api.matGetMaster });
  const { data: statsData } = useQuery({ queryKey: ["mat-historical-stats"], queryFn: api.matGetHistoricalStats });
  const { data: coeffData } = useQuery({ queryKey: ["mat-coefficients"], queryFn: () => api.matGetCoefficients() });
  const { data: forecastsData } = useQuery({ queryKey: ["mat-forecasts"], queryFn: api.matGetForecasts });

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
      toast.success(`تم ربط ${d.linked} عنصر من أصل ${d.totalElements}`);
      qc.invalidateQueries({ queryKey: ["mat-master"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const coeffMutation = useMutation({
    mutationFn: api.matComputeCoefficients,
    onSuccess: (d) => {
      toast.success(`تم حساب ${d.computedCoefficients} معامل استهلاك تاريخي`);
      qc.invalidateQueries({ queryKey: ["mat-coefficients"] });
      qc.invalidateQueries({ queryKey: ["mat-historical-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const matCount = masterData?.materials.length ?? 0;
  const coeffCount = coeffData?.coefficients.length ?? 0;
  const statsCount = statsData?.stats.length ?? 0;
  const forecastCount = forecastsData?.forecasts.length ?? 0;

  const handleStep = (action: string | null) => {
    if (action === "seed") seedMutation.mutate();
    else if (action === "link") linkMutation.mutate();
    else if (action === "coefficients") coeffMutation.mutate();
  };

  const isLoading = seedMutation.isPending || linkMutation.isPending || coeffMutation.isPending;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Brain className="w-7 h-7 text-primary" />
          محرك التنبؤ بالاستهلاك الكلي للعناصر
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          منصة ذكاء مواد المشاريع — تحليل تاريخي، معاملات استهلاك، وتقدير الاحتياج الكلي لأي مشروع
        </p>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "مواد في القاموس", value: matCount, icon: BookOpen, color: "text-blue-400" },
          { label: "معاملات استهلاك محسوبة", value: coeffCount, icon: BarChart3, color: "text-green-400" },
          { label: "مواد ذات إحصاءات تاريخية", value: statsCount, icon: Database, color: "text-orange-400" },
          { label: "تقديرات مشاريع", value: forecastCount, icon: TrendingUp, color: "text-primary" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString("ar-EG")}</div>
          </div>
        ))}
      </div>

      {/* Strategic Goal Banner */}
      <div className="bg-gradient-to-l from-primary/5 to-primary/20 border border-primary/30 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <Brain className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
          <div>
            <h2 className="font-bold text-base text-foreground mb-2">الهدف الاستراتيجي للوحدة الجديدة</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              تتجاوز هذه الوحدة تحليل <span className="text-primary font-semibold">البند + العنصر</span> بشكل منفصل، لتبني
              <span className="text-primary font-semibold"> قاعدة معرفية مؤسسية</span> بمعاملات الاستهلاك التاريخية لكل مادة.
              النتيجة: القدرة على تقدير <span className="text-primary font-semibold">الاحتياج الكلي لأي مشروع</span> مستقبلي
              من مجرد إدخال كميات بنود BOQ.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              {[
                { label: "من", value: "تحليل بند + عنصر منفصل", icon: "📊" },
                { label: "إلى", value: "ذكاء مواد المشروع الكلي", icon: "🧠" },
                { label: "النتيجة", value: "تقدير دقيق لأي مشروع مستقبلي", icon: "🎯" },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-card/50 border border-border rounded-lg p-3 text-center">
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-xs font-semibold text-foreground mt-1">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Setup Steps */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-3">خطوات التهيئة</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const done = step.step === 1 ? matCount > 0
              : step.step === 2 ? statsCount > 0
              : step.step === 3 ? coeffCount > 0
              : forecastCount >= 0;
            return (
              <div key={step.step} className={`rounded-xl border p-4 ${step.bg} flex flex-col gap-3`}>
                <div className="flex items-center justify-between">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-green-500/20 text-green-400" : `bg-card text-muted-foreground`}`}>
                    {done ? <CheckCircle className="w-4 h-4" /> : step.step}
                  </div>
                  <Icon className={`w-4 h-4 ${step.color}`} />
                </div>
                <div>
                  <div className={`text-sm font-semibold ${step.color}`}>{step.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{step.desc}</div>
                </div>
                <div className="flex gap-2 mt-auto">
                  {step.action && (
                    <button
                      onClick={() => handleStep(step.action)}
                      disabled={isLoading}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50 ${step.bg} ${step.color} hover:opacity-80`}
                    >
                      {isLoading ? <RefreshCw className="w-3 h-3 animate-spin mx-auto" /> : "تنفيذ"}
                    </button>
                  )}
                  <Link href={step.link}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium text-center bg-card border border-border hover:bg-secondary transition-colors ${step.color}`}>
                    فتح
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick navigation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { href: "/material-forecast", label: "محرك التقدير والتنبؤ", desc: "أدخل كميات BOQ واحصل على الاحتياج الكلي المتوقع", icon: TrendingUp, color: "text-primary", urgent: true },
          { href: "/material-historical", label: "الذاكرة التاريخية للمواد", desc: "إحصاءات تاريخية تراكمية لكل مادة عبر جميع المشاريع", icon: Database, color: "text-orange-400", urgent: false },
          { href: "/material-dictionary", label: "قاموس المواد الموحّد", desc: "إدارة المواد والأسماء البديلة وربط العناصر", icon: BookOpen, color: "text-blue-400", urgent: false },
          { href: "/material-reports", label: "التقارير التنفيذية للمواد", desc: "تقارير الطلب، التذبذب، والمقارنة التحليلية", icon: BarChart3, color: "text-green-400", urgent: false },
        ].map(({ href, label, desc, icon: Icon, color, urgent }) => (
          <Link key={href} href={href}>
            <div className={`bg-card border rounded-xl p-5 hover:bg-secondary/20 transition-all cursor-pointer flex items-center gap-4 ${urgent ? "border-primary/40" : "border-card-border"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${urgent ? "bg-primary/10" : "bg-secondary"}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm ${urgent ? color : "text-foreground"}`}>{label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
              </div>
              <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180 flex-shrink-0" />
            </div>
          </Link>
        ))}
      </div>

      {/* Architecture Note */}
      <div className="bg-secondary/30 border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          المنطق الهندسي للمحرك
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
          <div className="space-y-1">
            <div className="font-semibold text-foreground">معامل الاستهلاك التاريخي</div>
            <div className="font-mono bg-card border border-border rounded px-2 py-1 text-primary text-xs">
              coeff = clearedQty / boqItemQty
            </div>
            <div>يُحسب لكل مشروع تاريخي ثم يُجمَّع إحصائياً (وسيط، P80)</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-foreground">تقدير مشروع جديد</div>
            <div className="font-mono bg-card border border-border rounded px-2 py-1 text-green-400 text-xs">
              demand = coeff × boqQty
            </div>
            <div>يُضرب معامل الاستهلاك في كمية بند المشروع المُدخلة</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-foreground">التجميع الكلي</div>
            <div className="font-mono bg-card border border-border rounded px-2 py-1 text-orange-400 text-xs">
              total = Σ (coeff_i × qty_i)
            </div>
            <div>تجمّع احتياجات المادة من جميع بنود BOQ في المشروع</div>
          </div>
        </div>
      </div>
    </div>
  );
}
