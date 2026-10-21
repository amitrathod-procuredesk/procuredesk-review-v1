import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, Package, RotateCcw, Search, Undo2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TextInput } from "./form";
import { budgetStatuses, computeRoute, lineTotal, money, runChecks, smartDate, totals } from "@/lib/pd/engine";
import { converse, startConversation, type Msg, type ProcurementConversation } from "@/lib/pd/procurementAi";
import { createDraft, updateRequest, useDB, useMe } from "@/lib/pd/store";
import type { DB } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

function CatalogPicker({ db, query, active, onPick }: { db: DB; query: string; active: boolean; onPick: (id: string, name: string) => void }) {
  const [q, setQ] = useState(query);
  const [cat, setCat] = useState("All");
  const items = db.catalog.filter((c) => c.available);
  const cats = ["All", ...Array.from(new Set(items.map((c) => c.category)))];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = items.filter((c) => (cat === "All" || c.category === cat) && (!terms.length || terms.some((t) => `${c.name} ${c.category} ${c.keywords.join(" ")}`.toLowerCase().includes(t))));
  return <div className={cn("overflow-hidden rounded-lg border border-border bg-surface", !active && "pointer-events-none opacity-60")}>
    <div className="space-y-2 border-b border-border p-2">
      <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><TextInput aria-label="Search catalog" className="pl-8" placeholder="Search catalog…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="flex gap-1 overflow-x-auto pd-scroll-quiet">{cats.map((c) => <button key={c} type="button" onClick={() => setCat(c)} className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors", cat === c ? "border-primary/30 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{c}</button>)}</div>
    </div>
    <ul className="max-h-72 divide-y divide-border overflow-y-auto overscroll-contain">
      {rows.map((c) => { const v = db.vendors.find((x) => x.id === c.vendorId); return <li key={c.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-subtle/60">
        <Package className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{c.name}</p><p className="truncate text-[11px] text-muted-foreground">{v?.name ?? "No supplier"}{v?.preferred ? " · Preferred" : ""} · {c.category}</p></div>
        <span className="num shrink-0 text-xs">{money(c.price)}</span>
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-xs" onClick={() => onPick(c.id, c.name)}>Select</Button>
      </li>; })}
      {!rows.length && <li className="px-3 py-6 text-center text-xs text-muted-foreground">No catalog items match. Try another search or add it manually.</li>}
    </ul>
    <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">{rows.length} of {items.length} items</p>
  </div>;
}

export function ProcurementAI() {
  const db = useDB();
  const me = useMe();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<ProcurementConversation | null>(null);
  const [undo, setUndo] = useState<ProcurementConversation[]>([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const r = conversation?.request;
  const messages = conversation?.messages ?? [];
  const lastAi = useMemo(() => [...messages].reverse().find((m) => m.role === "ai"), [messages]);
  const lastIsAi = messages.at(-1)?.role === "ai";
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [messages.length, typing, open]);
  if (!me || me.role === "approver") return null;

  const send = (value: string, label?: string) => {
    if (!value.trim() || saving || typing) return;
    const current = conversation ?? startConversation(db, me.id);
    setUndo((h) => [...h, structuredClone(current)]);
    // Show the user's message immediately, then the reply after a short beat.
    setConversation({ ...current, messages: [...current.messages, { id: `u_${Date.now()}`, role: "user", text: label ?? value }] });
    setText("");
    setTyping(true);
    window.setTimeout(() => { setConversation(converse(db, current, value, label)); setTyping(false); input.current?.focus(); }, 550);
  };
  const restart = () => {
    if (messages.length && !window.confirm("Discard this proposal and start a new conversation?")) return;
    setConversation(null); setUndo([]); setText(""); setPreview(false);
  };
  const save = () => {
    if (!r?.items.length || saving) return;
    setSaving(true);
    const id = createDraft(me.id, false);
    const proposal = structuredClone(r);
    updateRequest(id, (draft) => {
      const created = draft.activity;
      Object.assign(draft, proposal, { id, requesterId: me.id, status: "draft", route: [], activity: [...created, ...proposal.activity], ai: { ...proposal.ai, messages: [], pending: null } });
    });
    setOpen(false); setConversation(null); setUndo([]); setSaving(false);
    toast.success("Draft created — review before submitting");
    void nav({ to: "/app/requests/$id/edit", params: { id }, search: { prompt: undefined } });
  };
  const hasItems = !!r?.items.length;
  const checks = hasItems && r ? runChecks(r, db).filter((c) => c.level !== "ok") : [];
  const budgets = r?.departmentId ? budgetStatuses(r, db) : [];
  const route = hasItems && r ? computeRoute(r, db) : [];
  const line = conversation?.line;
  const examples = ["I want to buy a laptop", "10 monitors for the design team", "A standing desk"];

  const interactive = (m: Msg) => m === lastAi && lastIsAi && !typing;
  const mark = <span className="pd-ai-mark size-8"><WandSparkles className="size-4" /></span>;

  return <>
    <Button size="sm" variant="outline" className="border-primary/25 bg-gradient-to-r from-accent to-surface text-primary" onClick={() => setOpen(true)}><span className="pd-ai-mark size-4"><WandSparkles className="!size-2.5" /></span> Procurement AI</Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className={cn("flex w-full flex-col gap-0 overflow-hidden bg-surface p-0 transition-[max-width] duration-300 ease-out", hasItems || line ? "sm:max-w-[min(940px,calc(100vw-48px))]" : "sm:max-w-[520px]")} onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }}>
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border/60 px-4 py-3 pr-12">
          {mark}
          <div className="min-w-0 flex-1"><SheetTitle className="text-sm font-semibold">Procurement AI</SheetTitle><SheetDescription className="text-[11px]">{db.org.name}</SheetDescription></div>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Start over" title="Start over" onClick={restart}><RotateCcw /></Button>
        </header>
        {(hasItems || line) && r && <div className="flex shrink-0 gap-1 border-b border-border px-4 py-1.5 md:hidden" role="tablist">
          {([[false, "Conversation"], [true, `Proposal · ${money(totals(r).total)}`]] as const).map(([v, label]) => <button key={String(v)} role="tab" aria-selected={preview === v} onClick={() => setPreview(v)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", preview === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}
        </div>}
        <div className={cn("flex min-h-0 flex-1 flex-col", (hasItems || line) && "md:grid md:grid-cols-[minmax(0,1fr)_340px]")}>
          <section aria-label="Procurement conversation" className={cn("flex min-h-0 min-w-0 flex-1 flex-col", preview && "hidden md:flex")}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
              {!messages.length ? <div className="flex min-h-full flex-col items-center justify-center pb-10 text-center">
                <span className="pd-ai-mark size-12"><WandSparkles className="size-6" /></span>
                <h2 className="mt-4 text-xl font-semibold tracking-tight">What do you need to buy?</h2>
                <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">Describe it naturally — I’ll check your catalog, budget and policies.</p>
              </div> : <div className="space-y-5" role="log" aria-label="Conversation messages" aria-live="polite">
                {messages.map((m) => <div key={m.id} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <div className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                    {m.role === "ai" && <span className="pd-ai-mark mt-0.5 size-6"><WandSparkles className="size-3" /></span>}
                    <p className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed", m.role === "user" ? "max-w-[80%] rounded-2xl rounded-br-md bg-subtle px-3.5 py-2 text-foreground" : "max-w-[92%] pt-0.5")}>{m.text}</p>
                  </div>
                  {m.role === "ai" && m.widget === "catalog" && <div className="mt-3 pl-9"><CatalogPicker db={db} query={m.query ?? ""} active={interactive(m)} onPick={(id, name) => send(id, name)} /></div>}
                  {m.role === "ai" && m.options && interactive(m) && <div className="mt-3 flex flex-wrap gap-1.5 pl-9">
                    {m.options.map((o) => <button key={o.value + o.label} type="button" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => send(o.value, o.label)}>{o.label}{o.hint && <span className="text-[10px] font-normal text-muted-foreground">{o.hint}</span>}</button>)}
                  </div>}
                  {m.role === "ai" && m.widget === "date" && interactive(m) && <div className="mt-2 max-w-[200px] pl-9"><label className="sr-only" htmlFor="ai-date">Choose a date</label><TextInput id="ai-date" type="date" min={new Date().toISOString().slice(0, 10)} onChange={(e) => { if (e.target.value) send(e.target.value, smartDate(e.target.value)); }} /></div>}
                </div>)}
                {typing && <div className="flex items-center gap-3" aria-label="Procurement AI is typing"><span className="pd-ai-mark size-6 animate-pulse"><WandSparkles className="size-3" /></span><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-primary/60 ai-thinking-dot" style={{ animationDelay: `${i * 150}ms` }} />)}</span></div>}
              </div>}
              <div ref={end} />
            </div>
            <form className="shrink-0 px-4 pb-3 pt-1" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              {!messages.length && <div className="mb-2.5 flex flex-wrap justify-center gap-1.5">{examples.map((e) => <button key={e} type="button" className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground" onClick={() => send(e)}>{e}</button>)}</div>}
              <label htmlFor="procurement-message" className="sr-only">Message Procurement AI</label>
              {/* Chat composer: borderless textarea inside one rounded surface, like modern AI assistants. */}
              <div className="rounded-2xl border border-border bg-surface shadow-sm transition-shadow focus-within:border-primary/40 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_12%,transparent)]">
                <textarea ref={input} id="procurement-message" rows={1} placeholder={conversation?.step === "pick" ? "Search the catalog or pick an item above…" : lastAi?.options ? "Choose an option or type your answer…" : "Ask Procurement AI…"} className="block max-h-40 min-h-[44px] w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none placeholder:text-muted-foreground [field-sizing:content]" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
                <div className="flex items-center justify-between px-2 pb-2">
                  {undo.length > 0 && !typing ? <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-xs text-muted-foreground" onClick={() => { const previous = undo.at(-1); if (previous) { setConversation(previous); setUndo((h) => h.slice(0, -1)); } }}><Undo2 /> Undo</Button> : <span />}
                  <Button type="submit" size="icon" className="size-8 rounded-full" aria-label="Send message" title="Send message" disabled={!text.trim() || saving || typing}><ArrowUp /></Button>
                </div>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">Uses your organization’s catalog and policies · You review before anything is submitted</p>
            </form>
          </section>
          {r && (hasItems || line) && <aside aria-label="Request proposal" className={cn("min-h-0 flex-1 flex-col border-border bg-subtle/40 md:flex md:border-l animate-in fade-in slide-in-from-right-4 duration-300", preview ? "flex" : "hidden")}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <p className="pd-section-title">Proposal</p>
              <ul className="mt-2 divide-y divide-border">
                {r.items.map((item) => <li key={item.id} className="py-2.5 animate-in fade-in"><p className="break-words text-xs font-medium">{item.qty} × {item.name || item.description}</p><div className="mt-0.5 flex justify-between gap-2 text-[11px] text-muted-foreground"><span>{db.vendors.find((v) => v.id === item.vendorId)?.name ?? "Supplier needed"}</span><span className="num shrink-0">{item.unitPrice > 0 ? money(lineTotal(item)) : "Price needed"}</span></div></li>)}
                {line && <li className="py-2.5"><p className="break-words text-xs font-medium text-muted-foreground">{line.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Being configured…</p></li>}
              </ul>
              {hasItems && <>
                <div className="flex justify-between border-t border-border pt-2.5 text-sm font-semibold"><span>Estimated total</span><span className="num">{money(totals(r).total)}</span></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  {r.departmentId && <div><dt className="text-muted-foreground">Department</dt><dd className="mt-0.5 font-medium">{db.departments.find((d) => d.id === r.departmentId)?.name}</dd></div>}
                  {r.requiredBy && <div><dt className="text-muted-foreground">Required by</dt><dd className="mt-0.5 font-medium">{smartDate(r.requiredBy)}</dd></div>}
                  {budgets.map((b) => <div key={b.budget.id} className="col-span-2"><dt className="text-muted-foreground">Budget</dt><dd className="mt-0.5 font-medium">{b.budget.name} <span className={cn("font-normal", b.over ? "text-destructive" : "text-success")}>· {b.over ? `${money(-b.remaining)} over` : `${money(b.remaining)} left`}</span></dd></div>)}
                  {route.length > 0 && <div className="col-span-2"><dt className="text-muted-foreground">Approvals</dt><dd className="mt-0.5">{route.map((s) => s.name).join(" → ")}</dd></div>}
                </dl>
                {r.departmentId && <div className="mt-4 border-t border-border pt-3">{checks.length ? checks.map((c) => <div key={c.id} className="mt-2 text-xs first:mt-0"><p className={c.level === "error" ? "text-attention" : "text-warning"}>{c.title}</p><p className="mt-0.5 leading-relaxed text-muted-foreground">{c.detail}</p></div>) : <p className="flex items-center gap-1.5 text-xs text-success"><Check className="size-3.5" /> All checks pass</p>}</div>}
              </>}
            </div>
            <footer className="shrink-0 border-t border-border p-3"><Button className="w-full" disabled={!hasItems || !!line || saving} onClick={save}>{saving ? "Creating draft…" : "Create draft & review"}<ArrowRight /></Button>{line && <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Finish the current item first</p>}</footer>
          </aside>}
        </div>
      </SheetContent>
    </Sheet>
  </>;
}
