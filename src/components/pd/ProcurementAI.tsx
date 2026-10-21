import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, Package, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TextArea, TextInput } from "./form";
import { budgetStatuses, computeRoute, lineTotal, money, runChecks, smartDate, totals } from "@/lib/pd/engine";
import { converse, procurementProposal, type ProcurementConversation } from "@/lib/pd/procurementAi";
import { createDraft, updateRequest, useDB, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export function ProcurementAI() {
  const db = useDB();
  const me = useMe();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<ProcurementConversation | null>(null);
  const [undo, setUndo] = useState<ProcurementConversation[]>([]);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const r = conversation?.request;
  const last = r?.ai.messages.at(-1);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "nearest" }); }, [r?.ai.messages.length, open]);
  if (!me || me.role === "approver") return null;

  const send = (value: string) => {
    if (!value.trim() || saving) return;
    const current = conversation ?? { request: procurementProposal(db, me.id), queue: [] };
    setUndo((h) => [...h, structuredClone(current)]);
    setConversation(converse(db, current, value));
    setText("");
    input.current?.focus();
  };
  const restart = () => {
    if (r?.ai.messages.length && !window.confirm("Discard this proposal and start a new conversation?")) return;
    setConversation(null); setUndo([]); setText(""); setPreview(false);
  };
  const save = () => {
    if (!r?.items.length || conversation?.queue.length || saving) return;
    setSaving(true);
    const id = createDraft(me.id, false);
    const proposal = structuredClone(r);
    updateRequest(id, (draft) => {
      const created = draft.activity;
      Object.assign(draft, proposal, { id, requesterId: me.id, status: "draft", route: [], activity: [...created, ...proposal.activity] });
    });
    setOpen(false); setConversation(null); setUndo([]); setSaving(false);
    toast.success("Draft created — review before submitting");
    void nav({ to: "/app/requests/$id/edit", params: { id }, search: { prompt: undefined } });
  };
  const checks = r?.items.length ? runChecks(r, db).filter((c) => c.level !== "ok") : [];
  const budgets = r ? budgetStatuses(r, db) : [];
  const route = r?.items.length ? computeRoute(r, db) : [];
  const examples = ["4 laptops for Engineering next month", "10 monitors for the design team", "3 standing desks for our new hires"];

  const mark = <span className="grid size-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-accent-foreground text-primary-foreground"><Sparkles className="size-3.5" /></span>;
  return <>
    <Button size="sm" variant="outline" className="border-primary/25 bg-gradient-to-r from-accent to-surface text-primary" onClick={() => setOpen(true)}><Sparkles /> Procurement AI</Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className={cn("flex w-full flex-col gap-0 overflow-hidden bg-surface p-0 transition-[max-width] duration-300 ease-out", r?.items.length ? "sm:max-w-[min(940px,calc(100vw-48px))]" : "sm:max-w-[480px]")} onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }}>
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border bg-gradient-to-b from-accent/60 to-surface px-4 py-3 pr-12">
          {mark}
          <div className="min-w-0 flex-1"><SheetTitle className="text-sm font-semibold">Procurement AI</SheetTitle><SheetDescription className="text-[11px]">Nothing is submitted without your review</SheetDescription></div>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Start over" title="Start over" onClick={restart}><RotateCcw /></Button>
        </header>
        {!!r?.items.length && <div className="flex shrink-0 gap-1 border-b border-border px-4 py-1.5 md:hidden" role="tablist">
          {[[false, "Conversation"], [true, `Proposal · ${money(totals(r).total)}`]].map(([v, label]) => <button key={String(v)} role="tab" aria-selected={preview === v} onClick={() => setPreview(v as boolean)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", preview === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>{label as string}</button>)}
        </div>}
        <div className={cn("flex min-h-0 flex-1 flex-col", !!r?.items.length && "md:grid md:grid-cols-[minmax(0,1fr)_360px]")}>
          <section aria-label="Procurement conversation" className={cn("flex min-h-0 min-w-0 flex-1 flex-col", preview && "hidden md:flex")}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
              {!r?.ai.messages.length ? <div className="flex min-h-full flex-col justify-center pb-6">
                <h2 className="text-lg font-semibold">What do you need to buy?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Tell me the product, quantity and who it’s for.</p>
                <div className="mt-5 space-y-1.5">{examples.map((e) => <Button key={e} variant="outline" className="h-auto w-full justify-between whitespace-normal px-3 py-2.5 text-left text-xs font-normal" onClick={() => send(e)}>{e}<ArrowRight className="text-muted-foreground" /></Button>)}</div>
              </div> : <div className="space-y-4" role="log" aria-label="Conversation messages" aria-live="polite">
                {r.ai.messages.map((m) => <div key={m.id} className={cn("flex gap-2.5", m.role === "user" && "justify-end")}>
                  {m.role === "ai" && <Sparkles className="mt-1 size-3.5 shrink-0 text-primary" />}
                  <p className={cn("max-w-[90%] whitespace-pre-wrap break-words text-sm leading-relaxed", m.role === "user" ? "rounded-lg bg-accent px-3 py-2 text-accent-foreground" : "pt-0.5")}>{m.text.replace("on the right", "in the proposal").replace("in the table", "when you review the draft")}</p>
                </div>)}
                {last?.catalogIds && <div className="space-y-2 pl-6">{last.catalogIds.map((id) => {
                  const c = db.catalog.find((item) => item.id === id);
                  if (!c) return null;
                  const v = db.vendors.find((vendor) => vendor.id === c.vendorId);
                  const choice = r.ai.pending === "catalog" ? "Use catalog item" : c.name;
                  return <Button key={id} variant="outline" className="h-auto w-full justify-start whitespace-normal p-3 text-left hover:border-primary/40" onClick={() => send(choice)}>
                    <Package className="text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{c.name}</span><span className="mt-1 block text-[11px] font-normal text-muted-foreground">{v?.name ?? "No supplier"}{v?.preferred ? " · Preferred" : ""}</span></span><span className="shrink-0 text-right text-xs"><span className="num">{money(c.price)}</span><span className="block text-[10px] font-normal text-muted-foreground">each</span></span>
                  </Button>;
                })}</div>}
                {last?.options && <div className="flex flex-wrap gap-2 pl-6">{last.options.filter((o) => !(last.catalogIds && (o === "Use catalog item" || last.catalogIds.some((id) => db.catalog.find((c) => c.id === id)?.name === o)))).map((o) => <Button key={o} size="sm" variant="outline" className="h-auto whitespace-normal py-1.5" onClick={() => send(o)}>{o === "I'll pick a date" ? "Choose date in draft" : o}</Button>)}</div>}
                {r.ai.pending === "date" && <div className="pl-6"><label className="pd-label" htmlFor="ai-date">Required by</label><TextInput id="ai-date" type="date" min={new Date().toISOString().slice(0, 10)} onChange={(e) => { if (e.target.value) send(e.target.value); }} /></div>}
              </div>}
              <div ref={end} />
            </div>
            <form className="shrink-0 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <label htmlFor="procurement-message" className="sr-only">Describe your purchase</label>
              <div className="relative">
                <TextArea ref={input} id="procurement-message" rows={2} placeholder={r?.ai.pending ? "Answer the question above…" : r?.items.length ? "Add another product…" : "I need 4 laptops for Engineering…"} className="resize-none pr-11" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
                <Button type="submit" size="icon" className="absolute bottom-2 right-2 size-7" aria-label="Send message" title="Send message" disabled={!text.trim() || saving}><ArrowUp /></Button>
              </div>
              {undo.length > 0 && <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={() => { const previous = undo.at(-1); if (previous) { setConversation(previous); setUndo((h) => h.slice(0, -1)); } }}><Undo2 /> Undo</Button>}
            </form>
          </section>
          {r && !!r.items.length && <aside aria-label="Request proposal" className={cn("min-h-0 flex-1 flex-col border-border bg-subtle/40 md:flex md:border-l animate-in fade-in slide-in-from-right-4 duration-300", preview ? "flex" : "hidden")}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <p className="pd-section-title">Proposal</p>
            <p className="mt-1 break-words text-sm font-medium">{r.title}</p>
            <ul className="mt-2 divide-y divide-border">{r.items.map((item) => <li key={item.id} className="py-2.5"><p className="break-words text-xs font-medium">{item.qty} × {item.name || item.description}</p><div className="mt-0.5 flex justify-between gap-2 text-[11px] text-muted-foreground"><span>{db.vendors.find((v) => v.id === item.vendorId)?.name ?? "Supplier needed"}</span><span className="num shrink-0">{item.unitPrice > 0 ? money(lineTotal(item)) : "Price needed"}</span></div></li>)}</ul>
            <div className="flex justify-between border-t border-border pt-2.5 text-sm font-semibold"><span>Estimated total</span><span className="num">{money(totals(r).total)}</span></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              {[["Department", db.departments.find((d) => d.id === r.departmentId)?.name ?? "Not selected"], ["Required by", r.requiredBy ? smartDate(r.requiredBy) : "Not selected"]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 font-medium">{value}</dd></div>)}
              {budgets.map((b) => <div key={b.budget.id} className="col-span-2"><dt className="text-muted-foreground">Budget</dt><dd className="mt-0.5 font-medium">{b.budget.name} <span className={cn("font-normal", b.over ? "text-destructive" : "text-success")}>· {b.over ? `${money(-b.remaining)} over` : `${money(b.remaining)} left`}</span></dd></div>)}
              {route.length > 0 && <div className="col-span-2"><dt className="text-muted-foreground">Approvals</dt><dd className="mt-0.5">{route.map((s) => s.name).join(" → ")}</dd></div>}
            </dl>
            <div className="mt-4 border-t border-border pt-3">{checks.length ? checks.map((c) => <div key={c.id} className="mt-2 text-xs first:mt-0"><p className={c.level === "error" ? "text-attention" : "text-warning"}>{c.title}</p><p className="mt-0.5 leading-relaxed text-muted-foreground">{c.detail}</p></div>) : <p className="flex items-center gap-1.5 text-xs text-success"><Check className="size-3.5" /> All checks pass</p>}</div>
            </div>
            <footer className="shrink-0 border-t border-border p-3"><Button className="w-full" disabled={!!conversation?.queue.length || saving} onClick={save}>{saving ? "Creating draft…" : "Create draft & review"}<ArrowRight /></Button>{!!conversation?.queue.length && <p className="mt-1.5 text-center text-[11px] text-muted-foreground">{conversation.queue.length} more product(s) awaiting selection</p>}</footer>
          </aside>}
        </div>
      </SheetContent>
    </Sheet>
  </>;
}