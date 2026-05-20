import { useEffect, useState } from "react";
import { boqDb } from "@/lib/db";
import { parseNum } from "@/lib/analyticsEngine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const fmtMoney = (v: number) => {
  if (!isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}م`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}ألف`;
  return v.toLocaleString("ar");
};
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

interface ProjectRow {
  projectId: string;
  projectName: string;
  projectType: string;
  status: string;
  branch: string;
  totalRequests: number;
  totalCleared: number;
  remaining: number;
  clearancePct: number;
}

export default function OpenCustodiesPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [filterType, setFilterType] = useState("الكل");
  const [sortCol, setSortCol] = useState<"remaining" | "clearancePct" | "totalRequests">("remaining");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    (async () => {
      const rows = await boqDb.historicalUsage.toArray();
      // سلسلة الحالات: لم يبدأ → جاري → منجز → مسلم → جاري الاقفال → مقفل نهائي
      // "جاري" فقط هي المشاريع المفتوحة فعلاً
      const open = rows.filter(r => r.projectStatus === "جاري");

      const map = new Map<string, ProjectRow>();
      for (const r of open) {
        const pid = r.projectId ?? "غير محدد";
        if (!map.has(pid)) {
          map.set(pid, {
            projectId: pid,
            projectName: r.projectName ?? pid,
            projectType: r.projectType ?? "غير محدد",
            status: r.projectStatus ?? "",
            branch: r.branch ?? "",
            totalRequests: 0,
            totalCleared: 0,
            remaining: 0,
            clearancePct: 0,
          });
        }
        const p = map.get(pid)!;
        p.totalRequests += parseNum(r.requestedAmount) ?? 0;
        p.totalCleared += parseNum(r.clearedAmount) ?? 0;
      }

      const result = Array.from(map.values()).map(p => ({
        ...p,
        remaining: p.totalRequests - p.totalCleared,
        clearancePct: p.totalRequests > 0 ? (p.totalCleared / p.totalRequests) * 100 : 0,
      }));

      setProjects(result);
      setLoading(false);
    })();
  }, []);

  const allStatuses = ["الكل", ...Array.from(new Set(projects.map(p => p.status)))];
  const allTypes = ["الكل", ...Array.from(new Set(projects.map(p => p.projectType)))];

  const filtered = projects
    .filter(p => filterStatus === "الكل" || p.status === filterStatus)
    .filter(p => filterType === "الكل" || p.projectType === filterType)
    .filter(p => !search || p.projectName.includes(search) || p.projectId.includes(search))
    .sort((a, b) => {
      const diff = a[sortCol] - b[sortCol];
      return sortDir === "desc" ? -diff : diff;
    });

  const totalReq = filtered.reduce((s, p) => s + p.totalRequests, 0);
  const totalClr = filtered.reduce((s, p) => s + p.totalCleared, 0);
  const totalRem = totalReq - totalClr;

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };
  const sortIcon = (col: typeof sortCol) => sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  if (loading) return <div className="text-center text-muted-foreground py-20">جاري التحميل…</div>;

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-foreground">لوحة العهد المفتوحة</h1>
        <p className="text-sm text-muted-foreground mt-1">المشاريع الجارية وجاري الإقفال — التعزيز مقابل الإخلاء</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "مشاريع مفتوحة", value: filtered.length.toString(), color: "text-amber-400" },
          { label: "إجمالي التعزيز", value: fmtMoney(totalReq), color: "text-foreground" },
          { label: "إجمالي الإخلاء", value: fmtMoney(totalClr), color: "text-emerald-400" },
          { label: "المبلغ غير المخلى", value: fmtMoney(totalRem), color: "text-red-400" },
        ].map(k => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{k.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="بحث باسم أو رقم المشروع…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-56 h-8 text-sm"
          dir="rtl"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-md px-3 h-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          dir="rtl"
        >
          {allStatuses.map(s => <option key={s}>{s}</option>)}
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-md px-3 h-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          dir="rtl"
        >
          {allTypes.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-right p-3 font-medium">اسم المشروع</th>
                  <th className="text-right p-3 font-medium">النوع</th>
                  <th className="text-right p-3 font-medium">الحالة</th>
                  <th className="text-right p-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("totalRequests")}>
                    التعزيز{sortIcon("totalRequests")}
                  </th>
                  <th className="text-right p-3 font-medium">الإخلاء</th>
                  <th className="text-right p-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("remaining")}>
                    المتبقي{sortIcon("remaining")}
                  </th>
                  <th className="text-right p-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("clearancePct")}>
                    نسبة الإخلاء{sortIcon("clearancePct")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-10">لا توجد نتائج</td></tr>
                )}
                {filtered.map(p => (
                  <tr key={p.projectId} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                    <td className="p-3">
                      <div className="font-medium text-foreground truncate max-w-[220px]">{p.projectName}</div>
                      <div className="text-xs text-muted-foreground">{p.projectId}</div>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{p.projectType}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={
                        p.status === "جاري"
                          ? "bg-blue-500/10 text-blue-300 border-blue-500/30 text-xs"
                          : "bg-orange-500/10 text-orange-300 border-orange-500/30 text-xs"
                      }>{p.status}</Badge>
                    </td>
                    <td className="p-3 tabular-nums text-foreground">{fmtMoney(p.totalRequests)}</td>
                    <td className="p-3 tabular-nums text-emerald-400">{fmtMoney(p.totalCleared)}</td>
                    <td className="p-3 tabular-nums text-red-400 font-medium">{fmtMoney(p.remaining)}</td>
                    <td className="p-3 min-w-[130px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted/40 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${p.clearancePct >= 80 ? "bg-emerald-500" : p.clearancePct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, p.clearancePct)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground w-12 text-left">{fmtPct(p.clearancePct)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
