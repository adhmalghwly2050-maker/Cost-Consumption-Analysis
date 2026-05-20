import { useEffect, useState } from "react";
import { boqDb } from "@/lib/db";
import { parseNum } from "@/lib/analyticsEngine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell,
} from "recharts";

const fmtMoney = (v: number) => {
  if (!isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}م`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}ألف`;
  return v.toLocaleString("ar");
};
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

interface TypeRow {
  type: string;
  totalReq: number;
  totalClr: number;
  remaining: number;
  clearancePct: number;
  projectCount: number;
}

interface StatusRow {
  status: string;
  totalReq: number;
  totalClr: number;
  remaining: number;
  count: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-xl" dir="rtl">
      <p className="text-muted-foreground mb-2 font-medium">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-6 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="tabular-nums font-bold text-foreground">{fmtMoney(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function CustodyTimelinePage() {
  const [byType, setByType] = useState<TypeRow[]>([]);
  const [byStatus, setByStatus] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const rows = await boqDb.historicalUsage.toArray();

      // Group by project type
      const typeMap = new Map<string, { projects: Set<string>; req: number; clr: number }>();
      const statusMap = new Map<string, { req: number; clr: number; count: number }>();

      for (const r of rows) {
        const type = r.projectType ?? "غير محدد";
        const status = r.projectStatus ?? "غير محدد";
        const req = parseNum(r.requestedAmount) ?? 0;
        const clr = parseNum(r.clearedAmount) ?? 0;

        if (!typeMap.has(type)) typeMap.set(type, { projects: new Set(), req: 0, clr: 0 });
        const t = typeMap.get(type)!;
        t.req += req;
        t.clr += clr;
        if (r.projectId) t.projects.add(r.projectId);

        if (!statusMap.has(status)) statusMap.set(status, { req: 0, clr: 0, count: 0 });
        const s = statusMap.get(status)!;
        s.req += req;
        s.clr += clr;
        s.count++;
      }

      const typeRows: TypeRow[] = Array.from(typeMap.entries())
        .map(([type, v]) => ({
          type,
          totalReq: v.req,
          totalClr: v.clr,
          remaining: v.req - v.clr,
          clearancePct: v.req > 0 ? (v.clr / v.req) * 100 : 0,
          projectCount: v.projects.size,
        }))
        .filter(r => r.totalReq > 0)
        .sort((a, b) => b.totalReq - a.totalReq);

      const statusRows: StatusRow[] = Array.from(statusMap.entries())
        .map(([status, v]) => ({
          status,
          totalReq: v.req,
          totalClr: v.clr,
          remaining: v.req - v.clr,
          count: v.count,
        }))
        .filter(r => r.totalReq > 0)
        .sort((a, b) => b.totalReq - a.totalReq);

      setByType(typeRows);
      setByStatus(statusRows);
      setLoading(false);
    })();
  }, []);

  const totalReq = byType.reduce((s, r) => s + r.totalReq, 0);
  const totalClr = byType.reduce((s, r) => s + r.totalClr, 0);
  const totalRem = totalReq - totalClr;

  if (loading) return <div className="text-center text-muted-foreground py-20">جاري التحميل…</div>;

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-foreground">متابعة العهد</h1>
        <p className="text-sm text-muted-foreground mt-1">توزيع التعزيز والإخلاء حسب نوع المشروع والحالة</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي التعزيز", value: fmtMoney(totalReq), color: "text-foreground" },
          { label: "إجمالي الإخلاء", value: fmtMoney(totalClr), color: "text-emerald-400" },
          { label: "غير المخلى", value: fmtMoney(totalRem), color: "text-red-400" },
          { label: "نسبة الإخلاء الكلية", value: totalReq > 0 ? fmtPct((totalClr / totalReq) * 100) : "—", color: "text-amber-400" },
        ].map(k => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{k.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar chart — by type */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm text-muted-foreground">التعزيز والإخلاء حسب نوع المشروع</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byType} margin={{ top: 4, right: 4, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="type"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={v => fmtMoney(v)} width={70} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Bar dataKey="totalReq" name="التعزيز" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Bar dataKey="totalClr" name="الإخلاء" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* By type — detailed table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm text-muted-foreground">تفصيل حسب نوع المشروع</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-right p-3 font-medium">نوع المشروع</th>
                  <th className="text-right p-3 font-medium">المشاريع</th>
                  <th className="text-right p-3 font-medium">التعزيز</th>
                  <th className="text-right p-3 font-medium">الإخلاء</th>
                  <th className="text-right p-3 font-medium">المتبقي</th>
                  <th className="text-right p-3 font-medium">نسبة الإخلاء</th>
                </tr>
              </thead>
              <tbody>
                {byType.map(r => (
                  <tr key={r.type} className="border-b border-border/40 hover:bg-secondary/30">
                    <td className="p-3 font-medium text-foreground">{r.type}</td>
                    <td className="p-3 text-muted-foreground tabular-nums">{r.projectCount}</td>
                    <td className="p-3 tabular-nums">{fmtMoney(r.totalReq)}</td>
                    <td className="p-3 tabular-nums text-emerald-400">{fmtMoney(r.totalClr)}</td>
                    <td className="p-3 tabular-nums text-red-400">{fmtMoney(r.remaining)}</td>
                    <td className="p-3 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted/40 rounded-full h-1.5">
                          <div
                            className={`h-full rounded-full ${r.clearancePct >= 80 ? "bg-emerald-500" : r.clearancePct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, r.clearancePct)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground w-12 text-left">{fmtPct(r.clearancePct)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* By status */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm text-muted-foreground">ملخص حسب حالة المشروع</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {byStatus.map(r => (
            <div key={r.status}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-foreground font-medium">{r.status}</span>
                <div className="flex gap-4 text-muted-foreground">
                  <span>تعزيز: <span className="text-foreground tabular-nums">{fmtMoney(r.totalReq)}</span></span>
                  <span>إخلاء: <span className="text-emerald-400 tabular-nums">{fmtMoney(r.totalClr)}</span></span>
                  <span>متبقي: <span className="text-red-400 tabular-nums">{fmtMoney(r.remaining)}</span></span>
                </div>
              </div>
              <div className="w-full bg-muted/40 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, r.totalReq > 0 ? (r.totalClr / r.totalReq) * 100 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
