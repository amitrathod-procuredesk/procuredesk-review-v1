import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Check, Clock3, LayoutList, Plus, Search, Table2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox, Select, TextArea, TextInput } from "@/components/pd/form";
import { AssetThumb, Field, StatusPill, fmtDate } from "@/components/pd/assetUi";
import { cancelMaintenance, daysUntil, holderName, logMaintenance, maintenanceBlock, MAINT_TYPE_LABEL, progressMaintenance, scheduleMaintenance, today, type Asset, type MaintenancePlan } from "@/lib/pd/assetRegister";
import { mutate, useDB, useMe } from "@/lib/pd/store";
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
type Action = "schedule" | "progress" | "complete" | "cancel";
const stageNames = { in_progress: "In progress", waiting_parts: "Waiting for parts", at_vendor: "At vendor" };
const dueDate = (a: Asset) => a.nextMaintenance || a.plan?.due;
const retired = (a: Asset) => ["draft", "disposed", "decommissioned"].includes(a.statusId);

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
      {([{ label: "Overdue", value: overdue.length, icon: Clock3, t: "scheduled", f: "overdue", tone: "text-destructive" }, { label: "Due in 7 days", value: soon.length, icon: CalendarDays, t: "scheduled", f: "soon", tone: "text-warning" }, { label: "In progress", value: active.length, icon: Wrench, t: "active", f: "all", tone: "text-transit" }, { label: "Open repairs", value: repairs.length, icon: Wrench, t: "repairs", f: "all", tone: "text-muted-foreground" }] as const).map((k) => <Button key={k.label} variant="ghost" className="pd-panel h-auto justify-start p-3 text-left" onClick={() => select(k.t, k.f)}><k.icon className={k.tone} /><span><span className="block text-[12px] font-normal text-muted-foreground">{k.label}</span><span className={cn("num text-xl", k.value > 0 && k.tone)}>{k.value}</span></span></Button>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
      <div role="tablist" aria-label="Maintenance views" className="flex flex-wrap gap-1">{([{ id: "scheduled", label: "Scheduled", n: planned.length }, { id: "active", label: "In progress", n: active.length }, { id: "repairs", label: "Repairs", n: repairs.length }, { id: "history", label: "History", n: all.reduce((n, a) => n + a.maintenanceLog.length, 0) }] as const).map((t) => <Button key={t.id} role="tab" aria-selected={tab === t.id} variant="ghost" size="sm" onClick={() => select(t.id)} className={cn("rounded-none border-b-2 border-transparent", tab === t.id && "border-primary text-primary")}>{t.label}<span className="num text-[11px] text-muted-foreground">{t.n}</span></Button>)}</div>
      {tab !== "history" && <div className="flex gap-0.5 pb-1" role="group" aria-label="Layout">{([ ["cards", LayoutList, "Card view"], ["table", Table2, "Table view"] ] as const).map(([v, Icon, label]) => <Button key={v} variant={layout === v ? "secondary" : "ghost"} size="icon" className="size-7" aria-label={label} title={label} aria-pressed={layout === v} onClick={() => setLayout(v)}><Icon /></Button>)}</div>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><TextInput aria-label="Search maintenance" placeholder="Search assets or maintenance…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
      <Select aria-label="Category" className="w-auto max-w-full" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{db.assets?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      {tab === "scheduled" && <Select aria-label="Due date filter" className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All dates</option><option value="overdue">Overdue</option><option value="soon">Due in 7 days</option></Select>}
      {tab !== "repairs" && <Checkbox checked={mine} onChange={(e) => setMine(e.target.checked)} label="Assigned to me" className="text-[12px]" />}
    </div>
    {tab === "history" ? <div className="overflow-x-auto pd-scroll-quiet"><table className="pd-table min-w-[650px]"><thead><tr><th>Asset</th><th>Work completed</th><th>Completed</th><th>Recorded by</th><th className="text-right">Actual cost</th></tr></thead><tbody>{logs.map(({ a, log }) => <tr key={log.id}><td>{assetName(a)}</td><td><p className="text-[13px] font-medium">{log.name || "Maintenance"}</p><p className="max-w-xs whitespace-normal text-[12px] text-muted-foreground">{log.note}</p></td><td>{fmtDate(log.at)}</td><td>{db.users.find((u) => u.id === log.by)?.name || "System"}</td><td className="num text-right">{money(log.cost)}</td></tr>)}</tbody></table>{!logs.length && <Empty title="No completed work" />}</div>
    : !items.length ? <Empty title={q || category || mine || filter !== "all" ? "No matching maintenance" : tab === "repairs" ? "No open repairs" : tab === "active" ? "No service in progress" : "No scheduled maintenance"} action={tab === "scheduled" ? () => setModal({ action: "schedule" }) : undefined} />
    : layout === "table" ? <div className="overflow-x-auto pd-scroll-quiet"><table className="pd-table min-w-[850px]"><thead><tr><th>Asset / location</th><th>{tab === "repairs" ? "Repair" : "Maintenance"}</th><th>Due / status</th><th>Assigned to</th><th className="text-right">Actions</th></tr></thead><tbody>{items.map((a) => <tr key={a.id}><td className="max-w-64 py-3">{assetName(a)}<p className="mt-1 pl-11 text-[11px] text-muted-foreground">{a.site}</p></td><td><p className="max-w-52 whitespace-normal text-[13px] font-medium">{tab === "repairs" ? a.repair?.issue : a.plan?.name || "Scheduled service"}</p><p className="text-[11px] text-muted-foreground">{tab === "repairs" ? a.repair?.stage.replaceAll("_", " ") : a.plan ? MAINT_TYPE_LABEL[a.plan.type] : a.maintenanceEveryMonths ? `Every ${a.maintenanceEveryMonths} months` : "One-time"}</p></td><td><p className="mb-1 whitespace-nowrap text-[12px]">{fmtDate(tab === "repairs" ? a.repair?.eta : dueDate(a)) || "No date"}</p>{tab === "repairs" ? <StatusPill s={db.assets?.statuses.find((s) => s.id === a.statusId)} /> : status(a)}</td><td className="text-[12px]">{db.users.find((u) => u.id === a.plan?.assigneeId)?.name || "Unassigned"}{maintenanceBlock(a) && tab !== "repairs" && <p className="mt-1 max-w-44 whitespace-normal text-[11px] text-warning">{maintenanceBlock(a)}</p>}</td><td>{actions(a)}</td></tr>)}</tbody></table></div>
    : <div className="grid gap-3 md:grid-cols-2">{items.map((a) => <article key={a.id} className="rounded-lg border border-border bg-surface p-4"><div className="flex items-start justify-between gap-2">{assetName(a)}{tab !== "repairs" && status(a)}</div><p className="mt-3 text-[13px] font-medium">{tab === "repairs" ? a.repair?.issue : a.plan?.name || "Scheduled service"}</p><p className="mt-1 text-[12px] text-muted-foreground">{a.site} · {fmtDate(dueDate(a)) || "No date"}</p><p className="mt-1 text-[12px] text-muted-foreground">Assigned to: {db.users.find((u) => u.id === a.plan?.assigneeId)?.name || "Unassigned"}</p>{maintenanceBlock(a) && tab !== "repairs" && <p className="mt-2 text-[12px] text-warning">{maintenanceBlock(a)}</p>}<div className="mt-3">{actions(a)}</div></article>)}</div>}
    {modal && <ServiceDialog key={`${modal.action}-${modal.id || "new"}`} action={modal.action} initialId={modal.id} onClose={() => setModal(undefined)} onCancel={() => setModal({ action: "cancel", id: modal.id })} />}
  </div>;
}

function Empty({ title, action }: { title: string; action?: () => void }) {
  return <div className="py-14 text-center"><CalendarDays className="mx-auto mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">{title}</p>{action && <Button variant="outline" size="sm" className="mt-3" onClick={action}><Plus />Schedule maintenance</Button>}</div>;
}

function ServiceDialog({ action, initialId, onClose, onCancel }: { action: Action; initialId?: string; onClose: () => void; onCancel: () => void }) {
  const db = useDB(); const me = useMe();
  const [id, setId] = useState(initialId ?? "");
  const asset = db.assetItems?.find((a) => a.id === id);
  const [plan, setPlan] = useState<MaintenancePlan>(() => asset?.plan ? { ...asset.plan, due: dueDate(asset) || today() } : { name: "", type: "preventive", instructions: "", due: asset ? dueDate(asset) || today() : today(), cost: 0, repeats: !!asset?.maintenanceEveryMonths });
  const [months, setMonths] = useState(asset?.maintenanceEveryMonths ?? 12);
  const [stage, setStage] = useState<"in_progress" | "waiting_parts" | "at_vendor">(asset?.service?.stage ?? "in_progress");
  const [note, setNote] = useState(""); const [cost, setCost] = useState("0"); const [date, setDate] = useState(today()); const [error, setError] = useState("");
  const title = action === "schedule" ? initialId ? "Edit maintenance schedule" : "Schedule maintenance" : action === "complete" ? "Complete maintenance" : action === "cancel" ? "Cancel maintenance" : asset?.service ? "Update service" : "Start service";
  const up = (p: Partial<MaintenancePlan>) => setPlan((v) => ({ ...v, ...p }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!id) return setError("Choose an asset.");
    try {
      mutate((d) => {
        if (action === "schedule") scheduleMaintenance(d, id, plan, plan.repeats ? months : undefined, me?.id);
        if (action === "progress") progressMaintenance(d, id, stage, note, me?.id);
        if (action === "complete") logMaintenance(d, id, note, cost.trim() ? Number(cost) : NaN, me?.id, date);
        if (action === "cancel") cancelMaintenance(d, id, note, me?.id);
      });
      toast.success(action === "complete" ? "Maintenance completed" : action === "cancel" ? "Maintenance cancelled" : action === "schedule" ? "Maintenance scheduled" : "Service updated"); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save maintenance."); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto bg-surface"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{asset ? `${asset.name} · ${asset.tag}` : "Choose an asset and its service details."}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      {action === "schedule" ? <>
        {!initialId && <Field label="Asset" htmlFor="mt-asset" required><Select id="mt-asset" value={id} onChange={(e) => { setId(e.target.value); const a = db.assetItems?.find((x) => x.id === e.target.value); setPlan(a?.plan ? { ...a.plan, due: dueDate(a) || today() } : { name: "", type: "preventive", instructions: "", due: a ? dueDate(a) || today() : today(), cost: 0, repeats: !!a?.maintenanceEveryMonths }); setMonths(a?.maintenanceEveryMonths ?? 12); }}><option value="">Choose an asset…</option>{db.assetItems?.filter((a) => !retired(a) && !a.service).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.tag}{dueDate(a) ? " · Existing schedule" : ""}</option>)}</Select></Field>}
        {asset?.plan && !initialId && <p className="text-[12px] text-warning">Saving updates this asset’s existing maintenance plan.</p>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Maintenance name" htmlFor="mt-name" required><TextInput id="mt-name" value={plan.name} onChange={(e) => up({ name: e.target.value })} /></Field><Field label="Maintenance type" htmlFor="mt-type"><Select id="mt-type" value={plan.type} onChange={(e) => up({ type: e.target.value as MaintenancePlan["type"] })}>{Object.entries(MAINT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field></div>
        <Field label="Description / instructions" htmlFor="mt-instructions"><TextArea id="mt-instructions" rows={2} value={plan.instructions} onChange={(e) => up({ instructions: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Due date" htmlFor="mt-due" required><TextInput id="mt-due" type="date" value={plan.due || ""} onChange={(e) => up({ due: e.target.value })} /></Field><Field label="Assigned to" htmlFor="mt-assignee"><Select id="mt-assignee" value={plan.assigneeId || ""} onChange={(e) => up({ assigneeId: e.target.value || undefined })}><option value="">Unassigned</option>{db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field><Field label="Vendor" htmlFor="mt-vendor"><Select id="mt-vendor" value={plan.vendorId || ""} onChange={(e) => up({ vendorId: e.target.value || undefined })}><option value="">No vendor</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field><Field label="Estimated cost ($)" htmlFor="mt-cost"><TextInput id="mt-cost" type="number" min={0} step="0.01" value={plan.cost} onChange={(e) => up({ cost: Number(e.target.value) })} /></Field></div>
        <Checkbox label="This service repeats on a schedule" checked={plan.repeats} onChange={(e) => up({ repeats: e.target.checked })} />
        {plan.repeats && <Field label="Repeat every (months)" htmlFor="mt-months" hint="The next date is calculated from when the service is completed."><TextInput id="mt-months" type="number" min={1} max={120} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></Field>}
        {asset?.checkout && <p className="text-[12px] text-warning">Currently with {holderName(asset.checkout.to, db)}. You can schedule now; check it in before starting service.</p>}
      </> : action === "progress" ? <>
        {asset?.plan?.instructions && <p className="rounded-md bg-subtle p-3 text-[13px]">{asset.plan.instructions}</p>}
        <Field label="Service stage" htmlFor="mt-stage"><Select id="mt-stage" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>{Object.entries(stageNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label={stage === "in_progress" ? "Note (optional)" : "Delay / handover note"} htmlFor="mt-note" required={stage !== "in_progress"}><TextArea id="mt-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="text-[12px] text-muted-foreground">Service progress does not change the asset’s assignment or lifecycle status.</p>
      </> : action === "complete" ? <>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Completed on" htmlFor="mt-date" required><TextInput id="mt-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Actual cost ($)" htmlFor="mt-actual" required><TextInput id="mt-actual" type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field></div>
        <Field label="Work completed / findings" htmlFor="mt-work" required><TextArea id="mt-work" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="text-[12px] text-muted-foreground">{asset?.maintenanceEveryMonths ? `Next service will be due ${asset.maintenanceEveryMonths} months after completion.` : "This is a one-time service. Completion clears the due date."}</p>
        <p className="text-[12px] text-muted-foreground">If further repair is needed, open a repair from the asset record.</p>
      </> : <Field label="Cancellation reason" htmlFor="mt-cancel" required hint="Removes this schedule and any recurring service. Completed history is kept."><TextArea id="mt-cancel" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
      {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        {initialId && (action === "schedule" || action === "progress") && <Button type="button" variant="ghost" size="sm" className="mr-auto text-destructive" onClick={onCancel}>Cancel schedule</Button>}
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Close</Button><Button type="submit" size="sm" variant={action === "cancel" ? "destructive" : "default"}>{action === "schedule" ? "Save schedule" : action === "complete" ? "Complete maintenance" : action === "cancel" ? "Cancel schedule" : "Save service"}</Button>
      </div>
    </form>
  </DialogContent></Dialog>;
}