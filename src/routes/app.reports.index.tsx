import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { TextInput } from "@/components/pd/form";
import { reportIcon } from "@/components/pd/reportUi";
import { money } from "@/lib/pd/engine";
import { breakdown, GROUP_LABEL, REPORTS, type ReportGroup } from "@/lib/pd/reports";
import { useDB } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/reports/")({
  head: () => ({ meta: [
    { title: "Reports · ProcureDesk" },
    { name: "description", content: "Run spend, approval, budget and asset reports from your organisation's data." },
    { property: "og:title", content: "Reports · ProcureDesk" },
    { property: "og:description", content: "One place for procurement, budget and asset reports with filters and CSV export." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ReportsHome,
});

const GROUPS: ("all" | ReportGroup)[] = ["all", "procurement", "budgets", "assets"];

function ReportsHome() {
  const db = useDB();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<"all" | ReportGroup>("all");
  const data = REPORTS.map((r) => ({ r, rows: r.rows(db) }));
  const sum = (id: string, key: string) => data.find((x) => x.r.id === id)?.rows.reduce((t, row) => t + (Number(row[key]) || 0), 0) ?? 0;
  const budget = data.find((x) => x.r.id === "budget-utilization")!.rows;
  const bTotal = budget.reduce((t, r) => t + Number(r.total), 0);
  const kpis = [
    { label: "Submitted spend", value: money(sum("spend-supplier", "amount")), to: "spend-supplier" },
    { label: "Pending approvals", value: String(data.find((x) => x.r.id === "pending-approvals")!.rows.length), to: "pending-approvals" },
    { label: "Budget used", value: bTotal ? `${Math.round((sum("budget-utilization", "used") / bTotal) * 100)}%` : "—", to: "budget-utilization" },
    { label: "Asset book value", value: money(sum("asset-register", "book")), to: "asset-register" },
  ];
  const list = data.filter(({ r }) => (group === "all" || r.group === group) && `${r.name} ${r.desc}`.toLowerCase().includes(q.trim().toLowerCase()));

  return <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
    <header><h1 className="pd-h1">Reports</h1><p className="mt-1 text-[13px] text-muted-foreground">Pick a report to filter, sort and export your organisation's records.</p></header>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((k) => <Link key={k.label} to="/app/reports/$reportId" params={{ reportId: k.to }} className="pd-panel p-3 transition-colors hover:border-primary/40"><p className="text-[12px] text-muted-foreground">{k.label}</p><p className="num mt-0.5 text-xl">{k.value}</p></Link>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
      <div role="tablist" aria-label="Report groups" className="flex gap-1">
        {GROUPS.map((g) => <button key={g} role="tab" aria-selected={group === g} onClick={() => setGroup(g)} className={cn("-mb-px border-b-2 px-3 py-2 text-[13px]", group === g ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{g === "all" ? "All" : GROUP_LABEL[g]}<span className="num ml-1.5 text-[11px] text-muted-foreground">{g === "all" ? REPORTS.length : REPORTS.filter((r) => r.group === g).length}</span></button>)}
      </div>
      <div className="relative mb-1.5 w-full sm:w-64"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><TextInput aria-label="Search reports" placeholder="Search reports…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
    </div>
    {list.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map(({ r, rows }) => { const Icon = reportIcon(r.icon); const top = breakdown(r, rows)[0]; return (
        <Link key={r.id} to="/app/reports/$reportId" params={{ reportId: r.id }} className="group pd-panel flex flex-col p-4 transition-colors hover:border-primary/40">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle text-muted-foreground group-hover:text-primary"><Icon className="size-4" /></span>
            <div className="min-w-0 flex-1"><p className="text-[14px] font-medium">{r.name}</p><p className="mt-0.5 text-[12px] text-muted-foreground">{r.desc}</p></div>
            <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-muted-foreground"><span>{GROUP_LABEL[r.group]} · <span className="num">{rows.length}</span> records</span>{top && <span className="truncate">Top: {top.k}</span>}</div>
        </Link>); })}
    </div> : <p className="py-14 text-center text-sm text-muted-foreground">No reports match “{q}”.</p>}
  </div>;
}
