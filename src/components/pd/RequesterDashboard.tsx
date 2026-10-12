import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Minus, Package, PackageCheck, Plus, RotateCcw, Search, Undo2, Truck, Building2, AtSign, Stamp, MoreHorizontal, ExternalLink, Copy, Printer, Trash2, XCircle } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Money, StatusBadge } from "@/components/pd/bits";
import { Select } from "@/components/pd/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { smartDate, totals, viewStatus, type ViewStatus } from "@/lib/pd/engine";
import { stockFor } from "@/lib/pd/inventory";
import { copyRequest, createDraft, log, mutate, updateRequest, useDB, useMe } from "@/lib/pd/store";
import type { LineItem, PRequest, Status } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

/** Lifecycle used for the progress meter: Draft → Approval → Approved → Ordered → Received. */
const STEPS = ["Draft", "Approval", "Approved", "Ordered", "Received"];
const STEP_OF: Partial<Record<Status, number>> = { draft: 1, changes: 1, pending: 2, approved: 3, order_deleted: 3, ordered: 4, part_ordered: 4, partial: 4, received: 5, closed: 5 };

/** Status tabs: frequent states inline, rare/terminal ones under "More" (Coupa/Ariba-style overflow). */
type Tab = { key: ViewStatus | "all"; label: string };
const PRIMARY_TABS: Tab[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "changes", label: "Sent to requestor" },
  { key: "pending", label: "Pending approval" },
  { key: "approved", label: "Approved" },
  { key: "ordered", label: "Order created" },
];
const MORE_TABS: Tab[] = [
  { key: "part_approved", label: "Partially approved" },
  { key: "part_ordered", label: "Partially ordered" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
  { key: "order_deleted", label: "Order deleted" },
];
const ALL_TABS = [...PRIMARY_TABS, ...MORE_TABS];
const inTab = (r: PRequest, k: Tab["key"]) => k === "all" || viewStatus(r) === k;

const TAB = "relative flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30";
const GRID = "grid grid-cols-[16px_minmax(280px,1fr)_140px_170px_104px_120px_44px] items-center gap-x-4";
/** Pinned last column; a soft left edge signals rows scroll beneath it. */
const PIN = "sticky right-0 z-[1] -mr-4 flex items-center justify-center self-stretch border-l border-border/60 pr-4 pl-2";

/** Who the request is currently waiting on, derived from status and the live approval route. */
function waitingOn(r: PRequest, meId: string, users: { id: string; name: string }[]): { who: string; what?: string; you?: boolean; ids?: string[]; kind?: "team" | "supplier" | "none" } {
  const name = (id: string) => (id === meId ? "You" : users.find((u) => u.id === id)?.name ?? "Approver");
  const mine = r.requesterId === meId;
  switch (r.status) {
    case "draft": return mine ? { who: "You", what: "Complete & submit", you: true, ids: [meId] } : { who: name(r.requesterId), what: "Completing draft", ids: [r.requesterId] };
    case "changes": return mine ? { who: "You", what: "Address requested changes", you: true, ids: [meId] } : { who: name(r.requesterId), what: "Making changes", ids: [r.requesterId] };
    case "pending": {
      const stage = r.route.find((s) => s.approvals.some((a) => a.status === "pending"));
      const ids = stage?.approvals.filter((a) => a.status === "pending").map((a) => a.userId) ?? [];
      if (!ids.length) return { who: "Approvers", what: "Approval" };
      return { who: ids.length > 1 ? `${name(ids[0])} +${ids.length - 1}` : name(ids[0]), what: `${stage?.name ?? "Approval"}${ids.length > 1 ? (stage?.mode === "any" ? " · any one" : " · all") : ""}`, you: ids.includes(meId), ids };
    }
    case "approved": return { who: "Procurement", what: "Create purchase order", kind: "team" };
    case "ordered": return { who: "Supplier", what: "Delivery", kind: "supplier" };
    case "part_ordered": return { who: "Procurement", what: "Order remaining items", kind: "team" };
    case "order_deleted": return { who: "Procurement", what: "Re-create order", kind: "team" };
    case "partial": return { who: "Supplier", what: "Remaining delivery", kind: "supplier" };
    default: return { who: "—", what: "Nothing pending", kind: "none" };
  }
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
const AV = "grid size-6 shrink-0 place-items-center overflow-hidden rounded-full text-[10px] font-semibold ring-2 ring-card";
/** Small avatar(s) for who a request waits on — photo when available, initials otherwise, icon for teams. */
function WaitAvatar({ w, users }: { w: ReturnType<typeof waitingOn>; users: { id: string; name: string; avatar?: string }[] }) {
  if (!w.ids?.length) {
    const Icon = w.kind === "supplier" ? Truck : w.kind === "team" ? Building2 : Minus;
    return <span aria-hidden className={cn(AV, "bg-subtle text-muted-foreground")}><Icon className="size-3" /></span>;
  }
  const list = w.ids.slice(0, 2).map((id) => users.find((u) => u.id === id)).filter(Boolean) as { id: string; name: string; avatar?: string }[];
  return (
    <span aria-hidden className="flex shrink-0 -space-x-1.5">
      {list.map((u) => u.avatar
        ? <img key={u.id} src={u.avatar} alt="" className={cn(AV, "object-cover")} />
        : <span key={u.id} className={cn(AV, w.you ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")}>{initials(u.name)}</span>)}
    </span>
  );
}

/** Per-row actions; only actions valid for the request's status are offered. */
function RowActions({ r, onOpen }: { r: PRequest; onOpen: () => void }) {
  const me = useMe()!;
  const nav = useNavigate();
  const isDraft = ["draft", "changes"].includes(r.status);
  const cancellable = r.status === "pending";
  const remove = () => {
    if (!window.confirm(`Delete draft ${r.id}? This can't be undone.`)) return;
    mutate((d) => { d.requests = d.requests.filter((x) => x.id !== r.id); });
    toast.success("Draft deleted");
  };
  const cancel = () => {
    if (!window.confirm(`Cancel ${r.id}? Approvers will no longer see it.`)) return;
    updateRequest(r.id, (x) => { x.status = "cancelled"; log(x, "Request cancelled", "system", me.id); });
    toast.success("Request cancelled");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Actions for ${r.id}`} className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 data-[state=open]:bg-background data-[state=open]:text-foreground">
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 text-[13px]">
        <DropdownMenuItem onSelect={onOpen}><ExternalLink className="size-3.5" />{isDraft ? "Continue editing" : "Open"}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { const id = copyRequest(r.id, me.id); toast.success("Copied as new draft"); nav({ to: "/app/requests/$id/edit", params: { id }, search: { prompt: undefined } }); }}><Copy className="size-3.5" />Duplicate</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { nav({ to: "/app/requests/$id", params: { id: r.id } }).then(() => setTimeout(() => window.print(), 300)); }}><Printer className="size-3.5" />Print</DropdownMenuItem>
        {(isDraft || cancellable) && <DropdownMenuSeparator />}
        {cancellable && <DropdownMenuItem onSelect={cancel} className="text-destructive focus:text-destructive"><XCircle className="size-3.5" />Cancel request</DropdownMenuItem>}
        {isDraft && <DropdownMenuItem onSelect={remove} className="text-destructive focus:text-destructive"><Trash2 className="size-3.5" />Delete draft</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export function RequesterDashboard({ onOpenList, tabs, action }: { onOpenList: (status?: ViewStatus) => void; tabs?: ReactNode; action?: ReactNode }) {
  const db = useDB();
  const me = useMe()!;
  const nav = useNavigate();
  const [unit, setUnit] = useState("all");
  const [kpi, setKpi] = useState<Tab["key"]>("all");
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [vq, setVq] = useState("");
  const [bq, setBq] = useState("");

  const mine = useMemo(() => db.requests.filter((r) => r.requesterId === me.id && (unit === "all" || r.businessUnit === unit)), [db, me.id, unit]);
  const active = ALL_TABS.find((k) => k.key === kpi)!;
  const listed = mine
    .filter((r) => inTab(r, kpi))
    .filter((r) => !q || `${r.id} ${r.title}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shown = listed.slice(0, 6);
  const [sel, setSel] = useState<string[]>([]);
  const eligible = sel.filter((id) => (db.requests.find((r) => r.id === id)?.status ?? "") && ["approved", "order_deleted"].includes(db.requests.find((r) => r.id === id)!.status));
  const createOrders = () => {
    if (!eligible.length) return;
    mutate((d) => d.requests.forEach((r) => { if (eligible.includes(r.id) && ["approved", "order_deleted"].includes(r.status)) { r.status = "ordered"; r.updatedAt = new Date().toISOString(); log(r, "Purchase order created", "system", me.id); } }));
    const skipped = sel.length - eligible.length;
    toast.success(`${eligible.length} order${eligible.length === 1 ? "" : "s"} created`, { description: skipped ? `${skipped} skipped — only approved requests can be ordered` : undefined });
    setSel([]);
  };
  const drafts = mine.filter((r) => ["draft", "changes"].includes(r.status)).length;

  const open = (r: PRequest) => ["draft", "changes"].includes(r.status)
    ? nav({ to: "/app/requests/$id/edit", params: { id: r.id }, search: { prompt: undefined } })
    : nav({ to: "/app/requests/$id", params: { id: r.id } });

  // Needs attention — derived from my requests and mentions.
  const attention = useMemo(() => {
    const out: { id: string; r: PRequest; icon: typeof Undo2; text: string; tone: string }[] = [];
    db.requests.filter((r) => unit === "all" || r.businessUnit === unit).forEach((r) => {
      if (r.requesterId === me.id && r.status === "changes") out.push({ id: r.id + "c", r, icon: Undo2, text: "Returned for changes", tone: "text-attention" });
      if (r.requesterId === me.id && ["ordered", "partial"].includes(r.status)) out.push({ id: r.id + "d", r, icon: PackageCheck, text: "Delivery needs a receipt", tone: "text-transit" });
      if (r.route.some((s) => s.approvals.some((a) => a.userId === me.id && a.status === "pending")) && r.status === "pending") out.push({ id: r.id + "a", r, icon: Stamp, text: "Needs your approval", tone: "text-pending" });
      if (r.requesterId !== me.id && r.comments.some((c) => c.text.toLowerCase().includes(`@${me.name.split(" ")[0].toLowerCase()}`))) out.push({ id: r.id + "m", r, icon: AtSign, text: "You were mentioned", tone: "text-primary" });
    });
    return out.slice(0, 6);
  }, [db, me, unit]);

  // Vendors I buy from, with catalog item counts.
  const vendors = useMemo(() => {
    const used = new Map<string, number>();
    mine.forEach((r) => r.items.forEach((i) => used.set(i.vendorId, (used.get(i.vendorId) ?? 0) + 1)));
    return db.vendors
      .filter((v) => used.has(v.id) || v.preferred)
      .map((v) => ({ v, items: db.catalog.filter((c) => c.vendorId === v.id).length, used: used.get(v.id) ?? 0 }))
      .filter((x) => x.v.name.toLowerCase().includes(vq.toLowerCase()))
      .sort((a, b) => b.used - a.used);
  }, [db, mine, vq]);

  // Buy again — distinct items from my past requests, latest first.
  const buyAgain = useMemo(() => {
    const seen = new Map<string, { line: LineItem; at: string }>();
    [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach((r) => r.items.forEach((l) => {
      const k = l.catalogId ?? l.description.toLowerCase();
      if (!seen.has(k)) seen.set(k, { line: l, at: r.createdAt });
    }));
    return [...seen.values()].filter(({ line }) => `${line.name ?? ""} ${line.description}`.toLowerCase().includes(bq.toLowerCase()));
  }, [mine, bq]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{greet()}, {me.name.split(" ")[0]}</h1>
          <p className="truncate text-[13px] text-muted-foreground">{drafts ? <>You have <button className="font-medium text-primary hover:underline" onClick={() => setKpi("draft")}>{drafts} draft{drafts === 1 ? "" : "s"}</button> to submit</> : "All your drafts are submitted"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select aria-label="Business unit" title="Applies to the whole dashboard" className={cn("h-8 w-44 text-[13px]", unit !== "all" && "border-primary/50 text-primary")} value={unit} onChange={(e) => { setUnit(e.target.value); setSel([]); }}><option value="all">All business units</option>{db.org.businessUnits.map((b) => <option key={b}>{b}</option>)}</Select>
          {tabs}{action}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Requests */}
        <section className="pd-panel min-w-0">
          {/* One quiet row: status tabs filter the table, search on the right */}
          <header className="flex items-end gap-3 border-b border-border/60 px-4 pt-2">
            <div role="tablist" aria-label="Filter by status" className="pd-scroll-hide flex min-w-0 flex-1 gap-4 overflow-x-auto">
              {PRIMARY_TABS.map((k) => {
                const n = mine.filter((r) => inTab(r, k.key)).length;
                const on = kpi === k.key;
                return (
                  <button key={k.key} role="tab" aria-selected={on} onClick={() => { setKpi(k.key); setSel([]); }} className={cn(TAB, on ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {k.label}<span className={cn("num text-[11px]", on ? "text-primary" : "text-muted-foreground/70")}>{n}</span>
                    {on && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
                  </button>
                );
              })}
              {(() => {
                const picked = MORE_TABS.find((k) => k.key === kpi);
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger className={cn(TAB, picked ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {picked ? <>{picked.label}<span className="num text-[11px] text-primary">{mine.filter((r) => inTab(r, picked.key)).length}</span></> : "More"}
                      <ChevronDown className="size-3.5" />
                      {picked && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52 text-[13px]">
                      {MORE_TABS.map((k) => {
                        const n = mine.filter((r) => inTab(r, k.key)).length;
                        return (
                          <DropdownMenuItem key={k.key} onSelect={() => { setKpi(k.key); setSel([]); }} className={cn("justify-between", kpi === k.key && "font-medium text-primary")}>
                            <span className="flex items-center gap-2"><span className={cn("pd-badge !h-auto !bg-transparent !p-0", `st-${k.key}`)} aria-hidden />{k.label}</span>
                            <span className="num text-[11px] text-muted-foreground">{n}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })()}
            </div>
            {/* Search collapses to an icon so all status tabs stay visible */}
            {searchOpen || q ? (
              <div className="relative mb-1.5 w-40 shrink-0 animate-in fade-in">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input autoFocus className="pd-input h-7 pl-8 text-[13px]" placeholder="Search requests" aria-label="Search requests" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setSearchOpen(false)} onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setSearchOpen(false); } }} />
              </div>
            ) : (
              <button type="button" aria-label="Search requests" title="Search requests" onClick={() => setSearchOpen(true)} className="mb-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"><Search className="size-4" /></button>
            )}
          </header>
          {sel.length > 0 ? (
            <div className="mx-4 mt-2 flex h-9 items-center gap-2 rounded-md bg-primary/5 px-3 text-[13px] animate-in fade-in">
              <span className="font-medium text-primary">{sel.length} selected</span>
              <button disabled={!eligible.length} title={eligible.length ? undefined : "Only approved requests can be ordered"} className="ml-2 rounded px-2 py-1 font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent" onClick={createOrders}>Create order{eligible.length ? ` (${eligible.length})` : ""}</button>
              {eligible.length < sel.length && <span className="text-xs text-muted-foreground">{sel.length - eligible.length} not approved</span>}
              <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSel([])}>Clear</button>
            </div>
          ) : null}
          {/* Scrolls horizontally when space is short; Business unit stays pinned on the right */}
          <div className={cn("overflow-x-auto", sel.length > 0 && "mt-2")}>
            {/* Fill the card; below the grid's summed minimum (columns + gaps + padding) scroll instead. */}
            <div className="min-w-[1002px]">
              <div className={cn(GRID, "border-b border-border/60 bg-subtle h-8 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground")}>
                <input type="checkbox" aria-label="Select all shown" disabled={!shown.length} checked={!!shown.length && shown.every((r) => sel.includes(r.id))} onChange={(e) => setSel(e.target.checked ? shown.map((r) => r.id) : [])} />
                <span>Request</span>
                <span>Progress</span>
                <span>Waiting on</span>
                <span className="text-right">Total</span>
                <span>Business unit</span>
                <span className={cn(PIN, "bg-subtle")}><span className="sr-only">Actions</span></span>
              </div>
              <ul className="divide-y divide-border/60">
                {shown.map((r) => {
                  const step = STEP_OF[r.status] ?? 0;
                  const pct = Math.round((step / STEPS.length) * 100);
                  const n = r.items.filter((i) => !i.declined).length;
                  const picked = sel.includes(r.id);
                  const w = waitingOn(r, me.id, db.users);
                  const tone = r.status === "changes" ? "bg-attention" : r.status === "pending" ? "bg-pending" : step >= 3 ? "bg-success" : "bg-primary";
                  return (
                    <li key={r.id} onClick={() => open(r)} className={cn(GRID, "group min-h-[60px] cursor-pointer bg-card px-4 py-2 transition-colors hover:bg-subtle")}>
                      <input type="checkbox" aria-label={`Select ${r.id}`} checked={picked} onClick={(e) => e.stopPropagation()} onChange={() => setSel((x) => (picked ? x.filter((y) => y !== r.id) : [...x, r.id]))} />
                      <span className="min-w-0">
                        <span className="line-clamp-2 break-words text-sm font-medium leading-5" title={r.title}>{r.title || "Untitled request"}</span>
                        <span className="block truncate whitespace-nowrap text-xs text-muted-foreground"><span className="num">{r.id}</span> · {smartDate(r.updatedAt)}</span>
                      </span>
                      <span className="min-w-0" title={STEPS.map((s, i) => `${i < step ? "✓" : "○"} ${s}`).join("\n")}>
                        <StatusBadge r={r} />
                        {step > 0 && (
                          <span className="mt-1.5 flex items-center gap-2" aria-label={`${pct}% complete`}>
                            <span className="h-1 flex-1 overflow-hidden rounded-full bg-border"><span className={cn("block h-full rounded-full", tone)} style={{ width: `${pct}%` }} /></span>
                            <span className="num w-7 text-right text-[11px] text-muted-foreground">{pct}%</span>
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <WaitAvatar w={w} users={db.users} />
                        <span className="min-w-0">
                        <span className={cn("block truncate text-[13px]", w.you ? "font-medium text-primary" : "text-foreground/85")} title={w.who}>{w.who}</span>
                        {w.what && <span className="block truncate text-[11px] text-muted-foreground" title={w.what}>{w.what}</span>}
                        </span>
                      </span>
                      <span className="text-right"><Money v={totals(r).total} className="text-sm font-medium" /><span className="block text-[11px] text-muted-foreground">{n} item{n === 1 ? "" : "s"}</span></span>
                      <span className="truncate text-[13px] text-foreground/80" title={r.businessUnit}>{r.businessUnit || "—"}</span>
                      <span className={cn(PIN, "bg-card group-hover:bg-subtle")} onClick={(e) => e.stopPropagation()}><RowActions r={r} onOpen={() => open(r)} /></span>
                    </li>
                  );
                })}
                {!listed.length && <li className="px-4 py-10 text-center text-sm text-muted-foreground">{kpi === "all" ? "No requests" : `No ${active.label.toLowerCase()} requests`}{q && " match your search"}.</li>}
              </ul>
            </div>
          </div>
          {listed.length > 0 && (
            <button onClick={() => onOpenList(kpi === "all" ? undefined : kpi)} className="flex w-full items-center justify-center gap-1 border-t border-border/70 py-2.5 text-xs font-medium text-primary hover:bg-subtle">
              View all {listed.length} in list <ArrowRight className="size-3.5" />
            </button>
          )}
        </section>

        {/* Needs attention */}
        <section className="pd-panel">
          <h2 className="px-4 pt-4 text-sm font-semibold">Needs your attention</h2>
          {attention.length ? (
            <ul className="mt-2 px-2 pb-2">
              {attention.map((a) => (
                <li key={a.id}>
                  <button onClick={() => open(a.r)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-subtle">
                    <a.icon className={cn("size-4 shrink-0", a.tone)} />
                    <span className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-[13px] font-medium" title={a.r.title}>{a.r.title || "Untitled request"}</span><span className="block text-xs text-muted-foreground">{a.text}</span></span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 pb-5 pt-6 text-center">
              <CheckCircle2 className="mx-auto size-8 text-success" strokeWidth={1.5} />
              <p className="mt-2 text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground">Nothing needs you right now.</p>
              <ul className="mt-4 space-y-1.5 rounded-md bg-subtle px-3 py-3 text-left text-xs text-muted-foreground">
                <li className="text-[11px] font-medium">Items show here when:</li>
                <li className="flex items-center gap-2"><Stamp className="size-3.5" />Something needs your approval</li>
                <li className="flex items-center gap-2"><AtSign className="size-3.5" />Someone mentions you</li>
                <li className="flex items-center gap-2"><Undo2 className="size-3.5" />A request of yours is returned</li>
                <li className="flex items-center gap-2"><PackageCheck className="size-3.5" />A delivery needs a receipt</li>
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Vendors */}
        <section className="pd-panel">
          <header className="flex items-center gap-2 px-4 pt-4">
            <h2 className="text-sm font-semibold">Your vendors</h2>
            <div className="relative ml-auto w-36"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input className="pd-input h-8 pl-8 text-[13px]" placeholder="Search" value={vq} onChange={(e) => setVq(e.target.value)} /></div>
          </header>
          <ul className="mt-2 max-h-80 overflow-y-auto px-2 pb-2">
            {vendors.map(({ v, items }) => (
              <li key={v.id} className="flex items-center gap-3 rounded-md px-2 py-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-subtle text-[11px] font-semibold text-foreground/70">{v.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{v.name}</span><span className="block text-xs text-muted-foreground">Catalog · {items} item{items === 1 ? "" : "s"}{v.preferred && " · Preferred"}</span></span>
              </li>
            ))}
            {!vendors.length && <li className="px-2 py-6 text-center text-xs text-muted-foreground">No vendors found.</li>}
          </ul>
        </section>

        {/* Buy again */}
        <section className="pd-panel min-w-0">
          <header className="flex items-center gap-2 px-4 pt-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><RotateCcw className="size-3.5 text-muted-foreground" />Buy again</h2>
            <div className="relative ml-auto w-44"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input className="pd-input h-8 pl-8 text-[13px]" placeholder="Search items" value={bq} onChange={(e) => setBq(e.target.value)} /></div>
          </header>
          <ul className="mt-2 max-h-80 divide-y divide-border/70 overflow-y-auto px-2 pb-2">
            {buyAgain.map(({ line, at }) => <BuyAgainRow key={line.id} line={line} at={at} />)}
            {!buyAgain.length && <li className="px-2 py-8 text-center text-xs text-muted-foreground">Items from your past requests show here.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function BuyAgainRow({ line, at }: { line: LineItem; at: string }) {
  const db = useDB();
  const me = useMe()!;
  const nav = useNavigate();
  const [qty, setQty] = useState(line.qty);
  const vendor = db.vendors.find((v) => v.id === line.vendorId)?.name;
  const stock = stockFor(line.catalogId);
  const reorder = () => {
    const id = createDraft(me.id, true);
    updateRequest(id, (r) => {
      r.title = line.name ?? line.description;
      r.items.push({ ...line, id: `l_${Date.now()}`, qty, declined: undefined, fulfillment: "purchase" });
      log(r, `Reordered "${line.name ?? line.description}" × ${qty}`, "create", me.id);
    });
    toast.success("Draft created", { description: "Review the details, then submit." });
    nav({ to: "/app/requests/$id/edit", params: { id }, search: { prompt: undefined } });
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-2 py-2.5 sm:flex-nowrap">
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-subtle text-muted-foreground">
        {line.imageUrl ? <img src={line.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-4" strokeWidth={1.5} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{line.name ?? line.description}</span>
        <span className="block truncate text-xs text-muted-foreground">{stock && stock.onHand > 0 && <span className="text-success">{stock.onHand} in stock · </span>}{vendor} · {smartDate(at)}</span>
      </span>
      <Money v={line.unitPrice} className="w-20 text-right text-[13px]" />
      <span className="inline-flex h-8 items-center rounded-md border border-border">
        <button aria-label="Decrease" disabled={qty <= 1} onClick={() => setQty((x) => Math.max(1, x - 1))} className="grid size-7 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"><Minus className="size-3" /></button>
        <span className="num w-7 text-center text-[13px]">{qty}</span>
        <button aria-label="Increase" onClick={() => setQty((x) => x + 1)} className="grid size-7 place-items-center text-muted-foreground hover:text-foreground"><Plus className="size-3" /></button>
      </span>
      <button onClick={reorder} className="h-8 shrink-0 rounded-md border border-border px-3 text-[13px] font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5">Reorder</button>
    </li>
  );
}
