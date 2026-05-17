import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AnalyticsRow } from "@/lib/api";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Search, BarChart3, ArrowUpDown, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";

const EFF_COLOR: Record<string, string> = {
  "ممتاز": "text-green-400",
  "جيد جداً": "text-blue-400",
  "جيد": "text-yellow-400",
  "متوسط": "text-orange-400",
  "ضعيف": "text-red-400",
  "غير محدد": "text-muted-foreground",
};

const EFF_BG: Record<string, string> = {
  "ممتاز": "bg-green-400/10 text-green-400",
  "جيد جداً": "bg-blue-400/10 text-blue-400",
  "جيد": "bg-yellow-400/10 text-yellow-400",
  "متوسط": "bg-orange-400/10 text-orange-400",
  "ضعيف": "bg-red-400/10 text-red-400",
  "غير محدد": "bg-muted/50 text-muted-foreground",
};

const n = (v: string | null | undefined, decimals = 2) =>
  v == null ? "—" : parseFloat(v).toFixed(decimals);
const pct = (v: string | null | undefined) =>
  v == null ? "—" : `${parseFloat(v).toFixed(1)}%`;

export default function AnalysisPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof AnalyticsRow>("boqItemName");
  const [sortAsc, setSortAsc] = useState(true);
  const [effFilter, setEffFilter] = useState<string>("الكل");

  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: api.getAllAnalytics,
  });

  const rows = data?.analytics ?? [];

  const effOptions = useMemo(() => {
    const s = new Set(rows.map(r => r.efficiencyRating || "غير محدد"));
    return ["الكل", ...Array.from(s)];
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(row =>
        row.boqItemName?.toLowerCase().includes(q) ||
        row.elementName?.toLowerCase().includes(q)
      );
    }
    if (effFilter !== "الكل") {
      r = r.filter(row => (row.efficiencyRating || "غير محدد") === effFilter);
    }
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv), "ar");
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, search, effFilter, sortKey, sortAsc]);

  const handleSort = (key: keyof AnalyticsRow) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  // Chart: top over-allocated
  const chartData = [...rows]
    .filter(r => r.avgOverAllocPct)
    .sort((a, b) => parseFloat(b.avgOverAllocPct!) - parseFloat(a.avgOverAllocPct!))
    .slice(0, 10)
    .map(r => ({ name: r.elementName?.slice(0, 18), value: parseFloat(r.avgOverAllocPct!) }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-10 text-center">
        <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-semibold text-foreground mb-2">لا توجد نتائج تحليل</h3>
        <p className="text-sm text-muted-foreground mb-4">يرجى رفع البيانات وتشغيل التحليل أولاً</p>
        <Link href="/import" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
          الذهاب لصفحة الاستيراد
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">تحليل جميع البنود</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {rows.length.toLocaleString("ar-EG")} مجموعة عنصر محللة
        </p>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-destructive" />
            <h3 className="font-semibold text-sm">أعلى 10 عناصر في نسبة الزيادة في التخصيص</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
              <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)}%`, "الزيادة في التخصيص"]}
                contentStyle={{ background: "hsl(215 25% 13%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, direction: "rtl" }}
                itemStyle={{ color: "#f87171" }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={`hsl(${0 + i * 3} 84% ${55 + i * 2}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن بند أو عنصر..."
            className="w-full bg-card border border-input rounded-lg py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
        </div>
        <select
          value={effFilter}
          onChange={e => setEffFilter(e.target.value)}
          className="bg-card border border-input rounded-lg py-2 px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          {effOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {filtered.length.toLocaleString("ar-EG")} نتيجة
        </span>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <Th label="البند" k="boqItemName" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <Th label="العنصر" k="elementName" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <Th label="المشاريع" k="nProjects" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <Th label="وسيط م.الاستهلاك" k="medianCf" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <Th label="P80" k="p80Cf" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <Th label="الزيادة في التخصيص" k="avgOverAllocPct" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <Th label="متوسط الاستهلاك" k="avgUsedQty" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <Th label="التصنيف" k="efficiencyRating" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium text-center">تفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 200).map((row, i) => (
                <tr key={i} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 text-xs max-w-[180px]">
                    <div className="truncate font-medium text-foreground">{row.boqItemName}</div>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[150px]">
                    <div className="truncate text-muted-foreground">{row.elementName}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-foreground">{row.nProjects}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-mono text-blue-400">{n(row.medianCf, 3)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-mono text-purple-400">{n(row.p80Cf, 3)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-bold ${parseFloat(row.avgOverAllocPct || "0") > 50 ? "text-red-400" : parseFloat(row.avgOverAllocPct || "0") > 20 ? "text-orange-400" : "text-green-400"}`}>
                      {pct(row.avgOverAllocPct)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground font-mono">
                    {n(row.avgUsedQty, 2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EFF_BG[row.efficiencyRating || "غير محدد"]}`}>
                      {row.efficiencyRating || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/item?item=${encodeURIComponent(row.boqItemName)}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs"
                    >
                      <ExternalLink className="w-3 h-3" />
                      عرض
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
            يُعرض أول 200 نتيجة من {filtered.length.toLocaleString("ar-EG")}. استخدم البحث للتضييق.
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ label, k, sortKey, sortAsc, onSort }: {
  label: string; k: keyof AnalyticsRow;
  sortKey: keyof AnalyticsRow; sortAsc: boolean;
  onSort: (k: keyof AnalyticsRow) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      className="px-4 py-3 text-right text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground whitespace-nowrap"
      onClick={() => onSort(k)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 flex-shrink-0 ${active ? "text-primary" : ""}`} />
      </span>
    </th>
  );
}
