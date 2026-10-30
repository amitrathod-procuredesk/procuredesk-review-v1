import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { money } from "@/lib/pd/engine";
import { BREAKDOWN, INVOICES_WITHOUT_PO, invoicesFor, METRICS, MONTHS, tier, WINDOWS, windowValue, type Dim, type Metric, type MetricId, type Window } from "@/lib/pd/adoption";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/insights/adoption")({
  head: () => ({ meta: [
    { title: "Adoption · ProcureDesk" },
    { name: "description", content: "PO compliance, PO before invoice, spend through ProcureDesk and login adoption, by department and GL account." },
    { property: "og:title", content: "Adoption dashboard · ProcureDesk" },
    { property: "og:description", content: "Is everyone who buys, buying inside ProcureDesk? Track compliance and adoption against benchmark." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Adoption,
});

const TONE = { ok: "text-success bg-success/10", warn: "text-warning bg-warning/10", bad: "text-destructive bg-destructive/10" } as const;
const BAR = { ok: "bg-primary", warn: "bg-warning", bad: "bg-destructive" } as const;

function Adoption() {
  const [win, setWin] = useState<Window>("month");
  const [metric, setMetric] = useState<MetricId>("po");
  const [dim, setDim] = useState<Dim>("department");
  const sel = METRICS.find((m) => m.id === metric)!;
  const rows = [...BREAKDOWN[dim]].sort((a, b) => a.values[metric] - b.values[metric]);
  const missing = INVOICES_WITHOUT_PO.reduce((t, i) => t + i.amount, 0);

  return <TooltipProvider delayDuration={150}>
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="pd-h1 flex items-center gap-1.5">Adoption
            <Tooltip><TooltipTrigger aria-label="How to read this dashboard" className="text-muted-foreground hover:text-foreground"><Info className="size-4" /></TooltipTrigger>
              <TooltipContent className="max-w-xs">Read login adoption and spend through ProcureDesk together. Login adoption shows how many people use the system; spend and PO compliance show whether purchases actually go through it.</TooltipContent></Tooltip>
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Is everyone who buys, buying inside ProcureDesk?</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div role="tablist" aria-label="Period" className="flex rounded-lg border border-border bg-surface p-0.5">
            {WINDOWS.map((w) => <button key={w.id} role="tab" aria-selected={win === w.id} onClick={() => setWin(w.id)} className={cn("h-7 rounded-md px-2.5 text-[12px] transition-colors", win === w.id ? "bg-subtle font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{w.label}</button>)}
          </div>
          <span className="text-[11px] text-muted-foreground">{WINDOWS.find((w) => w.id === win)!.caption}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-primary" />Monthly rate</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-foreground/50" />Benchmark</span>
        <span>Select a card to see its breakdown</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((m) => <MetricCard key={m.id} m={m} win={win} active={metric === m.id} onSelect={() => setMetric(m.id)}
          extra={m.id === "po" ? <Link to="/app/insights/invoices-without-po" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">{INVOICES_WITHOUT_PO.length} invoices without a PO · {money(missing)}<ArrowRight className="size-3" /></Link> : undefined} />)}
      </div>

      <section className="pd-panel min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
          <h2 className="pd-section-title">{sel.label} breakdown</h2>
          <div role="tablist" aria-label="Breakdown by" className="flex rounded-lg border border-border p-0.5">
            {([["department", "Department"], ["gl", "GL account"]] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={dim === id} onClick={() => setDim(id)} className={cn("h-7 rounded-md px-2.5 text-[12px] transition-colors", dim === id ? "bg-subtle font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead><tr className="text-left text-[12px] text-muted-foreground">
              <th className="px-3.5 py-2 font-medium">{dim === "department" ? "Department" : "GL account"}</th>
              <th className="w-[42%] px-2 py-2 font-medium">Rate vs benchmark {sel.benchmark}%</th>
              <th className="px-2 py-2 text-right font-medium">Gap</th>
              <th className="px-3.5 py-2 text-right font-medium">{metric === "po" ? "Without a PO" : "Sample"}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const v = r.values[metric], t = tier(v, sel.benchmark), gap = v - sel.benchmark, inv = invoicesFor(dim, r.name);
                return <tr key={r.name} className="border-t border-border">
                  <td className="px-3.5 py-2 font-medium">{r.name}</td>
                  <td className="px-2 py-2"><div className="flex items-center gap-2.5"><Bullet value={v} target={sel.benchmark} tone={t} /><span className="num w-9 shrink-0 text-right">{v}%</span></div></td>
                  <td className="px-2 py-2 text-right"><span className={cn("num inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", TONE[t])}>{gap >= 0 ? "On target" : `${gap} pts`}</span></td>
                  <td className="num px-3.5 py-2 text-right">{metric === "po"
                    ? (inv.length ? <Link to="/app/insights/invoices-without-po" search={{ [dim === "department" ? "dept" : "gl"]: r.name }} className="text-primary hover:underline">{inv.length} · {money(inv.reduce((s, i) => s + i.amount, 0))}</Link> : <span className="text-muted-foreground">None</span>)
                    : <span className="text-muted-foreground">{r.n}</span>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">Sorted lowest first, 12-month figures. Bar marker shows the {sel.benchmark}% benchmark.</p>
      </section>
    </div>
  </TooltipProvider>;
}

function MetricCard({ m, win, active, onSelect, extra }: { m: Metric; win: Window; active: boolean; onSelect: () => void; extra?: React.ReactNode }) {
  const { value, delta, sample } = windowValue(m, win);
  const year = windowValue(m, "year").value;
  const t = tier(value, m.benchmark);
  return <div role="button" tabIndex={0} aria-pressed={active} onClick={onSelect} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
    className={cn("pd-panel flex min-w-0 cursor-pointer flex-col p-3 text-left outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/30", active && "border-primary ring-1 ring-primary/30")}>
    <div className="flex items-center gap-1 text-[12px] text-muted-foreground">{m.label}
      <Tooltip><TooltipTrigger asChild><span onClick={(e) => e.stopPropagation()} className="inline-flex"><Info className="size-3" /></span></TooltipTrigger><TooltipContent className="max-w-60">{m.help}</TooltipContent></Tooltip>
    </div>
    <div className="mt-0.5 flex items-baseline gap-2">
      <span className="num text-2xl">{value}%</span>
      {delta !== null && <span className={cn("num rounded px-1 text-[11px] font-medium", delta >= 0 ? "text-success" : "text-destructive")}>{delta > 0 ? "+" : ""}{delta} pts</span>}
    </div>
    <p className="text-[11px] text-muted-foreground">12-mo avg {year}% · benchmark {m.benchmark}% · <span className={cn(t === "ok" ? "text-success" : t === "warn" ? "text-warning" : "text-destructive")}>{value >= m.benchmark ? "on target" : `${m.benchmark - value} pts below`}</span></p>
    <Spark m={m} />
    <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[11px] text-muted-foreground">
      {extra ?? <span>{sample.toLocaleString()} {m.unit} measured</span>}
      {!extra && <span className={cn("flex items-center gap-0.5", active ? "text-primary" : "")}>{active ? "Showing breakdown" : "Breakdown"}<ArrowRight className="size-3" /></span>}
    </div>
  </div>;
}

function Spark({ m }: { m: Metric }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = m.series.map((p) => p.v);
  const lo = Math.min(...vals, m.benchmark) - 4, hi = Math.max(...vals, m.benchmark) + 2;
  const W = 200, H = 44, x = (i: number) => (i / (vals.length - 1)) * W, y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const p = hover ?? vals.length - 1;
  return <div className="relative mt-2" onMouseLeave={() => setHover(null)}
    onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(vals.length - 1, Math.round(((e.clientX - r.left) / r.width) * (vals.length - 1))))); }}>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-11 w-full overflow-visible" role="img" aria-label={`${m.label} last 12 months, from ${vals[0]}% to ${vals[vals.length - 1]}%`}>
      <line x1={0} x2={W} y1={y(m.benchmark)} y2={y(m.benchmark)} className="stroke-foreground/40" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" className="stroke-primary" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <line x1={x(p)} x2={x(p)} y1={0} y2={H} className={cn("stroke-border", hover === null && "opacity-0")} vectorEffect="non-scaling-stroke" />
    </svg>
    <span className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary" style={{ left: `${(x(p) / W) * 100}%`, top: `${(y(vals[p]) / H) * 100}%` }} />
    <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
      {hover === null ? <><span>{MONTHS[0]}</span><span>{MONTHS[MONTHS.length - 1]}</span></>
        : <span className="num w-full text-center text-foreground">{MONTHS[hover]} · {vals[hover]}% · {m.series[hover].n} {m.unit}</span>}
    </div>
  </div>;
}

function Bullet({ value, target, tone }: { value: number; target: number; tone: keyof typeof BAR }) {
  return <div className="relative h-2 flex-1 rounded-full bg-subtle" role="img" aria-label={`${value}% against ${target}% benchmark`}>
    <div className={cn("h-full rounded-full", BAR[tone])} style={{ width: `${value}%` }} />
    <span className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full border border-surface bg-foreground/70" style={{ left: `${target}%` }} />
  </div>;
}
