import { ArrowUp, Check, ChevronDown, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { smartDate } from "@/lib/pd/engine";
import { converse, startConversation, type ProcurementConversation } from "@/lib/pd/procurementAi";
import { getDB, updateRequest, useDB } from "@/lib/pd/store";
import type { PRequest } from "@/lib/pd/types";
import { cn } from "@/lib/utils";
import { CatalogPicker } from "./ProcurementAI";
import { TextInput } from "./form";

/**
 * Floating copilot inside the request form. Uses the same step-by-step
 * conversation as Procurement AI, but each confirmed choice is written
 * straight into this request's form (items, department, need-by date).
 */
function fresh(r: PRequest): ProcurementConversation {
  const c = startConversation(getDB(), r.requesterId);
  c.request.departmentId = r.departmentId;
  c.request.requiredBy = r.requiredBy;
  return c;
}

export function Copilot({ r, initialPrompt }: { r: PRequest; initialPrompt?: string }) {
  const db = useDB();
  const [conv, setConv] = useState<ProcurementConversation>(() => fresh(r));
  const [past, setPast] = useState<ProcurementConversation[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(!!initialPrompt);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = (value: string, label?: string) => {
    if (!value.trim() || busy) return;
    setText("");
    setOpen(true);
    setBusy(true);
    setTimeout(() => {
      setConv((prev) => {
        const next = converse(getDB(), prev, value, label);
        const added = next.request.items.slice(prev.request.items.length);
        const dep = next.request.departmentId !== prev.request.departmentId ? next.request.departmentId : undefined;
        const date = next.request.requiredBy !== prev.request.requiredBy ? next.request.requiredBy : undefined;
        if (added.length || dep || date) {
          updateRequest(r.id, (x) => {
            added.forEach((li) => x.items.push({ ...li }));
            if (dep) { x.departmentId = dep; x.businessUnit = next.request.businessUnit || x.businessUnit; }
            if (date) x.requiredBy = date;
            if (!x.title && x.items.length) x.title = x.items.length === 1 ? x.items[0].name : `${x.items[0].name} and ${x.items.length - 1} more`;
          });
        }
        setPast((p) => [...p, prev]);
        return next;
      });
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }, 350);
  };

  useEffect(() => {
    if (initialPrompt && !started.current) { started.current = true; send(initialPrompt); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  // Undo only steps back the conversation when it didn't add anything to the form.
  const prev = past.at(-1);
  const canUndo = !!prev && prev.request.items.length === conv.request.items.length && !busy;

  const msgs = conv.messages;
  const lastAi = [...msgs].reverse().find((m) => m.role === "ai");
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const added = conv.request.items.length;

  const triggerBtn = (
    <button
      onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
      aria-expanded={open}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium transition-colors hover:bg-subtle data-[open=true]:border-primary/40 data-[open=true]:bg-primary/5"
      data-open={open}
    >
      <span className="pd-ai-diamond" /> Ask AI
      {lastAi && conv.step !== "done" && <span className="size-1.5 rounded-full bg-primary ai-thinking-dot" />}
    </button>
  );
  if (!open) return <div className="relative">{triggerBtn}</div>;

  return (
    <div className="relative">
      {triggerBtn}
      <div className="pd-float fixed inset-x-3 top-14 z-50 rounded-2xl border border-border bg-surface animate-in fade-in slide-in-from-top-2 duration-200 sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[min(600px,calc(100vw-2rem))]">
        <div className="flex items-center justify-end gap-1 px-3 pt-2">
          {msgs.length > 1 && (
            <button className="mr-auto pl-3 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setHistory((h) => !h)}>
              {history ? "Hide conversation" : `Show conversation (${msgs.length})`}
            </button>
          )}
          {msgs.length > 0 && (
            <button aria-label="Start over" title="Start over" onClick={() => { setConv(fresh(getDB().requests.find((x) => x.id === r.id) ?? r)); setPast([]); setHistory(false); }} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"><RotateCcw className="size-3.5" /></button>
          )}
          <button aria-label="Minimize copilot" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"><ChevronDown className="size-4" /></button>
        </div>

        {history && (
          <div className="mx-5 mb-2 max-h-48 space-y-2 overflow-y-auto border-b border-border pb-3 animate-in fade-in">
            {msgs.slice(0, -1).map((m) => (
              <p key={m.id} className={cn("text-xs", m.role === "user" ? "text-right text-muted-foreground" : "text-foreground/80")}>{m.role === "user" ? `You: ${m.text}` : m.text}</p>
            ))}
          </div>
        )}

        <div className="px-5 pb-4">
          {busy ? (
            <div className="space-y-2 py-1">
              {lastUser && <p className="text-xs text-muted-foreground">“{lastUser.text}”</p>}
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><span className="size-1.5 rounded-full bg-primary ai-thinking-dot" /> Checking your catalog…</p>
            </div>
          ) : !lastAi ? (
            <div className="space-y-3">
              <p className="flex items-start gap-3 text-[15px] font-medium"><span className="pd-ai-diamond mt-1.5" /> What do you need? I'll find it and add it to this request.</p>
              <div className="flex flex-wrap gap-2 pl-6">
                {["I need a laptop", "10 monitors", "A standing desk"].map((s) => (
                  <button key={s} className="pd-pill" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div key={lastAi.id} className="space-y-3 animate-in fade-in slide-in-from-bottom-1">
              <p className="flex items-start gap-3 text-[15px] font-medium leading-snug">
                <span className="pd-ai-diamond mt-1.5" />
                <span>{lastAi.text}</span>
              </p>
              {lastAi.widget === "catalog" && (
                <div className="pl-6"><CatalogPicker key={lastAi.id} db={db} query={lastAi.query ?? ""} active onPick={(id, name) => send(id, name)} /></div>
              )}
              {lastAi.options && (
                <div className="flex flex-wrap gap-2 pl-6">
                  {lastAi.options.map((o) => (
                    <button key={o.value} className="pd-pill" onClick={() => send(o.value, o.label)}>
                      <span className="font-medium">{o.label}</span>
                      {o.hint && <span className="text-muted-foreground">{o.hint}</span>}
                    </button>
                  ))}
                </div>
              )}
              {lastAi.widget === "date" && (
                <div className="max-w-[200px] pl-6"><label className="sr-only" htmlFor="copilot-date">Choose a date</label><TextInput id="copilot-date" type="date" min={new Date().toISOString().slice(0, 10)} onChange={(e) => { if (e.target.value) send(e.target.value, smartDate(e.target.value)); }} /></div>
              )}
            </div>
          )}

          <form className="mt-3 flex items-center gap-2 pl-6" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <div className="relative flex-1">
              <input
                ref={inputRef}
                className="h-10 w-full rounded-full border border-dashed border-input bg-transparent px-4 pr-11 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-solid focus:border-primary focus:ring-4 focus:ring-primary/10"
                disabled={busy}
                placeholder={lastAi ? "Or type your answer…" : "e.g. I need a laptop"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button type="submit" aria-label="Send" disabled={!text.trim() || busy} className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 disabled:scale-90 disabled:opacity-0">
                <ArrowUp className="size-4" />
              </button>
            </div>
          </form>

          {(added > 0 || canUndo) && (
            <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
              {added > 0 && <p className="flex items-center gap-1.5 text-xs text-success"><Check className="size-3.5" /> {added} {added === 1 ? "item" : "items"} added to this request — edit them below.</p>}
              {canUndo && <button className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => { setConv(prev!); setPast((p) => p.slice(0, -1)); }}><Undo2 className="size-3" /> Undo</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
