import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeftRight, Check, LayoutList, LogIn, LogOut, ScanLine, Search, Table2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AssetThumb, BTN, BTN_GHOST, BTN_PRIMARY, Card, Field, HolderPick, HolderToggle, Seg, StatusPill, fmtDate, fmtDateTime, relDays } from "@/components/pd/assetUi";
import { Checkbox, Select, TextArea, TextInput } from "@/components/pd/form";
import {
  addDays, checkIn, checkOut, checkoutBlock, checkoutIssues, CONDITION_LABEL, daysUntil, holderName, openRepair, today,
  type Asset, type Condition, type Holder,
} from "@/lib/pd/assetRegister";
import { mutate, useDB, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/assets/checkout")({
  validateSearch: z.object({ mode: z.enum(["out", "in"]).optional(), asset: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Check in / out · ProcureDesk" },
      { name: "description", content: "Lend company assets to people or job sites and record their return and condition." },
      { property: "og:title", content: "Check in / out · ProcureDesk" },
      { property: "og:description", content: "Check assets out with a return date and check them back in with their condition." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutPage,
});

const CONDS = Object.entries(CONDITION_LABEL) as [Condition, string][];
const match = (a: Asset, q: string) => !q || [a.name, a.tag, a.identifier, a.assetTag, a.barcode, a.make, a.model].some((x) => x?.toLowerCase().includes(q));

function CheckoutPage() {
  const db = useDB();
  const me = useMe();
  const s = db.assets!;
  const all = db.assetItems ?? [];
  const nav = useNavigate({ from: "/app/assets/checkout" });
  const { mode = "out", asset } = Route.useSearch();
  const setMode = (m: "out" | "in") => nav({ search: { mode: m }, replace: true });
  const [layout, setLayout] = useState<Layout>("cards");

  const out = all.filter((a) => a.statusId === "checked_out" && a.checkout);
  const overdue = out.filter((a) => daysUntil(a.checkout!.due) < 0);
  const dueWeek = out.filter((a) => { const d = daysUntil(a.checkout!.due); return d >= 0 && d <= 7; });
  const lendable = all.filter((a) => !checkoutBlock(a, s));

  const recent = useMemo(() => all.flatMap((a) => a.history.filter((e) => e.kind === "checkout" || e.kind === "checkin").map((e) => ({ e, a })))
    .sort((x, y) => y.e.at.localeCompare(x.e.at)).slice(0, 8), [all]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <nav className="text-[12px] text-muted-foreground"><Link to="/app/assets/register" className="hover:text-foreground">Assets</Link> / Check in / out</nav>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Check in / out</h1>
            <p className="text-[13px] text-muted-foreground">Lend assets to a person or job site, and record them when they come back.</p>
          </div>
          <div role="tablist" aria-label="What do you want to do?" className="inline-flex rounded-lg border border-border bg-subtle p-0.5">
            <ModeTab active={mode === "out"} onClick={() => setMode("out")} icon={LogOut} title="Check out" meta={String(lendable.length)} />
            <ModeTab active={mode === "in"} onClick={() => setMode("in")} icon={LogIn} title="Check in" meta={String(out.length)} tone={overdue.length ? "danger" : undefined} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Available to lend" value={lendable.length} onClick={() => setMode("out")} />
        <Kpi label="Checked out" value={out.length} onClick={() => setMode("in")} />
        <Kpi label="Due in 7 days" value={dueWeek.length} tone={dueWeek.length ? "warning" : undefined} onClick={() => setMode("in")} />
        <Kpi label="Overdue" value={overdue.length} tone={overdue.length ? "danger" : undefined} onClick={() => setMode("in")} />
      </div>

      {mode === "out" ? <CheckOutFlow key="out" initial={asset} meId={me?.id} layout={layout} setLayout={setLayout} /> : <CheckInFlow key="in" initial={asset} meId={me?.id} layout={layout} setLayout={setLayout} />}

      <Card title="Recent activity" desc="Latest check-outs and returns across all assets.">
        {recent.length === 0 ? <p className="text-[13px] text-muted-foreground">Nothing yet. Check-outs and returns appear here.</p> : (
          <ul className="divide-y divide-border/70">
            {recent.map(({ e, a }) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-[13px]">
                <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full", e.kind === "checkout" ? "bg-primary/10 text-primary" : "bg-success-soft text-success")}>{e.kind === "checkout" ? <LogOut className="size-3.5" /> : <LogIn className="size-3.5" />}</span>
                <Link to="/app/assets/$assetId" params={{ assetId: a.id }} className="min-w-0 shrink truncate font-medium hover:underline">{a.name}</Link>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{e.text}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDateTime(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

type Layout = "cards" | "table";
type LayoutProps = { layout: Layout; setLayout: (l: Layout) => void };

function ModeTab({ active, onClick, icon: I, title, meta, tone }: { active: boolean; onClick: () => void; icon: typeof LogIn; title: string; meta: string; tone?: "danger" }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors", active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      <I className="size-3.5" />
      {title}
      <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{meta}</span>
    </button>
  );
}

function LayoutToggle({ layout, setLayout }: LayoutProps) {
  return (
    <div role="group" aria-label="Layout" className="inline-flex rounded-md border border-border bg-subtle/60 p-0.5">
      {([["cards", "Card view", LayoutList], ["table", "Table view", Table2]] as const).map(([k, l, I]) => (
        <button key={k} type="button" aria-label={l} title={l} aria-pressed={layout === k} onClick={() => setLayout(k)} className={cn("grid size-6 place-items-center rounded transition-colors", layout === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><I className="size-3.5" /></button>
      ))}
    </div>
  );
}

type PickerProps = { items: Asset[]; layout: Layout; selected: (a: Asset) => boolean; onToggle: (a: Asset) => void; disabled?: (a: Asset) => string | undefined; right?: (a: Asset) => React.ReactNode; rightLabel?: string; className?: string };

function AssetPicker({ items, layout, selected, onToggle, disabled, right, rightLabel = "Status", className }: PickerProps) {
  const db = useDB();
  if (layout === "cards") return <ul className={cn("divide-y divide-border/70 overflow-y-auto", className)}>{items.map((a) => <AssetRow key={a.id} a={a} selected={selected(a)} onToggle={() => onToggle(a)} disabled={disabled?.(a)} right={right?.(a)} />)}</ul>;
  return (
    <div className={cn("overflow-auto", className)}>
      <table className="pd-table min-w-[560px]">
        <thead><tr><th className="w-10" /><th>Asset</th><th>Asset ID</th><th>Location</th><th className="text-right">{rightLabel}</th></tr></thead>
        <tbody>
          {items.map((a) => {
            const dis = disabled?.(a); const on = selected(a);
            return (
              <tr key={a.id} onClick={() => !dis && onToggle(a)} aria-selected={on} className={cn(dis ? "cursor-not-allowed opacity-60" : "cursor-pointer", on && "bg-primary/5")}>
                <td><span className={cn("inline-flex size-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on && <Check className="size-3" />}</span></td>
                <td className="py-2"><span className="flex items-center gap-2"><AssetThumb a={a} /><span className="max-w-[200px] truncate text-[13px] font-medium">{a.name}</span></span></td>
                <td className="num whitespace-nowrap text-[12px]">{a.tag}{a.identifier && <span className="block text-muted-foreground">{a.identifier}</span>}</td>
                <td className="text-[13px]"><span className="block max-w-[160px] truncate">{a.site || "—"}</span></td>
                <td className="text-right">{right?.(a) ?? (dis ? <span className="text-[11px] text-muted-foreground">{dis}</span> : <StatusPill s={db.assets!.statuses.find((x) => x.id === a.statusId)} />)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, tone, onClick }: { label: string; value: number; tone?: "warning" | "danger"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="pd-panel p-3 text-left transition-colors hover:bg-subtle">
      <span className="block text-[12px] text-muted-foreground">{label}</span>
      <span className={cn("mt-0.5 block font-mono text-xl font-semibold tabular-nums", tone === "warning" && "text-warning", tone === "danger" && "text-destructive")}>{value}</span>
    </button>
  );
}

function AssetRow({ a, selected, onToggle, disabled, right }: { a: Asset; selected: boolean; onToggle: () => void; disabled?: string; right?: React.ReactNode }) {
  const db = useDB();
  const st = db.assets!.statuses.find((x) => x.id === a.statusId);
  return (
    <li>
      <button type="button" onClick={onToggle} disabled={!!disabled} aria-pressed={selected}
        className={cn("flex w-full items-center gap-3 px-3 py-2 text-left transition-colors", selected ? "bg-primary/5" : "hover:bg-subtle", disabled && "cursor-not-allowed opacity-60 hover:bg-transparent")}>
        <span className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded border", selected ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{selected && <Check className="size-3" />}</span>
        <AssetThumb a={a} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{a.name}</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground">{a.tag}{a.identifier ? ` · ${a.identifier}` : ""} · {a.site}</span>
        </span>
        {right ?? (disabled ? <span className="shrink-0 text-[11px] text-muted-foreground">{disabled}</span> : <StatusPill s={st} />)}
      </button>
    </li>
  );
}

function SearchBox({ q, setQ, placeholder }: { q: string; setQ: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <TextInput aria-label="Find asset" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-8 pr-8" />
      <ScanLine className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}

/* ─────────── Check out ─────────── */
function CheckOutFlow({ initial, meId, layout, setLayout }: { initial?: string; meId?: string } & LayoutProps) {
  const db = useDB();
  const s = db.assets!;
  const all = db.assetItems ?? [];
  const [q, setQ] = useState("");
  const [showBlocked, setShowBlocked] = useState(false);
  const [sel, setSel] = useState<string[]>(() => { const a = all.find((x) => x.id === initial); return a && !checkoutBlock(a, s) ? [a.id] : []; });
  const [kind, setKind] = useState<"user" | "site">("user");
  const [holder, setHolder] = useState<Holder | undefined>();
  const [due, setDue] = useState(addDays(today(), s.checkout.defaultDays));
  const [cond, setCond] = useState<Condition>("good");
  const [note, setNote] = useState("");
  const ack = true;
  const [tried, setTried] = useState(false);

  const needle = q.trim().toLowerCase();
  const live = all.filter((a) => a.statusId !== "disposed" && match(a, needle));
  const ok = live.filter((a) => !checkoutBlock(a, s));
  const blocked = live.filter((a) => checkoutBlock(a, s));
  const picked = all.filter((a) => sel.includes(a.id));
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const issues = checkoutIssues({ holder, due, ack, meId }, s);
  const shown = tried ? issues : {};
  const days = daysUntil(due);
  const people = db.users.map((u) => ({ id: u.id, name: u.name, title: u.title ?? "" }));

  const submit = () => {
    setTried(true);
    if (!picked.length) return toast.error("Choose at least one asset.");
    if (Object.keys(issues).length) return;
    const n = picked.length;
    mutate((d) => picked.forEach((a) => checkOut(d, a.id, holder!, due, s.checkout.requireCondition ? cond : a.condition, meId, note)));
    toast.success(`${n === 1 ? picked[0].name : `${n} assets`} checked out to ${holderName(holder, db)}`, { description: `Due back ${fmtDate(due)}` });
    setSel([]); setNote(""); setAck(false); setTried(false); setHolder(undefined);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card title="1. Choose assets" desc="Search by name, asset ID, serial or barcode. You can check out several at once." action={<LayoutToggle layout={layout} setLayout={setLayout} />}>
        <SearchBox q={q} setQ={setQ} placeholder="Search or scan an asset…" />
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          {ok.length === 0 ? <p className="p-4 text-center text-[13px] text-muted-foreground">{needle ? "No available asset matches your search." : "No assets are available to lend right now."}</p> : (
            <AssetPicker className="max-h-[420px]" items={ok} layout={layout} selected={(a) => sel.includes(a.id)} onToggle={(a) => toggle(a.id)} />
          )}
        </div>
        {blocked.length > 0 && (
          <div className="mt-2">
            <button type="button" onClick={() => setShowBlocked((v) => !v)} className="text-[12px] text-muted-foreground hover:text-foreground">{showBlocked ? "Hide" : "Show"} {blocked.length} that can't be checked out</button>
            {showBlocked && <div className="mt-2 overflow-hidden rounded-lg border border-border"><AssetPicker className="max-h-56" items={blocked} layout={layout} selected={() => false} onToggle={() => {}} disabled={(a) => checkoutBlock(a, s)} rightLabel="Reason" /></div>}
          </div>
        )}
      </Card>

      <Card title="2. Check-out details" className="lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-3">
          <div>
            <p className="pd-label">Selected</p>
            {picked.length === 0 ? <p className={cn("text-[13px]", tried ? "text-destructive" : "text-muted-foreground")}>No assets selected yet.</p> : (
              <div className="flex flex-wrap gap-1">{picked.map((a) => <span key={a.id} className="pd-chip h-6 gap-1 px-2 text-[11px]">{a.name}<button type="button" aria-label={`Remove ${a.name}`} onClick={() => toggle(a.id)}><X className="size-3" /></button></span>)}</div>
            )}
          </div>
          <Field label="Check out to" error={shown.holder}>
            <div className="mb-2"><HolderToggle v={kind} set={(k) => { setKind(k); setHolder(undefined); }} /></div>
            <HolderPick kind={kind} value={holder} people={people} onChange={setHolder} />
          </Field>
          <Field label="Due back" htmlFor="co-due" error={shown.due} hint={days > 0 ? `${relDays(days)} · max ${s.checkout.maxDays} days` : undefined}>
            <TextInput id="co-due" type="date" min={addDays(today(), 1)} max={addDays(today(), s.checkout.maxDays)} value={due} invalid={!!shown.due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1">{[1, 7, 14, 30].filter((n) => n <= s.checkout.maxDays).map((n) => <button key={n} type="button" onClick={() => setDue(addDays(today(), n))} data-active={due === addDays(today(), n)} className="pd-chip h-6 px-2 text-[11px]">{n === 1 ? "1 day" : `${n} days`}</button>)}</div>
          {s.checkout.requireCondition && (
            <Field label="Condition when it leaves" htmlFor="co-c"><Select id="co-c" value={cond} onChange={(e) => setCond(e.target.value as Condition)}>{CONDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          )}
          <Field label="Purpose (optional)" htmlFor="co-n"><TextArea id="co-n" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Site survey at Riverside Plaza" /></Field>
          {s.checkout.requireApproval && <p className="flex gap-1.5 rounded-md bg-warning-soft p-2 text-[12px] text-warning"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Your settings ask for manager approval on check-outs; it's recorded in the history.</p>}
          <button type="button" onClick={submit} className={cn(BTN_PRIMARY, "w-full")}><LogOut className="size-4" />Check out{picked.length > 1 ? ` ${picked.length} assets` : ""}</button>
        </div>
      </Card>
    </div>
  );
}

/* ─────────── Check in ─────────── */
type Ret = { cond: Condition; to: "available" | "in_repair"; note: string };

function CheckInFlow({ initial, meId, layout, setLayout }: { initial?: string; meId?: string } & LayoutProps) {
  const db = useDB();
  const all = db.assetItems ?? [];
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "overdue" | "week">("all");
  const [sel, setSel] = useState<string[]>(() => (all.some((a) => a.id === initial && a.statusId === "checked_out") ? [initial!] : []));
  const [ret, setRet] = useState<Record<string, Ret>>({});
  const [tried, setTried] = useState(false);

  const needle = q.trim().toLowerCase();
  const out = all.filter((a) => a.statusId === "checked_out" && a.checkout)
    .filter((a) => match(a, needle) || holderName(a.checkout!.to, db).toLowerCase().includes(needle))
    .filter((a) => { const d = daysUntil(a.checkout!.due); return filter === "all" || (filter === "overdue" ? d < 0 : d >= 0 && d <= 7); })
    .sort((x, y) => x.checkout!.due.localeCompare(y.checkout!.due));
  const picked = all.filter((a) => sel.includes(a.id) && a.checkout);
  const r = (a: Asset): Ret => ret[a.id] ?? { cond: a.checkout?.condition ?? "good", to: "available", note: "" };
  const setR = (id: string, p: Partial<Ret>) => setRet((x) => { const a = all.find((y) => y.id === id)!; const n = { ...r(a), ...p }; if (p.cond === "damaged" || p.cond === "poor") n.to = "in_repair"; return { ...x, [id]: n }; });
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const missing = picked.filter((a) => r(a).to === "in_repair" && !r(a).note.trim());

  const submit = () => {
    setTried(true);
    if (!picked.length) return toast.error("Choose at least one asset to check in.");
    if (missing.length) return;
    const repairs = picked.filter((a) => r(a).to === "in_repair").length;
    mutate((d) => picked.forEach((a) => { const x = r(a); checkIn(d, a.id, x.cond, "available", meId, x.to === "in_repair" ? undefined : x.note); if (x.to === "in_repair") openRepair(d, a.id, x.note.trim(), "normal", meId); }));
    toast.success(`${picked.length === 1 ? picked[0].name : `${picked.length} assets`} checked in`, { description: repairs ? `${repairs} sent for repair.` : "Back on the shelf and available." });
    setSel([]); setRet({}); setTried(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card title="1. Choose returning assets" desc="Overdue items come first. Search by asset or by who has it."
        action={<div className="flex items-center gap-2"><Seg label="Filter" value={filter} onChange={setFilter} options={[{ id: "all", label: "All" }, { id: "overdue", label: "Overdue" }, { id: "week", label: "Due soon" }]} /><LayoutToggle layout={layout} setLayout={setLayout} /></div>}>
        <SearchBox q={q} setQ={setQ} placeholder="Search, scan or type a name…" />
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          {out.length === 0 ? <p className="p-4 text-center text-[13px] text-muted-foreground">{needle || filter !== "all" ? "No checked-out asset matches." : "Nothing is checked out right now."}</p> : (
            <AssetPicker className="max-h-[420px]" items={out} layout={layout} rightLabel="With / due" selected={(a) => sel.includes(a.id)} onToggle={(a) => toggle(a.id)} right={(a) => {
              const d = daysUntil(a.checkout!.due);
              return (
                <span className="shrink-0 text-right text-[11px]">
                  <span className="block font-medium">{holderName(a.checkout!.to, db)}</span>
                  <span className={cn(d < 0 ? "text-destructive" : d <= 7 ? "text-warning" : "text-muted-foreground")}>{d < 0 ? `${-d} ${d === -1 ? "day" : "days"} overdue` : `Due ${relDays(d)}`}</span>
                </span>);
            }} />
          )}
        </div>
      </Card>

      <Card title="2. Return details" className="lg:sticky lg:top-4 lg:self-start">
        {picked.length === 0 ? <p className={cn("text-[13px]", tried ? "text-destructive" : "text-muted-foreground")}>Select the assets being returned.</p> : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {picked.map((a) => {
              const x = r(a); const late = -daysUntil(a.checkout!.due);
              const err = tried && x.to === "in_repair" && !x.note.trim();
              return (
                <div key={a.id} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground">From {holderName(a.checkout!.to, db)} · out since {fmtDate(a.checkout!.at)}{late > 0 && <span className="text-destructive"> · {late}d late</span>}</p>
                    </div>
                    <button type="button" aria-label={`Remove ${a.name}`} onClick={() => toggle(a.id)} className={BTN_GHOST + " h-6 px-1"}><X className="size-3.5" /></button>
                  </div>
                  <Field label="Condition on return" htmlFor={`ci-${a.id}`} hint={`Was ${CONDITION_LABEL[a.checkout!.condition].toLowerCase()} when it left.`}>
                    <Select id={`ci-${a.id}`} value={x.cond} onChange={(e) => setR(a.id, { cond: e.target.value as Condition })}>{CONDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </Field>
                  <Seg className="mt-2" label="Outcome" value={x.to} onChange={(v) => setR(a.id, { to: v })} options={[{ id: "available", label: "Ready to use" }, { id: "in_repair", label: "Needs repair" }]} />
                  <TextArea aria-label={x.to === "in_repair" ? "What's wrong" : "Note"} rows={2} className="mt-2" invalid={err} value={x.note} onChange={(e) => setR(a.id, { note: e.target.value })} placeholder={x.to === "in_repair" ? "What's wrong? (required)" : "Note (optional), e.g. charger missing"} />
                  {err && <p className="mt-1 text-xs text-destructive">Describe what's wrong so the repair can start.</p>}
                </div>
              );
            })}
          </div>
        )}
        <button type="button" onClick={submit} className={cn(BTN_PRIMARY, "mt-3 w-full")}><LogIn className="size-4" />Check in{picked.length > 1 ? ` ${picked.length} assets` : ""}</button>
        {picked.length > 0 && <button type="button" onClick={() => { setSel([]); setRet({}); }} className={cn(BTN, "mt-2 w-full")}><ArrowLeftRight className="size-4" />Clear selection</button>}
      </Card>
    </div>
  );
}
