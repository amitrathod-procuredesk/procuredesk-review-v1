import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Info, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { money, totals } from "@/lib/pd/engine";
import { useDB } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/insights/adoption")({
  head: () => ({ meta: [
    { title: "Adoption · ProcureDesk" },
    { name: "description", content: "See who buys through ProcureDesk, by department, and nudge teams that have not adopted yet." },
    { property: "og:title", content: "Adoption dashboard · ProcureDesk" },
    { property: "og:description", content: "Track user adoption, department coverage and spend captured through ProcureDesk." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Adoption,
});

const TARGET = 80;
const PERIODS = [{ id: "30", label: "30 days" }, { id: "90", label: "90 days" }, { id: "365", label: "12 months" }, { id: "all", label: "All time" }] as const;
type Period = (typeof PERIODS)[number]["id"];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Adoption() {
  const db = useDB();
  const [period, setPeriod] = useState<Period>("all");
  const [dept, setDept] = useState<string | null>(null);

  const m = useMemo(() => {
    const since = period === "all" ? 0 : Date.now() - Number(period) * 864e5;
    const reqs = db.requests.filter((r) => new Date(r.createdAt).getTime() >= since);
    const submitted = reqs.filter((r) => r.status !== "draft");
    const users = db.users.filter((u) => u.active);
    const buyers = new Set(reqs.map((r) => r.requesterId));
    const deptOf = (r: (typeof reqs)[number]) => r.departmentId ?? db.users.find((u) => u.id === r.requesterId)?.departmentId;
    const rows = db.departments.map((d) => {
      const du = users.filter((u) => u.departmentId === d.id);
      const active = du.filter((u) => buyers.has(u.id));
      const spend = submitted.filter((r) => deptOf(r) === d.id).reduce((t, r) => t + totals(r).total, 0);
      return { d, users: du, active, rate: pct(active.length, du.length), spend };
    }).filter((x) => x.users.length).sort((a, b) => a.rate - b.rate);
    const withNeed = submitted.filter((r) => r.requiredBy && r.submittedAt);
    const ahead = withNeed.filter((r) => new Date(r.submittedAt!) <= new Date(r.requiredBy!));
    return {
      rows,
      kpis: [
        { id: "users", label: "Active users", value: `${pct(buyers.size, users.length)}%`, sub: `${[...buyers].filter((id) => users.some((u) => u.id === id)).length} of ${users.length} people raised a request`, rate: pct(buyers.size, users.length) },
        { id: "depts", label: "Department coverage", value: `${pct(rows.filter((r) => r.active.length).length, rows.length)}%`, sub: `${rows.filter((r) => r.active.length).length} of ${rows.length} departments buying here`, rate: pct(rows.filter((r) => r.active.length).length, rows.length) },
        { id: "ahead", label: "Requested ahead of need", value: withNeed.length ? `${pct(ahead.length, withNeed.length)}%` : "—", sub: `${ahead.length} of ${withNeed.length} submitted before required date`, rate: pct(ahead.length, withNeed.length) },
        { id: "spend", label: "Spend through ProcureDesk", value: money(submitted.reduce((t, r) => t + totals(r).total, 0)), sub: `${submitted.length} submitted requests`, rate: null as number | null },
      ],
    };
  }, [db, period]);

  const focus = m.rows.find((r) => r.d.id === dept);
  const notAdopted = (focus ? [focus] : m.rows).flatMap((r) => r.users.filter((u) => !r.active.includes(u)).map((u) => ({ u, d: r.d })));

  return <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="pd-h1 flex items-center gap-1.5">Adoption
          <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger aria-label="How this is measured" className="text-muted-foreground hover:text-foreground"><Info className="size-4" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">Measured from requests raised in ProcureDesk. A person is active when they raised at least one request in the period. Target is {TARGET}%.</TooltipContent></Tooltip></TooltipProvider>
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Is everyone who buys, buying inside ProcureDesk?</p>
      </div>
      <div role="tablist" aria-label="Period" className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-0.5 pd-scroll-hide">
        {PERIODS.map((p) => <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)} className={cn("h-7 shrink-0 rounded-md px-2.5 text-[12px] transition-colors", period === p.id ? "bg-subtle font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{p.label}</button>)}
      </div>
    </header>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {m.kpis.map((k) => <div key={k.id} className="pd-panel p-3">
        <p className="text-[12px] text-muted-foreground">{k.label}</p>
        <p className="num mt-0.5 text-xl break-words [overflow-wrap:anywhere]">{k.value}</p>
        {k.rate !== null && <Bar rate={k.rate} />}
        <p className="mt-1.5 text-[11px] text-muted-foreground">{k.sub}</p>
      </div>)}
    </div>

    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="pd-panel min-w-0">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <h2 className="pd-section-title">By department</h2>
          <span className="text-[11px] text-muted-foreground">Lowest adoption first · target {TARGET}%</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="px-3.5 py-2 font-medium">Department</th><th className="px-2 py-2 font-medium">Active</th><th className="w-[38%] px-2 py-2 font-medium">Adoption</th><th className="px-3.5 py-2 text-right font-medium">Spend</th></tr></thead>
            <tbody>
              {m.rows.map((r) => {
                const gap = r.rate - TARGET;
                return <tr key={r.d.id} onClick={() => setDept(dept === r.d.id ? null : r.d.id)} aria-selected={dept === r.d.id} className={cn("cursor-pointer border-t border-border transition-colors hover:bg-subtle", dept === r.d.id && "bg-primary/5")}>
                  <td className="px-3.5 py-2"><span className="font-medium">{r.d.name}</span><span className="block text-[11px] text-muted-foreground">{r.d.businessUnit}</span></td>
                  <td className="num px-2 py-2">{r.active.length}/{r.users.length}</td>
                  <td className="px-2 py-2"><div className="flex items-center gap-2"><div className="flex-1"><Bar rate={r.rate} /></div><span className={cn("num w-14 shrink-0 rounded px-1 text-right text-[11px]", gap >= 0 ? "text-success" : gap >= -20 ? "text-warning" : "text-destructive")}>{gap >= 0 ? "On target" : `${gap} pts`}</span></div></td>
                  <td className="num px-3.5 py-2 text-right">{money(r.spend)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pd-panel min-w-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
          <h2 className="pd-section-title truncate">Not yet buying here{focus ? ` · ${focus.d.name}` : ""}</h2>
          {focus && <button onClick={() => setDept(null)} className="shrink-0 text-[12px] text-primary hover:underline">Show all</button>}
        </div>
        {notAdopted.length ? <>
          <ul className="max-h-[360px] divide-y divide-border overflow-y-auto">
            {notAdopted.map(({ u, d }) => <li key={u.id} className="flex items-center gap-2 px-3.5 py-2">
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{u.name}</p><p className="truncate text-[11px] text-muted-foreground">{u.title} · {d.name}</p></div>
              <Button size="sm" variant="ghost" onClick={() => toast.success(`Reminder sent to ${u.name}`)}><Send /> Nudge</Button>
            </li>)}
          </ul>
          <div className="border-t border-border p-2.5"><Button size="sm" variant="outline" className="w-full" onClick={() => toast.success(`Reminder sent to ${notAdopted.length} people`)}>Nudge all {notAdopted.length}</Button></div>
        </> : <p className="px-3.5 py-10 text-center text-[13px] text-muted-foreground">Everyone here has raised a request.</p>}
      </section>
    </div>
  </div>;
}

function Bar({ rate }: { rate: number }) {
  return <div className="relative mt-2 h-1.5 rounded-full bg-subtle" role="img" aria-label={`${rate}% of target ${TARGET}%`}>
    <div className={cn("h-full rounded-full", rate >= TARGET ? "bg-primary" : rate >= TARGET - 20 ? "bg-warning" : "bg-destructive")} style={{ width: `${Math.min(rate, 100)}%` }} />
    <span className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-foreground/50" style={{ left: `${TARGET}%` }} />
  </div>;
}
