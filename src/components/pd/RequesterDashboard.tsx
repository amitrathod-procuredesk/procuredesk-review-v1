import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ChevronRight, Minus, Package, PackageCheck, Plus, RotateCcw, Search, Undo2, AtSign, Stamp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Money, StatusBadge } from "@/components/pd/bits";
import { Select } from "@/components/pd/form";
import { smartDate, totals } from "@/lib/pd/engine";
import { stockFor } from "@/lib/pd/inventory";
import { createDraft, log, mutate, updateRequest, useDB, useMe } from "@/lib/pd/store";
import type { LineItem, PRequest, Status } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

/** Lifecycle used for the progress meter: Draft → Approval → Approved → Ordered → Received. */
const STEPS = ["Draft", "Approval", "Approved", "Ordered", "Received"];
const STEP_OF: Partial<Record<Status, number>> = { draft: 1, changes: 1, pending: 2, approved: 3, ordered: 4, partial: 4, received: 5, closed: 5 };
const OPEN: Status[] = ["draft", "changes", "pending", "approved", "ordered", "partial"];

type Kpi = { key: string; label: string; statuses: Status[]; dot: string };
const KPIS: Kpi[] = [
  { key: "open", label: "Open requests", statuses: OPEN, dot: "bg-muted-foreground/50" },
  { key: "draft", label: "Drafts", statuses: ["draft", "changes"], dot: "bg-muted-foreground/50" },
  { key: "pending", label: "Pending approval", statuses: ["pending"], dot: "bg-pending" },
  { key: "approved", label: "Approved", statuses: ["approved"], dot: "bg-success" },
  { key: "ordered", label: "Order created", statuses: ["ordered", "partial"], dot: "bg-transit" },
];

const GRID = "grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[16px_minmax(0,1fr)_150px_100px] md:grid-cols-[16px_minmax(0,1fr)_130px_150px_100px]";

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export function RequesterDashboard({ onOpenList, tabs, action }: { onOpenList: (status?: Status) => void; tabs?: ReactNode; action?: ReactNode }) {
  const db = useDB();
  const me = useMe()!;
  const nav = useNavigate();
  const [unit, setUnit] = useState("all");
  const [kpi, setKpi] = useState("open");
  const [q, setQ] = useState("");
  const [vq, setVq] = useState("");
  const [bq, setBq] = useState("");

  const mine = useMemo(() => db.requests.filter((r) => r.requesterId === me.id && (unit === "all" || r.businessUnit === unit)), [db, me.id, unit]);
  const active = KPIS.find((k) => k.key === kpi)!;
  const listed = mine
    .filter((r) => active.statuses.includes(r.status))
    .filter((r) => !q || `${r.id} ${r.title}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shown = listed.slice(0, 6);
  const [sel, setSel] = useState<string[]>([]);
  const cancelSelected = () => {
    let n = 0;
    mutate((d) => d.requests.forEach((r) => { if (sel.includes(r.id) && ["draft", "pending", "changes"].includes(r.status)) { r.status = "cancelled"; log(r, "Request cancelled", "system", me.id); n++; } }));
    toast(n ? `${n} request${n === 1 ? "" : "s"} cancelled` : "None of the selected requests can be cancelled", { description: n < sel.length ? `${sel.length - n} skipped — already approved or ordered` : undefined });
    setSel([]);
  };
  const drafts = mine.filter((r) => ["draft", "changes"].includes(r.status)).length;

  const open = (r: PRequest) => ["draft", "changes"].includes(r.status)
    ? nav({ to: "/app/requests/$id/edit", params: { id: r.id }, search: { prompt: undefined } })
    : nav({ to: "/app/requests/$id", params: { id: r.id } });

  // Needs attention — derived from my requests and mentions.
  const attention = useMemo(() => {
    const out: { id: string; r: PRequest; icon: typeof Undo2; text: string; tone: string }[] = [];
    db.requests.forEach((r) => {
      if (r.requesterId === me.id && r.status === "changes") out.push({ id: r.id + "c", r, icon: Undo2, text: "Returned for changes", tone: "text-attention" });
      if (r.requesterId === me.id && ["ordered", "partial"].includes(r.status)) out.push({ id: r.id + "d", r, icon: PackageCheck, text: "Delivery needs a receipt", tone: "text-transit" });
      if (r.route.some((s) => s.approvals.some((a) => a.userId === me.id && a.status === "pending")) && r.status === "pending") out.push({ id: r.id + "a", r, icon: Stamp, text: "Needs your approval", tone: "text-pending" });
      if (r.requesterId !== me.id && r.comments.some((c) => c.text.toLowerCase().includes(`@${me.name.split(" ")[0].toLowerCase()}`))) out.push({ id: r.id + "m", r, icon: AtSign, text: "You were mentioned", tone: "text-primary" });
    });
    return out.slice(0, 6);
  }, [db, me]);

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
        <div className="flex items-center gap-2">{tabs}{action}</div>
      </div>

      {/* Stat strip — one surface, each segment filters the list below */}
      <div className="pd-panel grid grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        {KPIS.map((k) => {
          const rs = mine.filter((r) => k.statuses.includes(r.status));
          const amt = k.key === "pending" ? rs.reduce((s, r) => s + totals(r).total, 0) : 0;
          const on = kpi === k.key;
          return (
            <button key={k.key} onClick={() => setKpi(k.key)} aria-pressed={on}
              className={cn("relative border-b border-r border-border/60 px-4 py-2.5 text-left transition-colors hover:bg-subtle lg:border-b-0", on && "bg-primary/[0.04]")}>
              {on && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-1.5 rounded-full", k.dot)} /><span className="truncate">{k.label}</span></span>
              <span className="flex items-baseline gap-1.5"><span className={cn("num text-xl font-semibold", on && "text-primary")}>{rs.length}</span>{amt > 0 && <Money v={amt} className="truncate text-[11px] text-muted-foreground" />}</span>
            </button>
          );
        })}
        <div className="col-span-full flex items-center px-3 py-2 lg:col-span-1">
          <Select aria-label="Business unit" className="h-8 w-full text-[13px] lg:w-36" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="all">All units</option>{db.org.businessUnits.map((b) => <option key={b}>{b}</option>)}</Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Requests */}
        <section className="pd-panel min-w-0">
          <header className="flex flex-wrap items-center gap-2 px-4 pt-4">
            <h2 className="text-sm font-semibold">{active.label}</h2>
            <span className="num rounded-full bg-subtle px-1.5 text-[11px] text-muted-foreground">{listed.length}</span>
            <div className="relative ml-auto w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input className="pd-input h-8 pl-8 text-[13px]" placeholder="Search requests" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </header>
          {sel.length > 0 ? (
            <div className="mx-4 mt-3 flex h-9 items-center gap-2 rounded-md bg-primary/5 px-3 text-[13px] animate-in fade-in">
              <span className="font-medium text-primary">{sel.length} selected</span>
              <button className="ml-2 rounded px-2 py-1 font-medium text-destructive hover:bg-destructive/10" onClick={cancelSelected}>Cancel eligible</button>
              <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSel([])}>Clear</button>
            </div>
          ) : null}
          {/* Column labels make each value self-explanatory */}
          <div className={cn(GRID, "mt-3 border-y border-border/60 bg-subtle/60 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground")}>
            <input type="checkbox" aria-label="Select all shown" disabled={!shown.length} checked={!!shown.length && shown.every((r) => sel.includes(r.id))} onChange={(e) => setSel(e.target.checked ? shown.map((r) => r.id) : [])} />
            <span>Request</span>
            <span className="hidden md:block">Business unit</span>
            <span className="hidden sm:block">Progress</span>
            <span className="text-right">Total</span>
          </div>
          <ul className="divide-y divide-border/60">
            {shown.map((r) => {
              const step = STEP_OF[r.status] ?? 0;
              const n = r.items.filter((i) => !i.declined).length;
              const picked = sel.includes(r.id);
              return (
                <li key={r.id} onClick={() => open(r)} className={cn(GRID, "cursor-pointer px-4 py-2.5 transition-colors hover:bg-subtle", picked && "bg-primary/[0.03]")}>
                  <input type="checkbox" aria-label={`Select ${r.id}`} checked={picked} onClick={(e) => e.stopPropagation()} onChange={() => setSel((x) => (picked ? x.filter((y) => y !== r.id) : [...x, r.id]))} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium" title={r.title}>{r.title || "Untitled request"}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="num">{r.id}</span>·<span>Updated {smartDate(r.updatedAt)}</span></span>
                  </span>
                  <span className="hidden truncate text-[13px] text-foreground/80 md:block">{r.businessUnit || "—"}</span>
                  <span className="hidden min-w-0 sm:block" title={STEPS.map((s, i) => `${i < step ? "✓" : "○"} ${s}`).join("\n")}>
                    <span className="flex items-center gap-2"><StatusBadge status={r.status} /><span className="num text-[11px] text-muted-foreground">{step ? `${step}/5` : ""}</span></span>
                    {step > 0 && <span className="mt-1.5 flex gap-0.5" aria-label={`Step ${step} of 5: ${STEPS[step - 1]}`}>{STEPS.map((s, i) => <span key={s} className={cn("h-1 flex-1 rounded-full", i < step ? (r.status === "changes" ? "bg-attention" : "bg-primary") : "bg-border")} />)}</span>}
                  </span>
                  <span className="text-right"><Money v={totals(r).total} className="text-sm font-medium" /><span className="block text-[11px] text-muted-foreground">{n} item{n === 1 ? "" : "s"}</span></span>
                </li>
              );
            })}
            {!listed.length && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No {active.label.toLowerCase()}{q && " match your search"}.</li>}
          </ul>
          {listed.length > 0 && (
            <button onClick={() => onOpenList(active.key === "open" ? undefined : active.statuses[0])} className="flex w-full items-center justify-center gap-1 border-t border-border/70 py-2.5 text-xs font-medium text-primary hover:bg-subtle">
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
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{a.r.title || "Untitled request"}</span><span className="block text-xs text-muted-foreground">{a.text}</span></span>
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
