import { useEffect, useState } from "react";
import { boqDb } from "@/lib/db";
import { parseNum } from "@/lib/analyticsEngine";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fmtMoney = (v: number) => {
  if (!isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}م`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}ألف`;
  return v.toLocaleString("ar");
};
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

interface AlertRow {
  boqItemName: string;
  elementName: string;
  totalReqAmt: number;
  totalClrAmt: number;
  gapAmt: number;
  gapPct: number;
  nRecords: number;
  nZeroCleared: number;
  severity: "عالية" | "متوسطة" | "منخفضة";
}

export default function OverAllocAlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSev, setFilterSev] = useState("الكل");

  useEffect(() => {
    (async () => {
      const rows = await boqDb.historicalUsage.toArray();

      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        if (!r.boqItemName || !r.elementName) continue;
        const key = `${r.boqItemName}|||${r.elementName}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      }

      const result: AlertRow[] = [];
      for (const [key, rws] of groups) {
        const [boqItemName, elementName] = key.split("|||");
        const totalReqAmt = rws.reduce((s, r) => s + (parseNum(r.requestedAmount) ?? 0), 0);
        const totalClrAmt = rws.reduce((s, r) => s + (parseNum(r.clearedAmount) ?? 0), 0);
        if (totalReqAmt <= 0) continue;
        const gapAmt = totalReqAmt - totalClrAmt;
        const gapPct = (gapAmt / totalReqAmt) * 100;
        if (gapPct < 10) continue;
        const nZeroCleared = rws.filter(r => (parseNum(r.clearedAmount) ?? 0) === 0).length;
        const severity: AlertRow["severity"] =
          gapPct >= 70 ? "عالية" : gapPct >= 40 ? "متوسطة" : "منخفضة";
        result.push({ boqItemName, elementName, totalReqAmt, totalClrAmt, gapAmt, gapPct, nRecords: rws.length, nZeroCleared, severity });
      }

      result.sort((a, b) => b.gapAmt - a.gapAmt);
      setAlerts(result);
      setLoading(false);
    })();
  }, []);

  const filtered = filterSev === "الكل" ? alerts : alerts.filter(a => a.severity === filterSev);
  const totalGap = filtered.reduce((s, a) => s + a.gapAmt, 0);
  const totalReq = filtered.reduce((s, a) => s + a.totalReqAmt, 0);

  const sevColor = (s: string) =>
    s === "عالية" ? "bg-red-500/15 text-red-300 border-red-500/30" :
    s === "متوسطة" ? "bg-orange-500/15 text-orange-300 border-orange-500/30" :
    "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";

  if (loading) return <div className="text-center text-muted-foreground py-20">جاري التحميل…</div>;

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-foreground">تنبيهات الفائض في التعزيز</h1>
        <p className="text-sm text-muted-foreground mt-1">بنود تجاوز فيها التعزيز الإخلاءَ بفارق كبير</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي التنبيهات", value: alerts.length.toString(), color: "text-amber-400" },
          { label: "عالية الخطورة", value: alerts.filter(a => a.severity === "عالية").length.toString(), color: "text-red-400" },
          { label: "إجمالي الفجوة", value: fmtMoney(totalGap), color: "text-red-400" },
          { label: "نسبة الفجوة", value: totalReq > 0 ? fmtPct((totalGap / totalReq) * 100) : "—", color: "text-orange-400" },
        ].map(k => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{k.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["الكل", "عالية", "متوسطة", "منخفضة"].map(s => (
          <button
            key={s}
            onClick={() => setFilterSev(s)}
            className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
              filterSev === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-secondary"
            }`}
          >{s}</button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-10">لا توجد تنبيهات</div>
        )}
        {filtered.map((a, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-xs ${sevColor(a.severity)}`}>{a.severity}</Badge>
                    <span className="font-medium text-sm text-foreground">{a.boqItemName}</span>
                    <span className="text-muted-foreground text-xs">—</span>
                    <span className="text-muted-foreground text-xs">{a.elementName}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">التعزيز</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{fmtMoney(a.totalReqAmt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">الإخلاء</p>
                      <p className="text-sm font-bold text-emerald-400 tabular-nums">{fmtMoney(a.totalClrAmt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">الفجوة</p>
                      <p className="text-sm font-bold text-red-400 tabular-nums">{fmtMoney(a.gapAmt)}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>نسبة الإخلاء</span>
                      <span className="tabular-nums">{fmtPct(100 - a.gapPct)}</span>
                    </div>
                    <div className="w-full bg-muted/40 rounded-full h-1.5">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(100, 100 - a.gapPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-xs text-muted-foreground">مشاريع</p>
                  <p className="text-lg font-bold text-foreground">{a.nRecords}</p>
                  {a.nZeroCleared > 0 && (
                    <p className="text-xs text-red-400">{a.nZeroCleared} بدون إخلاء</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
