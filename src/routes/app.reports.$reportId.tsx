import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { BTN, BTN_GHOST } from "@/components/pd/assetUi";
import { Select, TextInput } from "@/components/pd/form";
import { fmtCell, reportIcon } from "@/components/pd/reportUi";
import { money } from "@/lib/pd/engine";
import { applyFilters, breakdown, GROUP_LABEL, REPORTS, type Row } from "@/lib/pd/reports";
import { useDB } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/reports/$reportId")({
  loader: ({ params }) => { const r = REPORTS.find((x) => x.id === params.reportId); if (!r) throw notFound(); return { name: r.name, desc: r.desc }; },
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.name ?? "Report"} · ProcureDesk` },
    { name: "description", content: loaderData?.desc ?? "Filter, sort and export report records." },
    { property: "og:title", content: `${loaderData?.name ?? "Report"} · ProcureDesk` },
    { property: "og:description", content: loaderData?.desc ?? "Filter, sort and export report records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ReportPage,
  notFoundComponent: () => <div className="p-8 text-sm">This report doesn't exist. <Link to="/app/reports" className="text-primary hover:underline">Back to reports</Link></div>,
});

const PAGE = 25;
const iso = (dt: Date) => dt.toISOString().slice(0, 10);
const PRESETS = [{ id: "30", label: "Last 30 days" }, { id: "90", label: "Last 90 days" }, { id: "ytd", label: "This year" }, { id: "all", label: "All time" }];

function ReportPage() {
  const { reportId } = Route.useParams();
  const rep = REPORTS.find((r) => r.id === reportId)!;
  const db = useDB();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>();
  const [page, setPage] = useState(0);
  const all = useMemo(() => rep.rows(db), [rep, db]);
  const rows = useMemo(() => {
    const r = applyFilters(rep, all, { q, from, to, values });
    if (!sort) return r;
    return [...r].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""))) * sort.dir; });
  }, [rep, all, q, from, to, values, sort]);
  const moneyCols = rep.columns.filter((c) => c.kind === "money");
  const top = breakdown(rep, rows).slice(0, 5);
  const topMax = Math.max(1, ...top.map((t) => t.v));
  const sumCol = rep.columns.find((c) => c.key === rep.sumKey);
  const options = (key: string) => [...new Set(all.map((r) => String(r[key] ?? "")).filter(Boolean))].sort();
  const active = [q && { k: "q", label: `“${q}”`, clear: () => setQ("") }, (from || to) && { k: "date", label: `${from ? fmtCell(from, "date") : "Start"} – ${to ? fmtCell(to, "date") : "Today"}`, clear: () => { setFrom(""); setTo(""); } },
    ...Object.entries(values).filter(([, v]) => v).map(([k, v]) => ({ k, label: `${rep.columns.find((c) => c.key === k)?.label}: ${v}`, clear: () => setValues((s) => ({ ...s, [k]: "" })) }))].filter(Boolean) as { k: string; label: string; clear: () => void }[];
  const reset = () => { setQ(""); setFrom(""); setTo(""); setValues({}); setPage(0); };
  const preset = (id: string) => { setPage(0); const n = new Date(); if (id === "all") { setFrom(""); setTo(""); return; } setTo(iso(n)); setFrom(id === "ytd" ? `${n.getFullYear()}-01-01` : iso(new Date(n.getTime() - Number(id) * 864e5))); };
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const Icon = reportIcon(rep.icon);
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [rep.columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => rep.columns.map((c) => esc(r[c.key])).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${rep.id}-${iso(new Date())}.csv`; a.click();
    toast.success(`Exported ${rows.length} records`);
  };
  const cell = (r: Row, key: string, i: number) => {
    const c = rep.columns.find((x) => x.key === key)!;
    const text = fmtCell(r[key], c.kind);
    if (i === 0 && r._link) return r._linkKind === "request" ? <Link to="/app/requests/$id" params={{ id: r._link }} className="num text-primary hover:underline">{text}</Link> : <Link to="/app/assets/$assetId" params={{ assetId: r._link }} className="text-primary hover:underline">{text}</Link>;
    return text;
  };

  return <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-muted-foreground"><Link to="/app/reports" className="hover:text-foreground">Reports</Link><ChevronRight className="size-3" /><span>{GROUP_LABEL[rep.group]}</span><ChevronRight className="size-3" /><span className="text-foreground">{rep.name}</span></nav>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-muted-foreground"><Icon className="size-4" /></span><div><h1 className="pd-h1">{rep.name}</h1><p className="mt-0.5 text-[13px] text-muted-foreground">{rep.desc}</p></div></div>
      <button className={BTN} onClick={exportCsv} disabled={!rows.length}><Download className="size-3.5" />Export CSV</button>
    </header>

    <section aria-label="Filters" className="pd-panel space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><TextInput aria-label="Search records" placeholder="Search records…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-8" /></div>
        {rep.columns.filter((c) => c.filter).map((c) => <Select key={c.key} aria-label={c.label} className={cn("w-auto max-w-44", values[c.key] && "border-primary/50")} value={values[c.key] ?? ""} onChange={(e) => { setValues((s) => ({ ...s, [c.key]: e.target.value })); setPage(0); }}><option value="">{c.label}: All</option>{options(c.key).map((o) => <option key={o} value={o}>{o}</option>)}</Select>)}
      </div>
      {rep.dateKey && <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">{rep.columns.find((c) => c.key === rep.dateKey)?.label}:</span>
        {PRESETS.map((p) => <button key={p.id} onClick={() => preset(p.id)} className="rounded-full border border-border px-2.5 py-1 hover:bg-subtle">{p.label}</button>)}
        <TextInput type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-auto" />
        <span className="text-muted-foreground">to</span>
        <TextInput type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="w-auto" />
      </div>}
      {active.length > 0 && <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
        {active.map((a) => <span key={a.k} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-[12px] text-primary">{a.label}<button aria-label={`Remove ${a.label}`} onClick={a.clear} className="rounded-full p-0.5 hover:bg-primary/15"><X className="size-3" /></button></span>)}
        <button onClick={reset} className={cn(BTN_GHOST, "h-6 px-2 text-[12px]")}>Clear all</button>
      </div>}
    </section>

    <div className="grid gap-3 md:grid-cols-[220px_1fr]">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
        <div className="pd-panel p-3"><p className="text-[12px] text-muted-foreground">Records</p><p className="num text-xl">{rows.length}<span className="text-[12px] text-muted-foreground"> / {all.length}</span></p></div>
        {moneyCols.slice(-1).map((c) => <div key={c.key} className="pd-panel p-3"><p className="text-[12px] text-muted-foreground">Total {c.label.toLowerCase()}</p><p className="num text-xl">{money(rows.reduce((t, r) => t + (Number(r[c.key]) || 0), 0))}</p></div>)}
      </div>
      {top.length > 0 && <div className="pd-panel p-3">
        <p className="mb-2 text-[12px] text-muted-foreground">Top {rep.columns.find((c) => c.key === rep.groupBy)?.label.toLowerCase()} by {sumCol?.label.toLowerCase() ?? "records"}</p>
        <ul className="space-y-1.5">{top.map((t) => <li key={t.k}><button onClick={() => { setValues((s) => ({ ...s, [rep.groupBy!]: t.k })); setPage(0); }} className="grid w-full grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3 text-left text-[12px] hover:text-primary" title={`Filter by ${t.k}`}><span className="truncate">{t.k}</span><span className="h-1.5 rounded-full bg-subtle"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${(t.v / topMax) * 100}%` }} /></span><span className="num text-muted-foreground">{fmtCell(t.v, sumCol?.kind === "pct" ? "money" : sumCol?.kind)}</span></button></li>)}</ul>
      </div>}
    </div>

    <div className="pd-panel overflow-hidden">
      {rows.length ? <>
        <div className="overflow-x-auto pd-scroll-quiet"><table className="pd-table min-w-[760px]">
          <thead><tr>{rep.columns.map((c) => { const on = sort?.key === c.key; const right = c.kind && c.kind !== "text" && c.kind !== "date"; return <th key={c.key} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : undefined} className={cn(right && "text-right")}><button onClick={() => setSort(on && sort!.dir === -1 ? undefined : { key: c.key, dir: on ? -1 : 1 })} className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")}>{c.label}{on && (sort!.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}</button></th>; })}</tr></thead>
          <tbody>{view.map((r, i) => <tr key={i}>{rep.columns.map((c, ci) => <td key={c.key} className={cn("whitespace-nowrap", c.kind && c.kind !== "text" && c.kind !== "date" && "num text-right", ci === 1 && "max-w-64 truncate")}>{cell(r, c.key, ci)}</td>)}</tr>)}</tbody>
          {moneyCols.length > 0 && <tfoot><tr className="border-t border-border font-medium">{rep.columns.map((c, i) => <td key={c.key} className={cn("px-3 py-2 text-[12px]", c.kind === "money" && "num text-right")}>{i === 0 ? "Total" : c.kind === "money" ? money(rows.reduce((t, r) => t + (Number(r[c.key]) || 0), 0)) : ""}</td>)}</tr></tfoot>}
        </table></div>
        {pages > 1 && <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[12px] text-muted-foreground"><span>{page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} of {rows.length}</span><div className="flex gap-1"><button className={BTN} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className={BTN} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button></div></div>}
      </> : <div className="py-14 text-center"><p className="text-sm font-medium">{all.length ? "No records match these filters" : "No records yet"}</p>{active.length > 0 && <button onClick={reset} className={cn(BTN, "mt-3")}>Clear filters</button>}</div>}
    </div>
  </div>;
}
