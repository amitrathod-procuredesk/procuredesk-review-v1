import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AlertTriangle, ArrowRightLeft, Check, ChevronRight, CircleDot, Copy, FileText, LogIn, LogOut, MoreHorizontal, Package, Pencil, Plus, Trash2, UserPlus, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AssetThumb, BTN, BTN_GHOST, BTN_PRIMARY, Card, Field, HolderPick, HolderToggle, Meta, StatusPill, fmtDate, fmtDateTime, relDays } from "@/components/pd/assetUi";
import { UserAvatar } from "@/components/pd/bits";
import { Select, TextArea, TextInput } from "@/components/pd/form";
import { IDENTIFIER_LABEL, METHOD_LABEL, PHASE_LABEL, type StatusPhase } from "@/lib/pd/assets";
import {
  activationIssues, addDays, assign, bookValue, canMove, checkIn, checkOut, completeRepair, CONDITION_LABEL, daysUntil, depRuleFor, DISPOSAL_METHODS, dispose, DOC_KIND, holderName, logMaintenance, moveRepair, openRepair,
  PRIORITY_LABEL, REPAIR_STAGES, repairCost, setStatus, SITES, today, updateAsset, type Asset, type Condition, type Holder, type Priority, type RepairStage,
} from "@/lib/pd/assetRegister";
import { money } from "@/lib/pd/engine";
import { mutate, useDB, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/assets/$assetId")({
  head: () => ({
    meta: [
      { title: "Asset details · ProcureDesk" },
      { name: "description", content: "Status, location, value, repairs and full history of a company asset." },
      { property: "og:title", content: "Asset details · ProcureDesk" },
      { property: "og:description", content: "Track where an asset is, who has it and every change in its life." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetPage,
  notFoundComponent: () => <div className="p-8 text-sm">This asset doesn't exist. <Link to="/app/assets/register" className="text-primary hover:underline">Back to register</Link></div>,
});

type Action = "activate" | "assign" | "unassign" | "checkout" | "checkin" | "repair" | "stage" | "complete" | "maintenance" | "status" | "decommission" | "dispose" | "edit" | "part";
const PHASES: StatusPhase[] = ["setup", "active", "service", "retired"];
const TABS = [{ id: "overview", label: "Overview" }, { id: "repairs", label: "Repairs" }, { id: "maintenance", label: "Maintenance" }, { id: "files", label: "Files" }, { id: "history", label: "History" }] as const;

function AssetPage() {
  const { assetId } = Route.useParams();
  const db = useDB();
  const me = useMe();
  const s = db.assets!;
  const a = db.assetItems?.find((x) => x.id === assetId);
  const [action, setAction] = useState<Action | null>(null);
  const [stageTo, setStageTo] = useState<RepairStage>("diagnosing");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  if (!a) {
    if (db.assetItems) throw notFound();
    return null;
  }
  const st = s.statuses.find((x) => x.id === a.statusId);
  const cat = s.categories.find((c) => c.id === a.categoryId);
  const book = bookValue(a, s);
  const rule = depRuleFor(a, s);
  const can = (to: string) => canMove(a, to, s);
  const run = (fn: (d: typeof db) => void, msg: string, desc?: string) => { mutate(fn); setAction(null); toast.success(msg, { description: desc }); };
  const overdue = a.checkout && daysUntil(a.checkout.due) < 0;
  const vendorName = (id?: string) => db.vendors.find((v) => v.id === id)?.name;
  const userName = (id?: string) => db.users.find((u) => u.id === id)?.name ?? "System";

  const primary: { label: string; icon: typeof Check; act: Action; tone?: "primary" }[] = [];
  if (a.statusId === "draft") primary.push({ label: "Activate", icon: Check, act: "activate", tone: "primary" });
  if (a.statusId === "available") {
    if (can("checked_out") && cat?.checkoutAllowed) primary.push({ label: "Check out", icon: LogOut, act: "checkout", tone: "primary" });
    if (can("in_use")) primary.push({ label: "Assign", icon: UserPlus, act: "assign" });
  }
  if (a.statusId === "in_use" && can("available")) primary.push({ label: "Unassign", icon: ArrowRightLeft, act: "unassign" });
  if (a.statusId === "checked_out") primary.push({ label: "Check in", icon: LogIn, act: "checkin", tone: "primary" });
  if (!a.repair && (can("in_repair") || a.statusId === "checked_out") && st?.phase === "active") primary.push({ label: "Report issue", icon: Wrench, act: "repair" });
  if (a.statusId === "decommissioned" && can("disposed")) primary.push({ label: "Dispose", icon: Trash2, act: "dispose", tone: "primary" });

  const moves = st?.next.map((id) => s.statuses.find((x) => x.id === id)).filter((x) => x && x.enabled) ?? [];

  return (
    <div className="mx-auto max-w-7xl p-4 pb-24 md:p-8">
      <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <span>Assets</span><ChevronRight className="size-3" /><Link to="/app/assets/register" className="hover:text-foreground">Register</Link><ChevronRight className="size-3" /><span className="num text-foreground">{a.tag}</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-start gap-4">
        <AssetThumb a={a} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="pd-h1 truncate">{a.name || "Untitled asset"}</h1><StatusPill s={st} /></div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <button onClick={() => { void navigator.clipboard?.writeText(a.tag); toast.success("Asset ID copied"); }} className="num inline-flex items-center gap-1 text-foreground hover:text-primary" title="Copy asset ID">{a.tag}<Copy className="size-3" /></button>
            <span>·</span><span>{cat?.name}</span>
            {[a.make, a.model].filter(Boolean).length > 0 && <><span>·</span><span>{[a.make, a.model].filter(Boolean).join(" ")}</span></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {primary.map((p) => <button key={p.act} onClick={() => setAction(p.act)} className={p.tone === "primary" ? BTN_PRIMARY : BTN}><p.icon className="size-3.5" />{p.label}</button>)}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(BTN, "px-2")} aria-label="More actions"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {a.statusId !== "disposed" && <DropdownMenuItem onSelect={() => setAction("edit")}><Pencil className="size-3.5" />Edit details</DropdownMenuItem>}
              {a.statusId !== "disposed" && a.statusId !== "draft" && <DropdownMenuItem onSelect={() => setAction("maintenance")}><Wrench className="size-3.5" />Log maintenance</DropdownMenuItem>}
              {!a.repair && moves.length > 0 && <DropdownMenuItem onSelect={() => setAction("status")}><CircleDot className="size-3.5" />Change status…</DropdownMenuItem>}
              {can("decommissioned") && !a.repair && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setAction("decommission")}><Package className="size-3.5" />Decommission</DropdownMenuItem></>}
              {a.statusId === "disposed" && <DropdownMenuLabel className="font-normal text-muted-foreground">Disposed assets are read-only.</DropdownMenuLabel>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Lifecycle */}
      <ol className="pd-panel mb-4 grid grid-cols-4 overflow-hidden" aria-label="Lifecycle">
        {PHASES.map((p, i) => {
          const cur = st?.phase === p;
          const done = PHASES.indexOf(st?.phase ?? "setup") > i;
          return (
            <li key={p} aria-current={cur ? "step" : undefined} className={cn("relative flex items-center gap-2 border-r border-border px-3 py-2.5 text-[12px] last:border-r-0", cur ? "bg-primary/5 font-medium text-primary" : done ? "text-foreground" : "text-muted-foreground")}>
              <span className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px]", cur ? "bg-primary text-primary-foreground" : done ? "bg-success-soft text-success" : "bg-subtle")}>{done ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}</span>
              <span className="truncate">{PHASE_LABEL[p]}</span>
              {cur && <span className="ml-auto hidden truncate text-[11px] font-normal text-muted-foreground sm:block">{st?.name}</span>}
            </li>
          );
        })}
      </ol>

      {a.statusId === "draft" && (
        <Banner tone="neutral" icon={<Pencil className="size-4" />} title="This asset is a draft" text={Object.keys(activationIssues({ ...a, statusId: "available" }, s)).length ? "Finish the missing details, then activate it to start tracking and depreciation." : "Everything required is filled in — activate it to put it into service."} action={<button onClick={() => setAction("activate")} className={BTN}>Activate</button>} />
      )}
      {a.checkout && (
        <Banner tone={overdue ? "red" : "blue"} icon={overdue ? <AlertTriangle className="size-4" /> : <LogOut className="size-4" />}
          title={`Checked out to ${holderName(a.checkout.to, db)}`}
          text={`Since ${fmtDate(a.checkout.at)} · due back ${fmtDate(a.checkout.due)} (${relDays(daysUntil(a.checkout.due))})${a.checkout.note ? ` · ${a.checkout.note}` : ""}`}
          action={<button onClick={() => setAction("checkin")} className={BTN}>Check in</button>} />
      )}
      {a.disposal && <Banner tone="neutral" icon={<Trash2 className="size-4" />} title={`${a.disposal.method} on ${fmtDate(a.disposal.at)}`} text={`${a.disposal.proceeds ? `Proceeds ${money(a.disposal.proceeds)}. ` : ""}${a.disposal.note ?? ""}This record is kept for audit.`} />}

      {a.repair && <RepairPanel a={a} vendorName={vendorName} userName={userName} onStage={(sg) => { setStageTo(sg); setAction("stage"); }} onComplete={() => setAction("complete")} onPart={() => setAction("part")} onToggle={(pid) => mutate((d) => updateAsset(d, a.id, (x) => { const p = x.repair!.parts.find((q) => q.id === pid)!; p.received = !p.received; }, me?.id, "Repair part updated"))} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div role="tablist" className="pd-scroll-hide mb-3 flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map((t) => {
              const n = t.id === "repairs" ? a.repairs.length + (a.repair ? 1 : 0) : t.id === "maintenance" ? a.maintenanceLog.length : t.id === "files" ? a.photos.length + a.docs.length : t.id === "history" ? a.history.length : 0;
              return <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px]", tab === t.id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}{n > 0 && <span className="num rounded bg-subtle px-1 text-[11px] text-muted-foreground">{n}</span>}</button>;
            })}
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <Card title="Identification">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Meta k="Asset ID" v={<span className="num">{a.tag}</span>} />
                  {cat && cat.identifier !== "none" && <Meta k={IDENTIFIER_LABEL[cat.identifier]} v={<span className="num">{a.identifier}</span>} />}
                  <Meta k="Condition" v={CONDITION_LABEL[a.condition]} />
                  <Meta k="Make" v={a.make} /><Meta k="Model" v={a.model} />
                  {s.fields.filter((f) => !f.categoryIds.length || f.categoryIds.includes(a.categoryId)).map((f) => <Meta key={f.id} k={f.label} v={a.custom[f.id]} />)}
                </dl>
                {a.description && <p className="mt-3 border-t border-border pt-3 text-[13px] text-muted-foreground">{a.description}</p>}
              </Card>
              <Card title="Location & ownership">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Meta k="Location" v={a.site} /><Meta k="Room, bay or desk" v={a.room} />
                  <Meta k="Department" v={db.departments.find((x) => x.id === a.departmentId)?.name} />
                  <Meta k="Assigned to" v={a.assignedTo ? <HolderChip h={a.assignedTo} db={db} /> : a.checkout ? <span className="text-muted-foreground">On loan</span> : null} />
                </dl>
              </Card>
              <Card title="Purchase & depreciation">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Meta k="Purchase cost" v={<span className="num">{money(a.cost)}</span>} /><Meta k="Purchase date" v={fmtDate(a.purchaseDate)} />
                  <Meta k="Supplier" v={vendorName(a.vendorId)} /><Meta k="Purchase order" v={a.poNumber} /><Meta k="Invoice" v={a.invoiceNo} />
                  <Meta k="Method" v={a.cost < s.depreciation.capitalizationThreshold ? "Expensed (below limit)" : `${METHOD_LABEL[rule.method]} · ${Math.round(rule.usefulLifeMonths / 12 * 10) / 10} yrs`} />
                  <Meta k="In service from" v={fmtDate(a.inServiceDate)} /><Meta k="Salvage value" v={`${rule.salvagePct}%`} />
                </dl>
              </Card>
            </div>
          )}

          {tab === "repairs" && (
            <Card title="Repair history" action={!a.repair && primary.some((p) => p.act === "repair") ? <button onClick={() => setAction("repair")} className={BTN}><Plus className="size-3.5" />Report issue</button> : undefined}>
              {[...(a.repair ? [a.repair] : []), ...a.repairs].length ? (
                <ul className="divide-y divide-border">
                  {[...(a.repair ? [a.repair] : []), ...a.repairs].map((r) => (
                    <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px] font-medium">{r.issue}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px]", r.closedAt ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{r.closedAt ? "Completed" : REPAIR_STAGES.find((x) => x.id === r.stage)?.label}</span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">Opened {fmtDate(r.openedAt)} by {userName(r.openedBy)}{r.closedAt && ` · closed ${fmtDate(r.closedAt)}`} · {PRIORITY_LABEL[r.priority]} priority · <span className="num">{money(repairCost(r))}</span>{r.vendorId && ` · ${vendorName(r.vendorId)}`}</p>
                      {r.resolution && <p className="mt-1 text-[12px]">{r.resolution}</p>}
                    </li>
                  ))}
                </ul>
              ) : <Empty text="No repairs yet. If something breaks, use Report issue to start a repair." />}
            </Card>
          )}

          {tab === "maintenance" && (
            <Card title="Maintenance log" desc={a.maintenanceEveryMonths ? `Serviced every ${a.maintenanceEveryMonths} months${a.nextMaintenance ? ` · next due ${fmtDate(a.nextMaintenance)}` : ""}.` : "No service interval set."}
              action={a.statusId !== "disposed" && a.statusId !== "draft" ? <button onClick={() => setAction("maintenance")} className={BTN}><Plus className="size-3.5" />Log maintenance</button> : undefined}>
              {a.maintenanceLog.length ? (
                <ul className="divide-y divide-border">{a.maintenanceLog.map((m) => <li key={m.id} className="flex justify-between gap-3 py-2.5 text-[13px] first:pt-0"><span><span className="block">{m.note}</span><span className="text-[12px] text-muted-foreground">{fmtDate(m.at)} · {userName(m.by)}</span></span><span className="num shrink-0">{money(m.cost)}</span></li>)}</ul>
              ) : <Empty text="No maintenance recorded yet." />}
            </Card>
          )}

          {tab === "files" && (
            <Card title="Photos & documents">
              {a.photos.length > 0 && <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{a.photos.map((p) => <img key={p.id} src={p.url} alt={p.name} className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-border" />)}</div>}
              {a.docs.length ? <ul className="divide-y divide-border rounded-lg border border-border">{a.docs.map((d) => <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-[13px]"><FileText className="size-4 text-muted-foreground" /><span className="flex-1 truncate">{d.name}</span><span className="text-[11px] text-muted-foreground">{DOC_KIND[d.kind]}</span></li>)}</ul>
                : !a.photos.length && <Empty text="No photos or documents attached." />}
            </Card>
          )}

          {tab === "history" && (
            <Card title="History" desc="Every change to this asset, newest first.">
              <ol className="relative ml-2 border-l border-border">
                {a.history.map((e) => (
                  <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
                    <span className={cn("absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-2 ring-surface", e.kind === "repair" ? "bg-warning" : e.kind === "checkout" || e.kind === "checkin" ? "bg-ai" : e.kind === "create" ? "bg-success" : "bg-primary")} />
                    <p className="text-[13px]">{e.text}</p>
                    {e.note && <p className="mt-0.5 text-[12px] text-muted-foreground">“{e.note}”</p>}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDateTime(e.at)} · {userName(e.by)}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card title="Value">
            <p className="num text-xl font-semibold tracking-tight">{money(book)}</p>
            <p className="text-[12px] text-muted-foreground">Book value today · cost {money(a.cost)}</p>
            {a.cost > 0 && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (book / a.cost) * 100)}%` }} /></div>}
            {a.cost > 0 && <p className="mt-1.5 text-[11px] text-muted-foreground">{Math.round(100 - (book / a.cost) * 100)}% depreciated</p>}
          </Card>
          <Card title="Key dates">
            <ul className="space-y-2.5 text-[13px]">
              <DateRow label="Warranty ends" iso={a.warrantyEnd} warn={30} sub={a.warrantyProvider} />
              {a.insuranceEnd && <DateRow label="Insurance ends" iso={a.insuranceEnd} warn={45} />}
              <DateRow label="Next service" iso={a.nextMaintenance} warn={7} />
              {a.checkout && <DateRow label="Due back" iso={a.checkout.due} warn={1} />}
              {a.repair?.eta && <DateRow label="Repair ETA" iso={a.repair.eta} warn={0} />}
            </ul>
          </Card>
        </aside>
      </div>

      <ActionDialog action={action} close={() => setAction(null)} a={a} stageTo={stageTo} run={run} meId={me?.id} />
    </div>
  );
}

function Banner({ tone, icon, title, text, action }: { tone: "red" | "blue" | "neutral"; icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3", tone === "red" ? "border-destructive/30 bg-destructive/5" : tone === "blue" ? "border-primary/20 bg-primary/5" : "border-border bg-subtle")}>
      <span className={tone === "red" ? "text-destructive" : tone === "blue" ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      <div className="min-w-0 flex-1"><p className="text-[13px] font-medium">{title}</p><p className="text-[12px] text-muted-foreground">{text}</p></div>
      {action}
    </div>
  );
}

function Empty({ text }: { text: string }) { return <p className="py-6 text-center text-[13px] text-muted-foreground">{text}</p>; }

function HolderChip({ h, db }: { h: Holder; db: ReturnType<typeof useDB> }) {
  const u = h.kind === "user" ? db.users.find((x) => x.id === h.userId) : undefined;
  return <span className="inline-flex items-center gap-1.5">{u && <UserAvatar user={u} />}<span className="truncate">{holderName(h, db)}</span></span>;
}

function DateRow({ label, iso, warn, sub }: { label: string; iso?: string; warn: number; sub?: string }) {
  const n = daysUntil(iso);
  return (
    <li className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground">{label}{sub && <span className="block text-[11px]">{sub}</span>}</span>
      {iso ? <span className="text-right"><span className="block">{fmtDate(iso)}</span><span className={cn("text-[11px]", n < 0 ? "text-destructive" : n <= warn ? "text-warning" : "text-muted-foreground")}>{relDays(n)}</span></span> : <span className="text-muted-foreground/70">—</span>}
    </li>
  );
}

function RepairPanel({ a, vendorName, userName, onStage, onComplete, onPart, onToggle }: { a: Asset; vendorName: (id?: string) => string | undefined; userName: (id?: string) => string; onStage: (s: RepairStage) => void; onComplete: () => void; onPart: () => void; onToggle: (id: string) => void }) {
  const r = a.repair!;
  const flow = REPAIR_STAGES.filter((x) => x.id !== "completed");
  const idx = flow.findIndex((x) => x.id === r.stage);
  const waiting = r.parts.filter((p) => !p.received).length;
  const nextOptions = flow.filter((x) => x.id !== r.stage && x.id !== "reported");
  const suggested: RepairStage = r.stage === "reported" ? "diagnosing" : r.stage === "awaiting_parts" ? (waiting ? "awaiting_parts" : "repairing") : r.stage === "at_vendor" || r.stage === "repairing" ? "quality_check" : r.stage === "diagnosing" ? "repairing" : "quality_check";
  const last = r.stages.at(-1);
  return (
    <section className="pd-panel mb-4 overflow-hidden border-warning/30" aria-label="Open repair">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-warning-soft/40 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium"><Wrench className="size-4 text-warning" />Repair in progress <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-normal", r.priority === "critical" || r.priority === "high" ? "bg-destructive/10 text-destructive" : "bg-subtle text-muted-foreground")}>{PRIORITY_LABEL[r.priority]}</span></p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{r.issue}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.stage === "quality_check" ? <button onClick={onComplete} className={BTN_PRIMARY}><Check className="size-3.5" />Complete repair</button>
            : suggested !== r.stage && <button onClick={() => onStage(suggested)} className={BTN_PRIMARY}>Move to {REPAIR_STAGES.find((x) => x.id === suggested)!.label.toLowerCase()}</button>}
          <DropdownMenu>
            <DropdownMenuTrigger className={BTN}>Update<ChevronRight className="size-3.5 rotate-90" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Move repair to</DropdownMenuLabel>
              {nextOptions.map((x) => <DropdownMenuItem key={x.id} onSelect={() => onStage(x.id)}>{x.label}</DropdownMenuItem>)}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onPart}><Plus className="size-3.5" />Add part</DropdownMenuItem>
              <DropdownMenuItem onSelect={onComplete}><Check className="size-3.5" />Complete repair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ol className="pd-scroll-hide flex overflow-x-auto px-4 py-3" aria-label="Repair stages">
        {flow.map((x, i) => {
          const done = i < idx; const cur = i === idx;
          const at = [...r.stages].reverse().find((q) => q.stage === x.id);
          return (
            <li key={x.id} className="flex min-w-[112px] flex-1 flex-col" title={x.hint}>
              <div className="flex items-center">
                <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]", cur ? "bg-warning text-primary-foreground ring-4 ring-warning/15" : done ? "bg-success text-primary-foreground" : "bg-subtle text-muted-foreground")}>{done ? <Check className="size-3" strokeWidth={3} /> : i + 1}</span>
                {i < flow.length - 1 && <span className={cn("mx-1 h-px flex-1", done ? "bg-success" : "bg-border")} />}
              </div>
              <span className={cn("mt-1.5 text-[12px]", cur ? "font-medium" : done ? "" : "text-muted-foreground")}>{x.label}</span>
              {at && (done || cur) && <span className="text-[11px] text-muted-foreground">{fmtDate(at.at)}</span>}
            </li>
          );
        })}
      </ol>
      <div className="grid gap-4 border-t border-border px-4 py-3 text-[13px] sm:grid-cols-[1fr_1fr]">
        <dl className="grid grid-cols-2 gap-3">
          <Meta k="Opened" v={`${fmtDate(r.openedAt)} · ${userName(r.openedBy)}`} />
          <Meta k="Expected back" v={r.eta ? `${fmtDate(r.eta)} (${relDays(daysUntil(r.eta))})` : ""} />
          {r.vendorId && <Meta k="Service vendor" v={vendorName(r.vendorId)} />}
          {r.rmaNo && <Meta k="Ticket / RMA" v={<span className="num">{r.rmaNo}</span>} />}
          <Meta k="Cost so far" v={<span className="num">{money(repairCost(r))}</span>} />
          {last?.note && <Meta k="Latest note" v={<span title={last.note}>{last.note}</span>} />}
        </dl>
        <div>
          <div className="mb-1.5 flex items-center justify-between"><p className="pd-section-title">Parts {waiting > 0 && <span className="normal-case tracking-normal text-warning">· {waiting} waiting</span>}</p><button onClick={onPart} className={cn(BTN_GHOST, "h-6 px-1.5 text-[12px]")}><Plus className="size-3" />Add part</button></div>
          {r.parts.length ? (
            <ul className="space-y-1">
              {r.parts.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <button onClick={() => onToggle(p.id)} aria-pressed={p.received} title={p.received ? "Mark as not received" : "Mark as received"} className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded border transition-colors", p.received ? "border-success bg-success text-primary-foreground" : "border-input hover:border-primary")}>{p.received && <Check className="size-3" strokeWidth={3} />}</button>
                  <span className={cn("flex-1 truncate", p.received && "text-muted-foreground")}>{p.qty} × {p.name}</span>
                  <span className={cn("text-[11px]", p.received ? "text-success" : "text-warning")}>{p.received ? "Received" : "Ordered"}</span>
                  <span className="num w-16 text-right text-[12px]">{money(p.qty * p.cost)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[12px] text-muted-foreground">No parts needed so far.</p>}
        </div>
      </div>
    </section>
  );
}

function ActionDialog({ action, close, a, stageTo, run, meId }: { action: Action | null; close: () => void; a: Asset; stageTo: RepairStage; run: (fn: (d: ReturnType<typeof useDB>) => void, msg: string, desc?: string) => void; meId?: string }) {
  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">{action && <ActionBody key={action + stageTo} action={action} close={close} a={a} stageTo={stageTo} run={run} meId={meId} />}</DialogContent>
    </Dialog>
  );
}

function ActionBody({ action, close, a, stageTo, run, meId }: { action: Action; close: () => void; a: Asset; stageTo: RepairStage; run: (fn: (d: ReturnType<typeof useDB>) => void, msg: string, desc?: string) => void; meId?: string }) {
  const db = useDB();
  const s = db.assets!;
  const people = db.users.filter((u) => u.active);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"user" | "site">("user");
  const [holder, setHolder] = useState<Holder | undefined>();
  const [due, setDue] = useState(addDays(today(), s.checkout.defaultDays));
  const [cond, setCond] = useState<Condition>(a.condition);
  const [issue, setIssue] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [to, setTo] = useState<string>(action === "activate" ? "available" : action === "complete" ? (a.repair?.returnTo && a.repair.returnTo !== "in_use" ? a.repair.returnTo : "available") : action === "checkin" ? "available" : "");
  const [vendor, setVendor] = useState(a.repair?.vendorId ?? "");
  const [rma, setRma] = useState(a.repair?.rmaNo ?? "");
  const [eta, setEta] = useState(a.repair?.eta ?? "");
  const [cost, setCost] = useState("");
  const [labour, setLabour] = useState(String(a.repair?.labourCost ?? 0));
  const [part, setPart] = useState({ name: "", qty: "1", cost: "" });
  const [method, setMethod] = useState(DISPOSAL_METHODS[0]);
  const [edit, setEdit] = useState({ name: a.name, identifier: a.identifier, site: a.site, room: a.room, warrantyEnd: a.warrantyEnd ?? "", cost: String(a.cost || "") });
  const [err, setErr] = useState("");
  const status = (id: string) => s.statuses.find((x) => x.id === id)!;
  const by = meId;

  const foot = (label: string, ok: () => void, danger = false) => (
    <DialogFooter className="mt-2 gap-2">
      <button onClick={close} className={BTN}>Cancel</button>
      <button onClick={ok} className={cn(BTN_PRIMARY, danger && "bg-destructive")}>{label}</button>
    </DialogFooter>
  );
  const head = (t: string, d?: string) => <DialogHeader><DialogTitle>{t}</DialogTitle>{d && <DialogDescription>{d}</DialogDescription>}</DialogHeader>;
  const noteField = (label = "Note (optional)", ph = "Anything others should know") => <Field label={label} htmlFor="act-note"><TextArea id="act-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={ph} /></Field>;
  const errLine = err && <p className="flex items-center gap-1.5 text-[12px] text-destructive"><AlertTriangle className="size-3.5" />{err}</p>;
  const holderBlock = (title: string) => (
    <div>
      <div className="mb-1.5 flex items-center justify-between"><span className="pd-label mb-0">{title}</span><HolderToggle v={kind} set={(k) => { setKind(k); setHolder(undefined); }} /></div>
      <HolderPick kind={kind} value={holder} people={people} onChange={setHolder} />
    </div>
  );

  if (action === "activate") {
    const issues = activationIssues({ ...a, statusId: "available" }, s);
    const options = s.statuses.find((x) => x.id === "draft")!.next.filter((id) => id !== "disposed").map(status).filter((x) => x?.enabled);
    return (<>
      {head("Activate asset", "Puts it into service. Depreciation starts from its in-service date.")}
      {Object.keys(issues).length ? (
        <div className="rounded-lg border border-warning/30 bg-warning-soft/40 p-3 text-[13px]">
          <p className="font-medium">Finish these first</p>
          <ul className="mt-1 list-disc pl-5 text-[12px] text-muted-foreground">{Object.values(issues).map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Move to" htmlFor="act-to"><Select id="act-to" value={to} onChange={(e) => setTo(e.target.value)}>{options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          {noteField()}
        </div>
      )}
      {Object.keys(issues).length
        ? <DialogFooter><button onClick={close} className={BTN}>Close</button></DialogFooter>
        : foot("Activate", () => run((d) => setStatus(d, a.id, to, by, note), `${a.tag} is now ${status(to).name.toLowerCase()}`))}
    </>);
  }

  if (action === "assign") return (<>
    {head("Assign asset", "For long-term use by one person or at one place. Use Check out for short loans.")}
    <div className="space-y-3">{holderBlock("Assign to")}{noteField()}{errLine}</div>
    {foot("Assign", () => { if (!holder) return setErr("Choose who or where to assign it to."); run((d) => assign(d, a.id, holder, by, note), `Assigned to ${holderName(holder, db)}`); })}
  </>);

  if (action === "unassign") return (<>
    {head("Unassign asset", `${holderName(a.assignedTo, db) || "The current holder"} returns it. It becomes available for others.`)}
    <div className="space-y-3"><Field label="Condition on return" htmlFor="act-c"><Select id="act-c" value={cond} onChange={(e) => setCond(e.target.value as Condition)}>{Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>{noteField()}</div>
    {foot("Unassign", () => run((d) => { setStatus(d, a.id, "available", by, note); updateAsset(d, a.id, (x) => { x.condition = cond; }, by, `Condition recorded as ${CONDITION_LABEL[cond].toLowerCase()}`); }, "Asset is available again"))}
  </>);

  if (action === "checkout") {
    const days = daysUntil(due);
    return (<>
      {head("Check out", `Lend ${a.name} to a person or job site until a return date.`)}
      <div className="space-y-3">
        {holderBlock("Check out to")}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due back" htmlFor="act-due" hint={days > 0 ? `${days} days` : undefined}><TextInput id="act-due" type="date" min={addDays(today(), 1)} max={addDays(today(), s.checkout.maxDays)} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Condition now" htmlFor="act-c"><Select id="act-c" value={cond} onChange={(e) => setCond(e.target.value as Condition)}>{Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <div className="flex gap-1">{[1, 7, 14, 30].filter((n) => n <= s.checkout.maxDays).map((n) => <button key={n} type="button" onClick={() => setDue(addDays(today(), n))} className="pd-chip h-6 px-2 text-[11px]">{n === 1 ? "1 day" : `${n} days`}</button>)}</div>
        {noteField("Purpose (optional)", "e.g. Site survey at Riverside Plaza")}
        {s.checkout.requireAcknowledgement && <p className="text-[12px] text-muted-foreground">The borrower will be asked to accept responsibility for the asset.</p>}
        {errLine}
      </div>
      {foot("Check out", () => {
        if (!holder) return setErr("Choose who is taking it.");
        if (!due || days < 1) return setErr("Pick a return date after today.");
        if (days > s.checkout.maxDays) return setErr(`Loans can't be longer than ${s.checkout.maxDays} days.`);
        run((d) => checkOut(d, a.id, holder, due, cond, by, note), `Checked out to ${holderName(holder, db)}`, `Due back ${fmtDate(due)}`);
      })}
    </>);
  }

  if (action === "checkin") {
    const late = a.checkout ? -daysUntil(a.checkout.due) : 0;
    return (<>
      {head("Check in", `${holderName(a.checkout?.to, db)} is returning ${a.name}.${late > 0 ? ` It's ${late} ${late === 1 ? "day" : "days"} late.` : ""}`)}
      <div className="space-y-3">
        <Field label="Condition on return" htmlFor="act-c" hint={a.checkout ? `Was ${CONDITION_LABEL[a.checkout.condition].toLowerCase()} when it left.` : undefined}><Select id="act-c" value={cond} onChange={(e) => { const v = e.target.value as Condition; setCond(v); if (v === "damaged" || v === "poor") setTo("in_repair"); }}>{Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {[{ id: "available", t: "Ready to use", d: "Back on the shelf" }, { id: "in_repair", t: "Needs repair", d: "Opens a repair" }].map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={to === o.id} onClick={() => setTo(o.id)} className={cn("rounded-lg border p-2.5 text-left", to === o.id ? "border-primary bg-primary/5" : "border-border hover:border-foreground/20")}><span className="block text-[13px] font-medium">{o.t}</span><span className="text-[11px] text-muted-foreground">{o.d}</span></button>
          ))}
        </div>
        {noteField(to === "in_repair" ? "What's wrong?" : "Note (optional)", to === "in_repair" ? "Describe the damage or fault" : "e.g. Charger missing")}
        {errLine}
      </div>
      {foot("Check in", () => {
        if (to === "in_repair" && !note.trim()) return setErr("Describe what's wrong so the repair can start.");
        run((d) => { checkIn(d, a.id, cond, "available", by, to === "in_repair" ? undefined : note); if (to === "in_repair") openRepair(d, a.id, note.trim(), "normal", by); }, to === "in_repair" ? "Checked in and sent for repair" : "Checked in", to === "in_repair" ? undefined : "The asset is available again.");
      })}
    </>);
  }

  if (action === "repair") return (<>
    {head("Report an issue", "Takes the asset out of use and starts a repair you can track step by step.")}
    <div className="space-y-3">
      <Field label="What's wrong?" htmlFor="act-issue"><TextArea id="act-issue" autoFocus rows={3} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="e.g. Screen flickers after 10 minutes; hinge loose" /></Field>
      <Field label="Priority" htmlFor="act-p"><div className="grid grid-cols-4 gap-1.5">{(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <button key={p} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p} className={cn("h-8 rounded-md border text-[12px]", priority === p ? "border-primary bg-primary/5 font-medium text-primary" : "border-border hover:bg-subtle")}>{PRIORITY_LABEL[p]}</button>)}</div></Field>
      {a.checkout && <p className="text-[12px] text-muted-foreground">This also checks it back in from {holderName(a.checkout.to, db)}.</p>}
      {errLine}
    </div>
    {foot("Start repair", () => { if (issue.trim().length < 5) return setErr("Describe the problem in a few words."); run((d) => openRepair(d, a.id, issue.trim(), priority, by), "Repair started", "Status changed to In repair."); })}
  </>);

  if (action === "stage") {
    const meta = REPAIR_STAGES.find((x) => x.id === stageTo)!;
    return (<>
      {head(`Move to “${meta.label}”`, meta.hint)}
      <div className="space-y-3">
        {stageTo === "at_vendor" && (<>
          <Field label="Service vendor" htmlFor="act-v"><Select id="act-v" value={vendor} onChange={(e) => setVendor(e.target.value)}><option value="">Choose a vendor…</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
          <Field label="Ticket or RMA number" htmlFor="act-r"><TextInput id="act-r" value={rma} onChange={(e) => setRma(e.target.value)} placeholder="e.g. RMA-55120" /></Field>
          <p className="text-[12px] text-muted-foreground">Status changes to At vendor until it comes back.</p>
        </>)}
        {(stageTo === "at_vendor" || stageTo === "awaiting_parts" || stageTo === "repairing") && <Field label="Expected back" htmlFor="act-eta"><TextInput id="act-eta" type="date" min={today()} value={eta} onChange={(e) => setEta(e.target.value)} /></Field>}
        {stageTo === "quality_check" && <Field label="Labour cost so far" htmlFor="act-l"><TextInput id="act-l" inputMode="decimal" className="num" value={labour} onChange={(e) => setLabour(e.target.value)} /></Field>}
        {stageTo === "awaiting_parts" && <p className="text-[12px] text-muted-foreground">Add the parts you're waiting for from the repair panel, then tick them off as they arrive.</p>}
        {noteField(stageTo === "diagnosing" ? "Findings (optional)" : "Note (optional)")}
        {errLine}
      </div>
      {foot(`Move to ${meta.label.toLowerCase()}`, () => {
        if (stageTo === "at_vendor" && !vendor) return setErr("Choose which vendor has it.");
        run((d) => moveRepair(d, a.id, stageTo, by, note, { ...(stageTo === "at_vendor" ? { vendorId: vendor, rmaNo: rma || undefined } : {}), ...(eta ? { eta } : {}), ...(stageTo === "quality_check" ? { labourCost: Math.max(0, parseFloat(labour) || 0) } : {}) }), `Repair moved to ${meta.label.toLowerCase()}`);
      })}
    </>);
  }

  if (action === "part") return (<>
    {head("Add a part", "Track parts ordered for this repair. Tick them off as they arrive.")}
    <div className="space-y-3">
      <Field label="Part" htmlFor="act-pn"><TextInput id="act-pn" autoFocus value={part.name} onChange={(e) => setPart({ ...part, name: e.target.value })} placeholder="e.g. Replacement keyboard" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" htmlFor="act-pq"><TextInput id="act-pq" type="number" min={1} value={part.qty} onChange={(e) => setPart({ ...part, qty: e.target.value })} /></Field>
        <Field label="Unit cost" htmlFor="act-pc"><TextInput id="act-pc" inputMode="decimal" className="num" value={part.cost} onChange={(e) => setPart({ ...part, cost: e.target.value })} placeholder="0.00" /></Field>
      </div>
      {errLine}
    </div>
    {foot("Add part", () => {
      if (!part.name.trim()) return setErr("Name the part.");
      run((d) => updateAsset(d, a.id, (x) => { x.repair!.parts.push({ id: crypto.randomUUID(), name: part.name.trim(), qty: Math.max(1, +part.qty || 1), cost: Math.max(0, parseFloat(part.cost) || 0), received: false }); }, by, `Part ordered: ${part.name.trim()}`), "Part added");
    })}
  </>);

  if (action === "complete") {
    const r = a.repair!;
    const options = ["available", "in_use"].map(status).filter((x) => x?.enabled);
    return (<>
      {head("Complete repair", "Closes the repair and returns the asset to service.")}
      <div className="space-y-3">
        {r.parts.some((p) => !p.received) && <p className="flex items-center gap-1.5 rounded-md bg-warning-soft/50 px-2.5 py-1.5 text-[12px] text-warning"><AlertTriangle className="size-3.5" />Some parts aren't marked as received yet.</p>}
        <Field label="What was done?" htmlFor="act-res"><TextArea id="act-res" autoFocus rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Replaced rotor and pads; road-tested" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Labour cost" htmlFor="act-l"><TextInput id="act-l" inputMode="decimal" className="num" value={labour} onChange={(e) => setLabour(e.target.value)} /></Field>
          <Field label="Return to" htmlFor="act-to"><Select id="act-to" value={to} onChange={(e) => setTo(e.target.value)}>{options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        </div>
        <Field label="Condition now" htmlFor="act-c"><Select id="act-c" value={cond} onChange={(e) => setCond(e.target.value as Condition)}>{Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {errLine}
      </div>
      {foot("Complete repair", () => {
        if (!note.trim()) return setErr("Add a short summary of the fix for the history.");
        run((d) => { updateAsset(d, a.id, (x) => { x.repair!.labourCost = Math.max(0, parseFloat(labour) || 0); x.condition = cond; }, by, `Condition recorded as ${CONDITION_LABEL[cond].toLowerCase()}`); completeRepair(d, a.id, to, note.trim(), by); }, "Repair completed", `${a.name} is back in service.`);
      })}
    </>);
  }

  if (action === "maintenance") return (<>
    {head("Log maintenance", a.maintenanceEveryMonths ? `Next service will be scheduled ${a.maintenanceEveryMonths} months from today.` : "Record a service, inspection or clean.")}
    <div className="space-y-3">
      <Field label="What was done?" htmlFor="act-m"><TextArea id="act-m" autoFocus rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Oil change and tyre rotation" /></Field>
      <Field label="Cost" htmlFor="act-mc"><TextInput id="act-mc" inputMode="decimal" className="num" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" /></Field>
      {errLine}
    </div>
    {foot("Save", () => { if (!note.trim()) return setErr("Describe the work done."); run((d) => logMaintenance(d, a.id, note.trim(), Math.max(0, parseFloat(cost) || 0), by), "Maintenance logged"); })}
  </>);

  if (action === "status") {
    const opts = s.statuses.find((x) => x.id === a.statusId)!.next.map(status).filter((x) => x?.enabled && x.id !== "disposed");
    return (<>
      {head("Change status", "Only moves allowed in Asset settings → Statuses are shown.")}
      <div className="space-y-3">
        <div role="radiogroup" className="grid gap-1.5">
          {opts.map((x) => <button key={x.id} type="button" role="radio" aria-checked={to === x.id} onClick={() => setTo(x.id)} className={cn("flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left", to === x.id ? "border-primary bg-primary/5" : "border-border hover:border-foreground/20")}><span><StatusPill s={x} /><span className="mt-1 block text-[11px] text-muted-foreground">{x.description}</span></span>{to === x.id && <Check className="size-4 text-primary" />}</button>)}
        </div>
        {(to === "in_use" || to === "checked_out") && <p className="text-[12px] text-muted-foreground">Use {to === "in_use" ? "Assign" : "Check out"} to also record who has it.</p>}
        {noteField("Reason (optional)")}
        {errLine}
      </div>
      {foot("Change status", () => {
        if (!to) return setErr("Choose a status.");
        if (to === "in_repair" || to === "at_vendor") { run((d) => openRepair(d, a.id, note.trim() || "Sent for repair", "normal", by), "Repair started"); return; }
        run((d) => setStatus(d, a.id, to, by, note), `Status changed to ${status(to).name}`);
      })}
    </>);
  }

  if (action === "decommission") return (<>
    {head("Decommission asset", "Removes it from service and stops depreciation. You can still dispose of it or bring it back later.")}
    <div className="space-y-3">{noteField("Reason", "e.g. Beyond economical repair")}{errLine}</div>
    {foot("Decommission", () => { if (!note.trim()) return setErr("Add a reason for the audit trail."); run((d) => setStatus(d, a.id, "decommissioned", by, note), `${a.tag} decommissioned`); }, true)}
  </>);

  if (action === "dispose") return (<>
    {head("Dispose of asset", "This is final. The record stays for audit but can't be changed afterwards.")}
    <div className="space-y-3">
      <Field label="How was it disposed of?" htmlFor="act-dm"><Select id="act-dm" value={method} onChange={(e) => setMethod(e.target.value)}>{DISPOSAL_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
      <Field label="Sale proceeds" htmlFor="act-dp" hint={`Book value today: ${money(bookValue(a, s))}`}><TextInput id="act-dp" inputMode="decimal" className="num" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" /></Field>
      {noteField("Note (optional)", "Buyer, certificate number…")}
    </div>
    {foot("Dispose", () => run((d) => dispose(d, a.id, method, Math.max(0, parseFloat(cost) || 0), by, note), `${a.tag} disposed`), true)}
  </>);

  // edit
  const cat = s.categories.find((c) => c.id === a.categoryId);
  return (<>
    {head("Edit details", "Changes are recorded in the asset's history.")}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Asset name" htmlFor="e-n" className="sm:col-span-2"><TextInput id="e-n" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
      {cat && cat.identifier !== "none" && <Field label={IDENTIFIER_LABEL[cat.identifier]} htmlFor="e-i"><TextInput id="e-i" className="num" value={edit.identifier} onChange={(e) => setEdit({ ...edit, identifier: e.target.value.toUpperCase() })} /></Field>}
      <Field label="Purchase cost" htmlFor="e-c"><TextInput id="e-c" inputMode="decimal" className="num" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} /></Field>
      <Field label="Location" htmlFor="e-s"><Select id="e-s" value={edit.site} onChange={(e) => setEdit({ ...edit, site: e.target.value })}>{SITES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
      <Field label="Room, bay or desk" htmlFor="e-r"><TextInput id="e-r" value={edit.room} onChange={(e) => setEdit({ ...edit, room: e.target.value })} /></Field>
      <Field label="Warranty ends" htmlFor="e-w"><TextInput id="e-w" type="date" value={edit.warrantyEnd} onChange={(e) => setEdit({ ...edit, warrantyEnd: e.target.value })} /></Field>
      <div className="sm:col-span-2">{errLine}</div>
    </div>
    {foot("Save changes", () => {
      if (!edit.name.trim()) return setErr("The asset needs a name.");
      const changed = [edit.name !== a.name && "name", edit.identifier !== a.identifier && "identifier", edit.site !== a.site && "location", edit.room !== a.room && "room", (edit.warrantyEnd || undefined) !== a.warrantyEnd && "warranty", (parseFloat(edit.cost) || 0) !== a.cost && "cost"].filter(Boolean);
      if (!changed.length) return close();
      run((d) => updateAsset(d, a.id, (x) => { x.name = edit.name.trim(); x.identifier = edit.identifier; x.site = edit.site; x.room = edit.room; x.warrantyEnd = edit.warrantyEnd || undefined; x.cost = Math.max(0, parseFloat(edit.cost) || 0); }, by, `Updated ${changed.join(", ")}`), "Details saved");
    })}
  </>);
}

