import { Shield, BookOpen, Calculator, BarChart3, ChevronDown, ChevronUp, Database } from "lucide-react";
import { useState } from "react";

interface Section {
  title: string;
  icon: React.ElementType;
  color: string;
  items: Array<{ term: string; definition: string; formula?: string; example?: string }>;
}

const GOVERNANCE_SECTIONS: Section[] = [
  {
    title: "قاموس البيانات — تعريف الأعمدة الأساسية",
    icon: BookOpen,
    color: "text-primary",
    items: [
      { term: "كمية الطلب (requestedQty)", definition: "الكمية التي طلبها المشروع من المادة أو الصنف في سياق بند معين", example: "1,200 كيلوغرام من الحديد في بند معين" },
      { term: "كمية الإخلاء (clearedQty)", definition: "الكمية الفعلية التي تم إخلاؤها وصرفها في الموقع. إذا كانت فارغة فقيمتها صفر وفق قواعد العمل", example: "950 كيلوغرام فعلياً صُرفت" },
      { term: "مبلغ الطلبات (requestedAmount)", definition: "إجمالي القيمة المالية للكميات المطلوبة", example: "120,000 ريال" },
      { term: "مبلغ الإخلاء (clearedAmount)", definition: "إجمالي القيمة المالية الفعلية المُنفَّقة. إذا فارغة = صفر", example: "95,500 ريال" },
      { term: "كمية البند (qty)", definition: "كمية بند العقد الكلية (العمود AC) — تُستخدم كمقسوم عليه لتطبيع جميع الكميات", example: "500 متر طول من أنبوب الصرف" },
      { term: "معامل الاستهلاك (CF)", definition: "نسبة الكمية المُخلاة إلى الكمية المطلوبة — مقياس الكفاءة الأساسي", formula: "CF = clearedQty / requestedQty", example: "CF = 950 / 1200 = 0.792" },
    ],
  },
  {
    title: "تعريفات المؤشرات الإحصائية",
    icon: BarChart3,
    color: "text-yellow-400",
    items: [
      { term: "الوسيط (Median / P50)", definition: "القيمة الوسطى لمجموعة البيانات بعد ترتيبها — أقل تأثراً بالقيم الشاذة من المتوسط", formula: "الترتيب التصاعدي واختيار القيمة الوسطى" },
      { term: "P75", definition: "الرتبة المئوية الـ75 — 75% من المشاريع تحت هذه القيمة أو تساويها. تُستخدم للعناصر المستقرة جداً" },
      { term: "P80", definition: "الرتبة المئوية الـ80 — تُستخدم للعناصر ذات التذبذب المعتدل كهامش أمان متوازن" },
      { term: "P90", definition: "الرتبة المئوية الـ90 — تُستخدم للعناصر عالية التذبذب لضمان تغطية 90% من الحالات التاريخية" },
      { term: "معامل التباين (CV)", definition: "مقياس التذبذب النسبي — كلما كان أصغر كلما كان العنصر أكثر انتظاماً واستقراراً", formula: "CV = الانحراف المعياري / المتوسط", example: "CV = 0.12 → مستقر جداً، CV = 0.65 → متذبذب جداً" },
      { term: "مؤشر الاستقرار (Stability Score)", definition: "درجة تتراوح بين 0 و1 تعبّر عن انتظام السلوك التاريخي للعنصر", formula: "Stability = max(0, 1 - CV)", example: "CV = 0.2 → Stability = 0.8 (80%)" },
      { term: "الانحراف المعياري (Std Dev)", definition: "مقياس تشتت القيم عن المتوسط — كلما زاد كلما تباين الاستهلاك بين المشاريع" },
      { term: "النطاق الربعي (IQR)", definition: "الفرق بين الرتبة 75 والرتبة 25 — يُستخدم في كشف الشذوذات", formula: "IQR = Q3 - Q1" },
    ],
  },
  {
    title: "منهجية الحساب والتوصيات",
    icon: Calculator,
    color: "text-green-400",
    items: [
      {
        term: "التطبيع بكمية البند (Normalization)",
        definition: "تقسيم جميع الكميات على كمية البند (qty) لجعل المقارنة بين المشاريع ذات الأحجام المختلفة صحيحة رياضياً",
        formula: "normClearedQty = clearedQty / boqQty",
        example: "مشروع A: 950/500=1.9 | مشروع B: 2100/1000=2.1 → مقارنة صحيحة"
      },
      {
        term: "كشف الشذوذات (Outlier Detection)",
        definition: "استبعاد القيم الشاذة باستخدام طريقة النطاق الربعي لمنع تشويه النتائج الإحصائية",
        formula: "الحد الأدنى = Q1 - 1.5×IQR | الحد الأعلى = Q3 + 1.5×IQR"
      },
      {
        term: "المعيار التكيفي (Adaptive Standard)",
        definition: "الكمية الموصى بها المحسوبة إحصائياً بناءً على مستوى تذبذب العنصر",
        formula: "CV<0.15 → P75 | CV<0.30 → P80 | CV≥0.30 → P90",
        example: "عنصر مستقر: اقتراح P75 | عنصر متذبذب: اقتراح P90 كهامش أمان"
      },
      {
        term: "نسبة المبالغة (Over-Allocation %)",
        definition: "نسبة الفرق بين المعيار الأصلي والاستخدام الفعلي الوسيطي — القيمة الإيجابية تعني إسرافاً في التخصيص",
        formula: "stdOverAllocPct = (origStdQty - medianClearedQty) / medianClearedQty × 100",
        example: "معيار=10، وسيط فعلي=7 → مبالغة = (10-7)/7×100 = 42.9%"
      },
      {
        term: "نسبة التصحيح (Correction Ratio)",
        definition: "معامل يوضح مقدار الفرق بين المعيار التكيفي والمعيار الأصلي",
        formula: "correctionRatio = adaptiveQty / origStdQty",
        example: "0.75 → المعيار يبالغ بـ25% | 1.10 → المعيار يُقلّل بـ10%"
      },
    ],
  },
  {
    title: "درجة الثقة والموثوقية (Module 2)",
    icon: Shield,
    color: "text-purple-400",
    items: [
      {
        term: "درجة الثقة الكمية (Confidence Score)",
        definition: "درجة من 0 إلى 100 تعبّر عن موثوقية التوصية بناءً على ثلاثة عوامل",
        formula: "ثقة = نقاط العينة (0-40) + نقاط الاستقرار (0-40) + نقاط التذبذب (0-20)",
        example: "20 مشروع + استقرار 90% + CV<15% → ثقة = 40+36+20 = 96%"
      },
      {
        term: "مستوى الثقة النصي (Confidence Level)",
        definition: "تصنيف نصي مبسّط للثقة بناءً على عدد المشاريع",
        formula: "≥10 مشاريع → عالية | ≥5 → متوسطة | <5 → منخفضة"
      },
      {
        term: "الانتشار المئيني (Percentile Spread)",
        definition: "مقياس التشتت النسبي بين P90 و P10 — كلما ضاق كلما كانت البيانات أكثر تمركزاً",
        formula: "spread = (P90 - P10) / median"
      },
    ],
  },
  {
    title: "حوكمة المعايير وسير العمل (Module 4-7)",
    icon: Database,
    color: "text-orange-400",
    items: [
      { term: "حالة التوصية: مسودة", definition: "التوصية تم توليدها تلقائياً من التحليل ولم تُراجَع بعد" },
      { term: "حالة التوصية: قيد المراجعة", definition: "التوصية أُرسلت للمراجعة الإدارية وتنتظر قرار الاعتماد أو الرفض" },
      { term: "حالة التوصية: معتمد", definition: "اعتمد المدير المختص التوصية وهي جاهزة للتطبيق" },
      { term: "حالة التوصية: مرفوض", definition: "رُفضت التوصية مع توثيق سبب الرفض" },
      { term: "حالة التوصية: مُطبَّق", definition: "تم تطبيق المعيار الجديد وإنشاء سجل إصدار في النظام" },
      { term: "التجاوز الهندسي (Human Override)", definition: "تعديل يدوي من المهندس المختص على الكميات الموصى بها مع توثيق مبرر التجاوز إلزامياً", example: "ظروف تنفيذ استثنائية، متطلبات جودة خاصة، تضاريس صعبة" },
      { term: "إصدار المعيار (Standard Version)", definition: "كل معيار مُطبَّق يُسجَّل كإصدار جديد بتاريخ وعدد مشاريع وطريقة التغيير — قابل للاسترداد" },
    ],
  },
];

function GovernanceSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-5 flex items-center justify-between hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${section.color}`} />
          <h3 className={`font-semibold text-sm ${section.color}`}>{section.title}</h3>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {section.items.length} مدخل
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {section.items.map((item, i) => (
            <div key={i} className="p-4 hover:bg-secondary/10 transition-colors">
              <div className="font-semibold text-sm text-foreground mb-1 font-mono">{item.term}</div>
              <div className="text-xs text-muted-foreground mb-2">{item.definition}</div>
              {item.formula && (
                <div className="bg-secondary/50 rounded px-3 py-2 text-xs font-mono text-primary mb-1">
                  📐 {item.formula}
                </div>
              )}
              {item.example && (
                <div className="text-xs text-green-400/80">
                  <span className="font-semibold">مثال: </span>{item.example}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DataGovernancePage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          حوكمة البيانات والمعرفة المؤسسية
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          قاموس البيانات، تعريفات المؤشرات، منهجية الحساب، وتوثيق منطق التوصيات
        </p>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "أقسام الوثيقة", value: GOVERNANCE_SECTIONS.length, icon: BookOpen, color: "text-primary" },
          { label: "مصطلح موثّق", value: GOVERNANCE_SECTIONS.reduce((s, g) => s + g.items.length, 0), icon: Database, color: "text-green-400" },
          { label: "نماذج رياضية", value: GOVERNANCE_SECTIONS.reduce((s, g) => s + g.items.filter(i => i.formula).length, 0), icon: Calculator, color: "text-orange-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Governance Sections */}
      <div className="space-y-4">
        {GOVERNANCE_SECTIONS.map((section, i) => (
          <GovernanceSection key={i} section={section} />
        ))}
      </div>

      {/* Methodology Note */}
      <div className="bg-secondary/30 border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm text-foreground mb-3">ملاحظات منهجية مهمة</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>• <strong className="text-foreground">قاعدة الأعمدة الفارغة:</strong> أي خلية فارغة في عمود كمية الإخلاء أو مبلغ الإخلاء تُعامَل كصفر — تعني أن الطلب لم يُخلَ شيء منه.</p>
          <p>• <strong className="text-foreground">عدم الاعتماد على المتوسط:</strong> النظام يُعطي الأولوية للوسيط والرتب المئوية على المتوسط لأنها أقل تأثراً بالشذوذات.</p>
          <p>• <strong className="text-foreground">التوصية لا تُطبَّق تلقائياً:</strong> كل توصية يجب أن تمر بدورة مراجعة واعتماد بشري قبل التطبيق.</p>
          <p>• <strong className="text-foreground">أولوية الحكم الهندسي:</strong> يمكن للمهندس تجاوز أي توصية إحصائية بمبرر موثّق — البيانات وسيلة وليست نهاية.</p>
          <p>• <strong className="text-foreground">التراكم المعرفي:</strong> كلما زادت المشاريع المرفوعة، كلما كانت التوصيات أدق وأكثر ثقة.</p>
        </div>
      </div>
    </div>
  );
}
