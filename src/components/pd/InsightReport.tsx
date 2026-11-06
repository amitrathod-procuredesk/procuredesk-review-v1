import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Info, RefreshCw } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TextInput } from "@/components/pd/form";
import {
  type InsightReport as Report,
  type InsightQuery,
  type InsightRow,
} from "@/lib/pd/insights";
import { useDB } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

const GROUP_LABEL: Record<InsightQuery["group"], string> = {
  month: "Month",
  supplier: "Supplier",
  user: "Requestor",
  department: "Department",
  category: "Category",
  account: "GL account",
  item: "Item",
  budget: "Budget",
};
export const recordNoun = (topic: InsightQuery["topic"], n = 2) => {
  const w =
    topic === "invoices"
      ? "invoice"
      : topic === "orders"
        ? "purchase order"
        : topic === "items"
          ? "received line"
          : topic === "budgets"
            ? "budget"
            : "request line";
  return n === 1 ? w : `${w}s`;
};
export const groupKey = (r: InsightRow, g: InsightQuery["group"]) =>
  g === "month" ? r.date.slice(0, 7) : r[g];
const monthLabel = (k: string) =>
  /^\d{4}-\d{2}$/.test(k)
    ? new Date(`${k}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : k;
const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export function periodLabel(q: InsightQuery) {
  if (!q.start && !q.end) return "All time";
  const y = q.start?.slice(0, 4);
  if (q.start && q.end && q.start.endsWith("-01-01") && q.end === `${y}-12-31`)
    return `${y} · Jan 1 – Dec 31, ${y}`;
  return `${q.start ? fmtDate(q.start) : "Start"} – ${q.end ? fmtDate(q.end) : "Today"}`;
}

export function InsightReport({
  report,
  onRefresh,
  loading,
  drill,
  onDrill,
}: {
  report: Report;
  onRefresh: (q: InsightQuery) => void;
  loading: boolean;
  drill?: string | null;
  onDrill: (label: string | null) => void;
}) {
  const db = useDB();
  const [periodOpen, setPeriodOpen] = useState(false);
  const q = report.query;
  const budget = q.topic === "budgets";
  const money = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: report.currency }).format(v);
  const update = (p: Partial<InsightQuery>) => onRefresh({ ...q, ...p });
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    report.rows.forEach((r) => {
      const k = groupKey(r, q.group);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    return report.groups.map((g) => ({ ...g, count: counts.get(g.label) ?? 0 }));
  }, [report, q.group]);
  const top = q.group === "month" ? undefined : groups[0];
  const titleSuffix = q.group === "month" ? "" : ` by ${GROUP_LABEL[q.group].toLowerCase()}`;
  const title = `${report.title}${titleSuffix}`;
  const scope = q.supplier ?? q.user ?? q.category ?? q.account;
  const thisYear = new Date().getFullYear();
  const presets = [
    { label: `This year`, start: `${thisYear}-01-01`, end: `${thisYear}-12-31` },
    { label: `Last year`, start: `${thisYear - 1}-01-01`, end: `${thisYear - 1}-12-31` },
    {
      label: "Last 12 months",
      start: new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10),
      end: null,
    },
    { label: "All time", start: null, end: null },
  ];
  const exportCsv = (rows: InsightRow[], name: string) => {
    const cols = ["id", "date", "supplier", "user", "department", "category", "account", "item", "amount", "quantity"] as const;
    const csv = [
      cols.join(","),
      ...rows.map((r) => cols.map((k) => `"${String(r[k]).replaceAll('"', '""')}"`).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const drillRows =
    drill == null
      ? []
      : drill === ""
        ? report.rows
        : report.rows.filter((r) => groupKey(r, q.group) === drill);
  const drillTotal = drillRows.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(1, ...groups.map((g) => g.amount));

  return (
    <section className="min-w-0 space-y-3" aria-label={title}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0 space-y-2.5">
          <div className="flex items-center gap-1">
            <h2 className="pd-h1 truncate">{title}</h2>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="size-6" aria-label="About this report">
                  <Info className="size-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 space-y-2 text-xs text-muted-foreground">
                {report.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
                <p>Updated {new Date(report.generatedAt).toLocaleString()}</p>
              </PopoverContent>
            </Popover>
          </div>
          {report.available && (
            <div className="flex flex-wrap gap-2">
              {!budget && (
                <Popover open={periodOpen} onOpenChange={setPeriodOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="bg-surface font-normal">
                      {periodLabel(q)}
                      <ChevronDown />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-1.5">
                    {presets.map((p) => {
                      const on = q.start === p.start && (p.label === "Last 12 months" ? !q.end : q.end === p.end);
                      return (
                        <button
                          key={p.label}
                          type="button"
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-subtle"
                          onClick={() => {
                            setPeriodOpen(false);
                            update({ start: p.start, end: p.end });
                          }}
                        >
                          {p.label}
                          {on && <Check className="size-4 text-primary" />}
                        </button>
                      );
                    })}
                    <div className="mt-1 grid grid-cols-2 gap-2 border-t border-border p-2">
                      <label className="text-xs text-muted-foreground">
                        From
                        <TextInput
                          type="date"
                          aria-label="Report start date"
                          value={q.start ?? ""}
                          onChange={(e) => update({ start: e.target.value || null })}
                        />
                      </label>
                      <label className="text-xs text-muted-foreground">
                        To
                        <TextInput
                          type="date"
                          aria-label="Report end date"
                          value={q.end ?? ""}
                          onChange={(e) => update({ end: e.target.value || null })}
                        />
                      </label>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="bg-surface font-normal">
                    {q.department ?? "All departments"}
                    <ChevronDown />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="max-h-72 w-60 overflow-y-auto p-1.5">
                  {[null, ...db.departments.map((d) => d.name)].map((d) => (
                    <button
                      key={d ?? "all"}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-subtle"
                      onClick={() => update({ department: d })}
                    >
                      {d ?? "All departments"}
                      {q.department === d && <Check className="size-4 text-primary" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              {scope && (
                <Button variant="secondary" size="sm" className="font-normal" onClick={() => update({ supplier: null, user: null, category: null, account: null })}>
                  {scope} ×
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Refresh report" disabled={loading} onClick={() => onRefresh(q)}>
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" disabled={!report.available} onClick={() => exportCsv(report.rows, "procuredesk-insights.csv")}>
            Export
          </Button>
        </div>
      </div>

      <div className={cn("pd-panel overflow-hidden", loading && "opacity-60")}>
        {!report.available ? (
          <p className="p-4 text-sm text-muted-foreground">This data isn't available for the selected view.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] divide-x divide-border [&>*]:min-w-0 [&>*]:px-4 [&>*]:py-3">
            <button type="button" className="min-w-0 text-left" onClick={() => onDrill("")} title={`See the ${recordNoun(q.topic)}`}>
              <p className="text-xs text-muted-foreground">{budget ? "Committed" : `Total ${q.topic === "invoices" ? "invoiced" : "value"}`}</p>
              <p className="mt-1 whitespace-nowrap tabular-nums text-lg font-semibold tracking-tight hover:text-primary">{money(report.total)}</p>
            </button>
            <button type="button" className="text-left" onClick={() => onDrill("")}>
              <p className="text-xs capitalize text-muted-foreground">{recordNoun(q.topic)}</p>
              <p className="mt-1 tabular-nums text-lg font-semibold hover:text-primary">{report.count.toLocaleString()}</p>
            </button>
            {report.count > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Average {recordNoun(q.topic, 1)}</p>
                <p className="mt-1 whitespace-nowrap tabular-nums text-lg font-semibold">{money(report.total / report.count)}</p>
              </div>
            )}
            {top && report.total > 0 && (
              <button type="button" className="min-w-0 text-left" onClick={() => onDrill(top.label)}>
                <p className="text-xs text-muted-foreground">Top {GROUP_LABEL[q.group].toLowerCase()}</p>
                <p className="mt-1 truncate text-lg font-semibold hover:text-primary">
                  {top.label} ({((top.amount / report.total) * 100).toFixed(1)}%)
                </p>
              </button>
            )}
          </div>
        )}
      </div>

      {report.available && !report.rows.length && (
        <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          No {recordNoun(q.topic)} match this period.
        </div>
      )}

      {report.available && report.rows.length > 0 && (
        <>
          {q.group === "month" ? (
            <div className="pd-panel min-w-0">
              <header className="flex items-center justify-between border-b border-border/60 px-4 py-2.5"><h3 className="pd-section-title">By month</h3><span className="text-xs text-muted-foreground">Click a bar to see the {recordNoun(q.topic)}</span></header>
              <div className="h-44 px-2 pb-2 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groups.map((g) => ({ ...g, name: monthLabel(g.label) }))} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <YAxis width={44} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v) => new Intl.NumberFormat("en", { notation: "compact" }).format(v)} />
                  <Tooltip cursor={{ fill: "var(--subtle)" }} formatter={(v) => money(Number(v))} contentStyle={{ background: "var(--surface)", borderColor: "var(--border)", borderRadius: 8 }} />
                  <Bar dataKey="amount" name="Amount" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} className="cursor-pointer" onClick={(d) => onDrill((d as unknown as { label: string }).label)} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="pd-panel space-y-0.5 p-2">
              {groups.slice(0, 10).map((g) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => onDrill(g.label)}
                  className="grid w-full grid-cols-[minmax(80px,28%)_minmax(0,1fr)_auto] items-center gap-4 rounded-md px-2 py-1.5 text-left text-sm hover:bg-subtle"
                >
                  <span className="truncate">{g.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-subtle">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(1, (g.amount / max) * 100)}%` }} />
                  </span>
                  <span className="tabular-nums">{money(g.amount)}</span>
                </button>
              ))}
              {groups.length > 10 && <p className="px-2 pt-1 text-xs text-muted-foreground">Top 10 shown. The table and export include all.</p>}
            </div>
          )}
          <div className="pd-panel overflow-x-auto">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>{GROUP_LABEL[q.group]}</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right capitalize">{recordNoun(q.topic)}</th>
                  <th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label} className="cursor-pointer hover:bg-subtle" onClick={() => onDrill(g.label)}>
                    <td>{monthLabel(g.label)}</td>
                    <td className="text-right tabular-nums">{money(g.amount)}</td>
                    <td className="text-right tabular-nums">{g.count}</td>
                    <td className="text-right tabular-nums">{report.total ? ((g.amount / report.total) * 100).toFixed(1) : "0.0"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Sheet open={drill != null} onOpenChange={(o) => !o && onDrill(null)}>
        <SheetContent className="w-full overflow-y-auto bg-surface sm:max-w-xl">
          <SheetHeader className="pr-8 text-left">
            <p className="text-xs font-medium text-muted-foreground">
              {recordNoun(q.topic).replace(/^./, (c) => c.toUpperCase())} behind this figure
            </p>
            <SheetTitle>{drill ? monthLabel(drill) : title}</SheetTitle>
            <SheetDescription>{budget ? "Current snapshot" : periodLabel(q)}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            <div className="flex items-center justify-between gap-3">
              <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                These {drillRows.length} {recordNoun(q.topic, drillRows.length)} total {money(drillTotal)}, matching the figure in the report.
              </p>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => exportCsv(drillRows, "procuredesk-records.csv")}>
                Download CSV
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="pd-table">
                <thead>
                  <tr>
                    {!budget && <th>Date</th>}
                    <th>{budget ? "Budget" : "Record"}</th>
                    <th>{budget ? "Department" : "Supplier"}</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {drillRows.slice(0, 200).map((r) => (
                    <tr key={r.id}>
                      {!budget && <td className="whitespace-nowrap">{r.date ? fmtDate(r.date) : "—"}</td>}
                      <td>
                        {r.requestId ? (
                          <Link to="/app/requests/$id" params={{ id: r.requestId }} className="text-primary hover:underline">
                            {r.requestId}
                          </Link>
                        ) : (
                          <span className="text-primary">{r.id.replace("-DEMO", "")}</span>
                        )}
                        <p className="max-w-56 truncate text-xs text-muted-foreground">{r.item || r.label}</p>
                      </td>
                      <td>{budget ? r.department : r.supplier}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {drillRows.length > 200 && <p className="text-xs text-muted-foreground">First 200 shown. Download CSV for all.</p>}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
