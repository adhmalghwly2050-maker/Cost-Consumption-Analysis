import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Tag, Plus, Trash2, Save, Search, RefreshCw, Info } from "lucide-react";

const ROLE_TYPES = [
  { value: "primary_core",          label: "نواة أساسية",        color: "bg-green-500/15 text-green-400 border-green-500/30",   desc: "عنصر أساسي لتحديد نمط التنفيذ الفعلي" },
  { value: "secondary_validation",  label: "تحقق ثانوي",          color: "bg-blue-500/15 text-blue-400 border-blue-500/30",      desc: "عنصر مساند يُستخدم للتحقق من الحسابات" },
  { value: "contractor_indicator",  label: "مؤشر مقاول",          color: "bg-orange-500/15 text-orange-400 border-orange-500/30", desc: "ظهوره يشير إلى تنفيذ بواسطة مقاول" },
  { value: "financial",             label: "مالي",                 color: "bg-purple-500/15 text-purple-400 border-purple-500/30", desc: "عنصر مالي يُطلب لأغراض ميزانية فقط" },
  { value: "supporting",            label: "داعم",                 color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", desc: "عنصر داعم لا يُنفَّذ دائماً بشكل مستقل" },
  { value: "auxiliary",             label: "مساعد",               color: "bg-gray-500/15 text-gray-400 border-gray-500/30",      desc: "عنصر إضافي أو مساعد" },
];

function RoleBadge({ roleType }: { roleType: string }) {
  const r = ROLE_TYPES.find(r => r.value === roleType);
  if (!r) return <span className="text-xs text-muted-foreground">{roleType}</span>;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${r.color}`}>
      {r.label}
    </span>
  );
}

export default function ElementRolesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedBoq, setSelectedBoq] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRole, setNewRole] = useState({ boqItemName: "", elementName: "", roleType: "supporting", description: "" });

  const { data: rolesData, isLoading } = useQuery({
    queryKey: ["element-roles"],
    queryFn: api.getElementRoles,
  });
  const { data: itemsData } = useQuery({
    queryKey: ["boq-items"],
    queryFn: api.getBoqItems,
  });

  const roles = rolesData?.roles ?? [];
  const boqItems = itemsData?.items ?? [];

  // Elements for selected BOQ item (from analytics)
  const { data: itemAnalytics } = useQuery({
    queryKey: ["item-analytics", selectedBoq],
    queryFn: () => api.getItemAnalytics(selectedBoq!),
    enabled: !!selectedBoq,
  });
  const elements = useMemo(() => {
    if (!itemAnalytics) return [];
    return itemAnalytics.analytics.map(a => a.elementName);
  }, [itemAnalytics]);

  const filteredRoles = useMemo(() => {
    let r = roles;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(role => role.boqItemName.toLowerCase().includes(q) || role.elementName.toLowerCase().includes(q));
    }
    return r;
  }, [roles, search]);

  const addMutation = useMutation({
    mutationFn: api.saveElementRole,
    onSuccess: () => {
      toast.success("تم حفظ الدور بنجاح");
      qc.invalidateQueries({ queryKey: ["element-roles"] });
      setShowAddForm(false);
      setNewRole({ boqItemName: "", elementName: "", roleType: "supporting", description: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteElementRole,
    onSuccess: () => {
      toast.success("تم حذف الدور");
      qc.invalidateQueries({ queryKey: ["element-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group roles by BOQ item
  const grouped = useMemo(() => {
    const g: Record<string, typeof roles> = {};
    for (const r of filteredRoles) {
      if (!g[r.boqItemName]) g[r.boqItemName] = [];
      g[r.boqItemName].push(r);
    }
    return g;
  }, [filteredRoles]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Tag className="w-6 h-6 text-primary" />
            تصنيف أدوار العناصر
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            حدّد دور كل عنصر في كل بند لتحسين دقة كشف وضع التنفيذ — {roles.length} دور محفوظ
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          إضافة دور جديد
        </button>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {ROLE_TYPES.map(r => (
          <div key={r.value} className={`p-3 rounded-lg border text-center ${r.color}`}>
            <div className="font-semibold text-xs">{r.label}</div>
            <div className="text-xs mt-1 opacity-75 leading-tight">{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">إضافة/تعديل دور عنصر</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">اسم البند</label>
              <select
                value={newRole.boqItemName}
                onChange={e => {
                  setNewRole(p => ({ ...p, boqItemName: e.target.value, elementName: "" }));
                  setSelectedBoq(e.target.value);
                }}
                className="w-full bg-secondary border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">اختر بنداً...</option>
                {boqItems.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">اسم العنصر</label>
              {elements.length > 0 ? (
                <select
                  value={newRole.elementName}
                  onChange={e => setNewRole(p => ({ ...p, elementName: e.target.value }))}
                  className="w-full bg-secondary border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">اختر عنصراً...</option>
                  {elements.map(el => <option key={el} value={el}>{el}</option>)}
                </select>
              ) : (
                <input
                  value={newRole.elementName}
                  onChange={e => setNewRole(p => ({ ...p, elementName: e.target.value }))}
                  placeholder="أدخل اسم العنصر..."
                  className="w-full bg-secondary border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
                />
              )}
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">نوع الدور</label>
              <select
                value={newRole.roleType}
                onChange={e => setNewRole(p => ({ ...p, roleType: e.target.value }))}
                className="w-full bg-secondary border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
              >
                {ROLE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">وصف اختياري</label>
              <input
                value={newRole.description}
                onChange={e => setNewRole(p => ({ ...p, description: e.target.value }))}
                placeholder="ملاحظة أو وصف..."
                className="w-full bg-secondary border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!newRole.boqItemName || !newRole.elementName || addMutation.isPending}
              onClick={() => addMutation.mutate(newRole)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {addMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ الدور
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالبند أو العنصر..."
          className="w-full bg-card border border-input rounded-lg py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && roles.length === 0 && (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center">
          <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">لا توجد أدوار محفوظة بعد</h3>
          <p className="text-sm text-muted-foreground mb-4">
            ابدأ بتصنيف العناصر لتحسين دقة كشف وضع التنفيذ
          </p>
          <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-4 text-right text-sm text-muted-foreground max-w-md mx-auto">
            <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <span>يمكنك البدء بتصنيف عناصر البند الرئيسي كـ "نواة أساسية" لتتعرف المنصة على نمط التنفيذ الفعلي.</span>
          </div>
        </div>
      )}

      {/* Roles grouped by BOQ item */}
      {!isLoading && Object.keys(grouped).length > 0 && (
        <div className="space-y-4">
          {Object.entries(grouped).map(([boqItem, itemRoles]) => (
            <div key={boqItem} className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-secondary/20 border-b border-border">
                <div>
                  <span className="font-semibold text-foreground text-sm">{boqItem}</span>
                  <span className="text-xs text-muted-foreground mr-2">{itemRoles.length} عنصر مصنف</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">اسم العنصر</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">نوع الدور</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">الوصف</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground w-20">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {itemRoles.map(role => (
                      <tr key={role.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{role.elementName}</td>
                        <td className="px-4 py-3 text-center">
                          <RoleBadge roleType={role.roleType} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{role.description || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => deleteMutation.mutate(role.id)}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 hover:bg-red-500/20 text-muted-foreground hover:text-red-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && roles.length > 0 && Object.keys(grouped).length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>لا توجد نتائج مطابقة للبحث</p>
        </div>
      )}
    </div>
  );
}
