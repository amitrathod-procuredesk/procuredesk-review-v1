import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, ClipboardList, Package, RotateCcw, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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

  return <>
    <Button size="sm" variant="outline" className="border-primary/25 text-primary" onClick={() => setOpen(true)}><Sparkles /> Procurement AI</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(720px,calc(100dvh-24px))] w-[calc(100vw-24px)] max-w-[960px] flex-col gap-0 overflow-hidden rounded-lg bg-surface p-0" onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }}>
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4 pr-12">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-ai-soft text-ai"><Sparkles className="size-5" /></span>
          <div className="min-w-0 flex-1"><DialogTitle className="text-base tracking-normal">Procurement AI</DialogTitle><DialogDescription className="mt-1 text-xs">{db.org.name} <span aria-hidden>·</span> Purchase request</DialogDescription></div>
          <Button size="icon" variant="ghost" aria-label="Start over" title="Start over" onClick={restart}><RotateCcw /></Button>
        </header>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-success" /> Nothing submitted without your review</span>
          <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setPreview((p) => !p)}><ClipboardList />{preview ? "Conversation" : `Proposal (${r?.items.length ?? 0})`}</Button>
          <span className="hidden md:inline">Unsaved proposal</span>
        </div>
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="Procurement conversation" className={cn("flex min-h-0 min-w-0 flex-col", preview && "hidden md:flex")}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
              {!r?.ai.messages.length ? <div className="flex min-h-full flex-col justify-center pb-6">
                <Sparkles className="mb-4 size-7 text-ai" />
                <h2 className="text-xl font-semibold">What do you need to buy?</h2>
                <p className="mt-2 text-sm text-muted-foreground">Tell me the product, quantity and who it’s for.</p>
                <div className="mt-6 space-y-2">{examples.map((e) => <Button key={e} variant="outline" className="h-auto w-full justify-between whitespace-normal px-3 py-3 text-left text-xs font-normal" onClick={() => send(e)}>{e}<ArrowRight className="text-muted-foreground" /></Button>)}</div>
              </div> : <div className="space-y-5" role="log" aria-label="Conversation messages" aria-live="polite">
                {r.ai.messages.map((m) => <div key={m.id} className={cn("flex gap-2.5", m.role === "user" && "justify-end")}>
                  {m.role === "ai" && <Sparkles className="mt-1 size-4 shrink-0 text-ai" />}
                  <p className={cn("max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed", m.role === "user" ? "rounded-lg bg-subtle px-3 py-2" : "pt-0.5")}>{m.text.replace("on the right", "in the proposal").replace("in the table", "when you review the draft")}</p>
                </div>)}
                {last?.catalogIds && <div className="space-y-2 pl-6">{last.catalogIds.map((id) => {
                  const c = db.catalog.find((item) => item.id === id);
                  if (!c) return null;
                  const v = db.vendors.find((vendor) => vendor.id === c.vendorId);
                  const choice = r.ai.pending === "catalog" ? "Use catalog item" : c.name;
                  return <Button key={id} variant="outline" className="h-auto w-full justify-start whitespace-normal p-3 text-left" onClick={() => send(choice)}>
                    <Package className="text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{c.name}</span><span className="mt-1 block text-[11px] font-normal text-muted-foreground">{v?.name ?? "No supplier"}{v?.preferred ? " · Preferred" : ""}</span><span className="mt-1 block text-[11px] font-normal text-muted-foreground">{c.description}</span></span><span className="shrink-0 text-right text-xs"><span className="num">{money(c.price)}</span><span className="block text-[10px] font-normal text-muted-foreground">each</span></span>
                  </Button>;
                })}</div>}
                {last?.options && <div className="flex flex-wrap gap-2 pl-6">{last.options.filter((o) => !(last.catalogIds && (o === "Use catalog item" || last.catalogIds.some((id) => db.catalog.find((c) => c.id === id)?.name === o)))).map((o) => <Button key={o} size="sm" variant="outline" className="h-auto whitespace-normal py-2" onClick={() => send(o)}>{o === "I'll pick a date" ? "Choose date in draft" : o}</Button>)}</div>}
                {r.ai.pending === "date" && <div className="pl-6"><label className="pd-label" htmlFor="ai-date">Required by</label><TextInput id="ai-date" type="date" min={new Date().toISOString().slice(0, 10)} onChange={(e) => { if (e.target.value) send(e.target.value); }} /></div>}
              </div>}
              <div ref={end} />
            </div>
            <form className="shrink-0 border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <label htmlFor="procurement-message" className="sr-only">Describe your purchase</label>
              <TextArea ref={input} id="procurement-message" rows={2} placeholder={r?.ai.pending ? "Answer the question above…" : r?.items.length ? "Add another product…" : "I need 4 laptops for Engineering…"} className="resize-none" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
              <div className="mt-2 flex items-center justify-between"><Button type="button" size="sm" variant="ghost" disabled={!undo.length} onClick={() => { const previous = undo.at(-1); if (previous) { setConversation(previous); setUndo((h) => h.slice(0, -1)); } }}><Undo2 /> Undo</Button><Button type="submit" size="icon" aria-label="Send message" title="Send message" disabled={!text.trim() || saving}><ArrowUp /></Button></div>
            </form>
          </section>
          <aside aria-label="Request proposal" className={cn("flex min-h-0 flex-col border-border bg-subtle/50 md:border-l", !preview && "hidden md:flex")}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="size-4" /> Request proposal</h2>
              {!r?.items.length ? <div className="mt-10 text-center"><Package className="mx-auto size-7 text-muted-foreground/50" /><p className="mt-3 text-xs text-muted-foreground">No items confirmed yet</p></div> : <>
                <p className="mt-4 break-words text-sm font-medium">{r.title}</p>
                <ul className="mt-3 divide-y divide-border">{r.items.map((item) => <li key={item.id} className="py-3"><p className="break-words text-xs font-medium">{item.qty} × {item.name || item.description}</p><div className="mt-1 flex justify-between gap-2 text-[11px] text-muted-foreground"><span>{db.vendors.find((v) => v.id === item.vendorId)?.name ?? "Supplier needed"}</span><span className="num shrink-0">{item.unitPrice > 0 ? money(lineTotal(item)) : "Price needed"}</span></div></li>)}</ul>
                <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold"><span>Estimated total</span><span className="num">{money(totals(r).total)}</span></div>
                <dl className="mt-5 space-y-3 text-xs">{[["Department", db.departments.find((d) => d.id === r.departmentId)?.name ?? "Not selected"], ["Required by", r.requiredBy ? smartDate(r.requiredBy) : "Not selected"]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 font-medium">{value}</dd></div>)}</dl>
                {budgets.map((b) => <div key={b.budget.id} className="mt-4 text-xs"><p className="text-muted-foreground">Suggested budget</p><p className="mt-0.5 font-medium">{b.budget.name}</p><p className={cn("mt-1", b.over ? "text-destructive" : "text-success")}>{b.over ? `${money(-b.remaining)} over budget` : `${money(b.remaining)} remaining`}</p></div>)}
                {route.length > 0 && <div className="mt-4 text-xs"><p className="text-muted-foreground">Expected approvals</p><p className="mt-1 leading-relaxed">{route.map((s) => s.name).join(" → ")}</p></div>}
                <div className="mt-5 border-t border-border pt-4"><p className="pd-section-title">Review checks</p>{checks.length ? checks.map((c) => <div key={c.id} className="mt-3 text-xs"><p className={c.level === "error" ? "text-attention" : "text-warning"}>{c.title}</p><p className="mt-1 leading-relaxed text-muted-foreground">{c.detail}</p></div>) : <p className="mt-2 flex items-center gap-1.5 text-xs text-success"><Check className="size-3.5" /> All checks pass</p>}</div>
              </>}
            </div>
            <footer className="shrink-0 border-t border-border p-4"><Button className="w-full" disabled={!r?.items.length || !!conversation?.queue.length || saving} onClick={save}>{saving ? "Creating draft…" : "Create draft & review"}<ArrowRight /></Button><p className="mt-2 text-center text-[11px] text-muted-foreground">{conversation?.queue.length ? `${conversation.queue.length} more product(s) awaiting selection` : r?.ai.pending ? "Remaining details can be completed in the draft" : "Not submitted for approval"}</p></footer>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}