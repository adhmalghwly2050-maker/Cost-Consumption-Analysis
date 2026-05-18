import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3, Upload, Search, BookOpen, Home, Menu, X, TrendingUp,
  Database, Zap, TrendingDown, GitBranch, Shield, Layers, FlaskConical,
  Activity, ScrollText
} from "lucide-react";

const navGroups = [
  {
    label: "الرئيسية",
    items: [
      { path: "/", label: "لوحة التحكم", icon: Home },
      { path: "/import", label: "استيراد البيانات", icon: Upload },
    ],
  },
  {
    label: "التحليل والذكاء",
    items: [
      { path: "/analysis", label: "تحليل البنود", icon: BarChart3 },
      { path: "/item", label: "تفاصيل البند", icon: Search },
      { path: "/adaptive", label: "المعايير التكيفية", icon: Zap },
      { path: "/project-context", label: "تصنيف المشاريع", icon: Layers },
    ],
  },
  {
    label: "التوصيات والحوكمة",
    items: [
      { path: "/workflow", label: "سير عمل التوصيات", icon: GitBranch },
      { path: "/standard-evolution", label: "تطور المعايير", icon: Activity },
      { path: "/data-governance", label: "حوكمة البيانات", icon: Shield },
    ],
  },
  {
    label: "التقارير التنفيذية",
    items: [
      { path: "/overalloc", label: "تقرير المبالغة التاريخية", icon: TrendingDown },
      { path: "/stability-report", label: "تقرير الاستقرار", icon: FlaskConical },
      { path: "/volatility-report", label: "تقرير التذبذب", icon: ScrollText },
      { path: "/standard", label: "المرجع المعياري", icon: BookOpen },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-64 bg-sidebar border-l border-sidebar-border flex flex-col transition-transform duration-300
          ${mobileOpen ? "translate-x-0" : "translate-x-full"} lg:translate-x-0 lg:static lg:inset-auto lg:flex`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground leading-tight">منصة المعايير الذكية</div>
              <div className="text-xs text-muted-foreground">الذكاء الإنشائي التكيفي</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 py-1 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {group.label}
              </div>
              <div className="space-y-0.5 mt-1">
                {group.items.map(({ path, label, icon: Icon }) => {
                  const active = location === path;
                  return (
                    <Link
                      key={path}
                      href={path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${active
                          ? "bg-primary text-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent"
                        }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="w-3.5 h-3.5" />
            <span>منصة الحوكمة والذكاء التكيفي</span>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <button
            className="p-2 rounded-lg hover:bg-secondary"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="font-bold text-sm">منصة المعايير الذكية الإنشائية</div>
          <div className="w-9" />
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
