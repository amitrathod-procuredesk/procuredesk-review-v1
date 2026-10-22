import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Check, Clock3, LayoutGrid as Table2, List as LayoutList, Plus, Search, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Select, TextInput } from "@/components/pd/form";
import { dueDate, retired, ServiceDialog, stageNames, type MaintAction } from "@/components/pd/MaintenanceDialog";
import { AssetThumb, Field, StatusPill, fmtDate } from "@/components/pd/assetUi";
import { daysUntil, maintenanceBlock, MAINT_TYPE_LABEL, today, type Asset } from "@/lib/pd/assetRegister";
import { useDB, useMe } from "@/lib/pd/store";
import { money } from "@/lib/pd/engine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/assets/maintenance")({
  head: () => ({ meta: [
    { title: "Asset maintenance · ProcureDesk" },
    { name: "description", content: "Schedule asset servicing, track work and record maintenance costs and history." },
    { property: "og:title", content: "Asset maintenance · ProcureDesk" },
    { property: "og:description", content: "Manage scheduled maintenance, overdue servicing and completed work across company assets." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: MaintenancePage,
});

type Tab = "scheduled" | "active" | "repairs" | "history";
type Action = MaintAction;

function MaintenancePage() {
  const db = useDB();
  const all = db.assetItems ?? [];
  const [tab, setTab] = useState<Tab>("scheduled");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [mine, setMine] = useState(false);
  const [layout, setLayout] = useState<"cards" | "table">("table");
  const [modal, setModal] = useState<{ action: Action; id?: string }>();
  const me = useMe();
  const planned = all.filter((a) => !retired(a) && dueDate(a) && !a.service);
  const active = all.filter((a) => !retired(a) && a.service);
  const repairs = all.filter((a) => a.repair);
  const overdue = planned.filter((a) => (dueDate(a) ?? "") < today());
  const soon = planned.filter((a) => (dueDate(a) ?? "") >= today() && daysUntil(dueDate(a)) <= 7);
  const match = (a: Asset) => (!category || a.categoryId === category) && (!mine || a.plan?.assigneeId === me?.id) && [a.name, a.tag, a.identifier, a.site, a.plan?.name, a.repair?.issue].some((x) => x?.toLowerCase().includes(q.trim().toLowerCase()));
  const source = tab === "active" ? active : tab === "repairs" ? repairs : planned;
  const items = source.filter(match).filter((a) => tab !== "scheduled" || filter === "all" || (filter === "overdue" ? (dueDate(a) ?? "") < today() : (dueDate(a) ?? "") >= today() && daysUntil(dueDate(a)) <= 7)).sort((a, b) => (dueDate(a) ?? "9999").localeCompare(dueDate(b) ?? "9999"));
  const logs = all.flatMap((a) => a.maintenanceLog.map((log) => ({ a, log }))).filter(({ a, log }) => (!category || a.categoryId === category) && (!mine || log.assigneeId === me?.id || log.by === me?.id) && [a.name, a.tag, log.note, log.name].some((x) => x?.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => b.log.at.localeCompare(a.log.at));
  const select = (t: Tab, f = "all") => { setTab(t); setFilter(f); };
  const actions = (a: Asset) => tab === "repairs" ? <Button asChild variant="outline" size="sm"><Link to="/app/assets/$assetId" params={{ assetId: a.id }}>Manage repair</Link></Button> : <div className="flex flex-wrap justify-end gap-1">
    <Button size="sm" variant="outline" onClick={() => setModal({ action: a.service ? "progress" : "schedule", id: a.id })}>{a.service ? "Update" : "Edit"}</Button>
    <Button size="sm" variant="outline" disabled={!!maintenanceBlock(a)} title={maintenanceBlock(a)} onClick={() => setModal({ action: a.service ? "complete" : "progress", id: a.id })}>{a.service ? <><Check />Complete</> : "Start service"}</Button>
  </div>;
  const status = (a: Asset) => <span className={cn("inline-flex rounded px-2 py-1 text-[11px] font-medium", a.service ? "bg-transit-soft text-transit" : (dueDate(a) ?? "") < today() ? "bg-danger-soft text-destructive" : "bg-subtle text-muted-foreground")}>{a.service ? stageNames[a.service.stage] : (dueDate(a) ?? "") < today() ? "Overdue" : (dueDate(a) ?? "") === today() ? "Due today" : "Scheduled"}</span>;
  const assetName = (a: Asset) => <div className="flex min-w-0 items-center gap-2.5"><AssetThumb a={a} /><div className="min-w-0"><Link to="/app/assets/$assetId" params={{ assetId: a.id }} className="block truncate text-[13px] font-medium hover:text-primary">{a.name}</Link><p className="num text-[11px] text-muted-foreground">{a.tag}</p></div></div>;

  return <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
    <nav className="text-[12px] text-muted-foreground"><Link to="/app/assets/register" className="hover:text-foreground">Assets</Link> / Maintenance</nav>
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="pd-h1">Maintenance</h1><Button size="sm" onClick={() => setModal({ action: "schedule" })}><Plus />Schedule maintenance</Button></header>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {([{ label: "Overdue", value: overdue.length, icon: Clock3, t: "scheduled", f: "overdue", tone: "text-destructive" }, { label: "Due in 7 days", value: soon.length, icon: CalendarDays, t: "scheduled", f: "soon", tone: "text-warning" }, { label: "In progress", value: active.length, icon: Wrench, t: "active", f: "all", tone: "text-transit" }, { label: "Open repairs", value: repairs.length, icon: Wrench, t: "repairs", f: "all", tone: "text-muted-foreground" }] as const).map((k) => <Button key={k.label} variant="ghost" className="pd-panel h-auto justify-start p-3 text-left" onClick={() => select(k.t, k.f)}><k.icon className={k.tone} /><span><span className="block text-[12px] font-normal text-muted-foreground">{k.label}</span><span className={cn("num text-xl break-words [overflow-wrap:anywhere]", k.value > 0 && k.tone)}>{k.value}</span></span></Button>)}
    </div>
    <section className="pd-panel overflow-hidden">
      <div className="pd-scroll-hide flex gap-1 overflow-x-auto border-b border-border px-3 pt-2" role="tablist" aria-label="Maintenance views">{([{ id: "scheduled", label: "Scheduled", n: planned.length }, { id: "active", label: "In progress", n: active.length }, { id: "repairs", label: "Repairs", n: repairs.length }, { id: "history", label: "History", n: all.reduce((n, a) => n + a.maintenanceLog.length, 0) }] as const).map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => select(t.id)} className={cn("-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] transition-colors", tab === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}<span className={cn("num text-[11px]", tab === t.id ? "text-primary" : "text-muted-foreground")}>{t.n}</span></button>)}</div>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] max-w-md flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><TextInput aria-label="Search maintenance" placeholder="Search assets or maintenance…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tab !== "repairs" && <Checkbox checked={mine} onChange={(e) => setMine(e.target.checked)} label="Assigned to me" className="text-[12px]" />}
          <Select aria-label="Category" className="w-auto max-w-full" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{db.assets?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          {tab === "scheduled" && <Select aria-label="Due date filter" className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All dates</option><option value="overdue">Overdue</option><option value="soon">Due in 7 days</option></Select>}
          {tab !== "history" && <div role="radiogroup" aria-label="Layout" className="inline-flex rounded-md bg-subtle p-0.5 text-[12px]">{([["table", "List", LayoutList], ["cards", "Cards", Table2]] as const).map(([v, label, Icon]) => <button key={v} role="radio" aria-checked={layout === v} onClick={() => setLayout(v)} className={cn("inline-flex h-7 items-center gap-1 rounded px-2.5", layout === v ? "bg-surface font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}><Icon className="size-3.5" />{label}</button>)}</div>}
        </div>
      </div>
    {tab === "history" ? <div className="overflow-x-auto border-t border-border pd-scroll-quiet"><table className="pd-table min-w-[650px]"><thead><tr><th>Asset</th><th>Work completed</th><th>Completed</th><th>Recorded by</th><th className="text-right">Actual cost</th></tr></thead><tbody>{logs.map(({ a, log }) => <tr key={log.id}><td>{assetName(a)}</td><td><p className="text-[13px] font-medium">{log.name || "Maintenance"}</p><p className="max-w-xs whitespace-normal text-[12px] text-muted-foreground">{log.note}</p></td><td>{fmtDate(log.at)}</td><td>{db.users.find((u) => u.id === log.by)?.name || "System"}</td><td className="num text-right">{money(log.cost)}</td></tr>)}</tbody></table>{!logs.length && <div className="py-14 text-center text-sm font-medium">No completed work</div>}</div>
    : !items.length ? <Empty title={q || category || mine || filter !== "all" ? "No matching maintenance" : tab === "repairs" ? "No open repairs" : tab === "active" ? "No service in progress" : "No scheduled maintenance"} action={tab === "scheduled" ? () => setModal({ action: "schedule" }) : undefined} />
    : layout === "table" ? <div className="overflow-x-auto border-t border-border pd-scroll-quiet"><table className="pd-table min-w-[850px]"><thead><tr><th>Asset / location</th><th>{tab === "repairs" ? "Repair" : "Maintenance"}</th><th>Due / status</th><th>Assigned to</th><th className="text-right">Actions</th></tr></thead><tbody>{items.map((a) => <tr key={a.id}><td className="max-w-64 py-3">{assetName(a)}<p className="mt-1 pl-11 text-[11px] text-muted-foreground">{a.site}</p></td><td>{tab === "repairs" ? <p className="max-w-52 whitespace-normal text-[13px] font-medium">{a.repair?.issue}</p> : <Link to="/app/assets/maintenance/$assetId" params={{ assetId: a.id }} className="block max-w-52 whitespace-normal text-[13px] font-medium hover:text-primary">{a.plan?.name || "Scheduled service"}</Link>}<p className="text-[11px] text-muted-foreground">{tab === "repairs" ? a.repair?.stage.replaceAll("_", " ") : a.plan ? MAINT_TYPE_LABEL[a.plan.type] : a.maintenanceEveryMonths ? `Every ${a.maintenanceEveryMonths} months` : "One-time"}</p></td><td><p className="mb-1 whitespace-nowrap text-[12px]">{fmtDate(tab === "repairs" ? a.repair?.eta : dueDate(a)) || "No date"}</p>{tab === "repairs" ? <StatusPill s={db.assets?.statuses.find((s) => s.id === a.statusId)} /> : status(a)}</td><td className="text-[12px]">{db.users.find((u) => u.id === a.plan?.assigneeId)?.name || "Unassigned"}{maintenanceBlock(a) && tab !== "repairs" && <p className="mt-1 max-w-44 whitespace-normal text-[11px] text-warning">{maintenanceBlock(a)}</p>}</td><td>{actions(a)}</td></tr>)}</tbody></table></div>
    : <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">{items.map((a) => <article key={a.id} className="rounded-lg border border-border bg-surface p-4"><div className="flex items-start justify-between gap-2">{assetName(a)}{tab !== "repairs" && status(a)}</div>{tab === "repairs" ? <p className="mt-3 text-[13px] font-medium">{a.repair?.issue}</p> : <Link to="/app/assets/maintenance/$assetId" params={{ assetId: a.id }} className="mt-3 block text-[13px] font-medium hover:text-primary">{a.plan?.name || "Scheduled service"}</Link>}<p className="mt-1 text-[12px] text-muted-foreground">{a.site} · {fmtDate(dueDate(a)) || "No date"}</p><p className="mt-1 text-[12px] text-muted-foreground">Assigned to: {db.users.find((u) => u.id === a.plan?.assigneeId)?.name || "Unassigned"}</p>{maintenanceBlock(a) && tab !== "repairs" && <p className="mt-2 text-[12px] text-warning">{maintenanceBlock(a)}</p>}<div className="mt-3">{actions(a)}</div></article>)}</div>}
    </section>
    {modal && <ServiceDialog key={`${modal.action}-${modal.id || "new"}`} action={modal.action} initialId={modal.id} onClose={() => setModal(undefined)} onCancel={() => setModal({ action: "cancel", id: modal.id })} />}
  </div>;
}

function Empty({ title, action }: { title: string; action?: () => void }) {
  return <div className="border-t border-border py-14 text-center"><CalendarDays className="mx-auto mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">{title}</p>{action && <Button variant="outline" size="sm" className="mt-3" onClick={action}><Plus />Schedule maintenance</Button>}</div>;
}

