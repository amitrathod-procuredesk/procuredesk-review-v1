import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, Package, RotateCcw, Search, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TextArea, TextInput } from "./form";
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
  const mark = <span className="grid size-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-accent-foreground text-primary-foreground"><Sparkles className="size-3.5" /></span>;

  return <>
    <Button size="sm" variant="outline" className="border-primary/25 bg-gradient-to-r from-accent to-surface text-primary" onClick={() => setOpen(true)}><Sparkles /> Procurement AI</Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className={cn("flex w-full flex-col gap-0 overflow-hidden bg-surface p-0 transition-[max-width] duration-300 ease-out", hasItems || line ? "sm:max-w-[min(940px,calc(100vw-48px))]" : "sm:max-w-[520px]")} onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }}>
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border bg-gradient-to-b from-accent/60 to-surface px-4 py-3 pr-12">
          {mark}
          <div className="min-w-0 flex-1"><SheetTitle className="text-sm font-semibold">Procurement AI</SheetTitle><SheetDescription className="text-[11px]">Nothing is submitted without your review</SheetDescription></div>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Start over" title="Start over" onClick={restart}><RotateCcw /></Button>
        </header>
        {(hasItems || line) && r && <div className="flex shrink-0 gap-1 border-b border-border px-4 py-1.5 md:hidden" role="tablist">
          {([[false, "Conversation"], [true, `Proposal · ${money(totals(r).total)}`]] as const).map(([v, label]) => <button key={String(v)} role="tab" aria-selected={preview === v} onClick={() => setPreview(v)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", preview === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}
        </div>}
        <div className={cn("flex min-h-0 flex-1 flex-col", (hasItems || line) && "md:grid md:grid-cols-[minmax(0,1fr)_340px]")}>
          <section aria-label="Procurement conversation" className={cn("flex min-h-0 min-w-0 flex-1 flex-col", preview && "hidden md:flex")}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
              {!messages.length ? <div className="flex min-h-full flex-col justify-center pb-6">
                <h2 className="text-lg font-semibold">What do you need to buy?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Describe it in your own words. I’ll check your catalog, budget and policies as we go.</p>
                <div className="mt-5 space-y-1.5">{examples.map((e) => <Button key={e} variant="outline" className="h-auto w-full justify-between whitespace-normal px-3 py-2.5 text-left text-xs font-normal" onClick={() => send(e)}>{e}<ArrowRight className="text-muted-foreground" /></Button>)}</div>
              </div> : <div className="space-y-4" role="log" aria-label="Conversation messages" aria-live="polite">
                {messages.map((m) => <div key={m.id} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <div className={cn("flex gap-2.5", m.role === "user" && "justify-end")}>
                    {m.role === "ai" && <Sparkles className="mt-1 size-3.5 shrink-0 text-primary" />}
                    <p className={cn("max-w-[88%] whitespace-pre-wrap break-words text-sm leading-relaxed", m.role === "user" ? "rounded-lg bg-accent px-3 py-2 text-accent-foreground" : "pt-0.5")}>{m.text}</p>
                  </div>
                  {m.role === "ai" && m.widget === "catalog" && <div className="mt-2.5 pl-6"><CatalogPicker db={db} query={m.query ?? ""} active={interactive(m)} onPick={(id, name) => send(id, name)} /></div>}
                  {m.role === "ai" && m.options && interactive(m) && <div className="mt-2.5 flex flex-wrap gap-1.5 pl-6">
                    {m.options.map((o) => <Button key={o.value + o.label} size="sm" variant="outline" className="h-auto gap-1.5 whitespace-normal py-1.5 text-xs hover:border-primary/40" onClick={() => send(o.value, o.label)}>{o.label}{o.hint && <span className="text-[10px] font-normal text-muted-foreground">{o.hint}</span>}</Button>)}
                  </div>}
                  {m.role === "ai" && m.widget === "date" && interactive(m) && <div className="mt-2 max-w-[200px] pl-6"><label className="sr-only" htmlFor="ai-date">Choose a date</label><TextInput id="ai-date" type="date" min={new Date().toISOString().slice(0, 10)} onChange={(e) => { if (e.target.value) send(e.target.value, smartDate(e.target.value)); }} /></div>}
                </div>)}
                {typing && <div className="flex items-center gap-2.5" aria-label="Procurement AI is typing"><Sparkles className="size-3.5 text-primary" /><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-primary/60 ai-thinking-dot" style={{ animationDelay: `${i * 150}ms` }} />)}</span></div>}
              </div>}
              <div ref={end} />
            </div>
            <form className="shrink-0 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <label htmlFor="procurement-message" className="sr-only">Message Procurement AI</label>
              <div className="relative">
                <TextArea ref={input} id="procurement-message" rows={2} placeholder={conversation?.step === "pick" ? "Search the catalog or pick an item above…" : lastAi?.options ? "Choose an option or type your answer…" : "Describe what you need…"} className="resize-none pr-11" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
                <Button type="submit" size="icon" className="absolute bottom-2 right-2 size-7" aria-label="Send message" title="Send message" disabled={!text.trim() || saving || typing}><ArrowUp /></Button>
              </div>
              {undo.length > 0 && !typing && <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={() => { const previous = undo.at(-1); if (previous) { setConversation(previous); setUndo((h) => h.slice(0, -1)); } }}><Undo2 /> Undo last step</Button>}
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
