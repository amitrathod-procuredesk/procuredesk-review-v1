import { ArrowUp, Check, ChevronDown, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { respond, thinkingSteps } from "@/lib/pd/copilot";
import { money } from "@/lib/pd/engine";
import { getDB, updateRequest, useDB } from "@/lib/pd/store";
import type { PRequest } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

/**
 * Floating, text-only copilot. Shows just the current question / answer with
 * pill options, so it never competes with the request form for space.
 */
export function Copilot({ r, initialPrompt }: { r: PRequest; initialPrompt?: string }) {
  const db = useDB();
  const [text, setText] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [open, setOpen] = useState(true);
  const [history, setHistory] = useState(false);
  const busy = steps.length > 0;
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = (t: string) => {
    if (!t.trim() || busy) return;
    setText("");
    setOpen(true);
    const s = thinkingSteps(getDB().requests.find((x) => x.id === r.id)!);
    updateRequest(r.id, (x) => { x.ai.messages.push({ id: `tmp_${Date.now()}`, role: "user", text: t }); });
    setSteps(s);
    setStepIdx(0);
    s.forEach((_, i) => setTimeout(() => setStepIdx(i), i * 450));
    setTimeout(() => {
      updateRequest(r.id, (x, d) => {
        x.ai.messages = x.ai.messages.filter((m) => !m.id.startsWith("tmp_"));
        respond(d, x, t);
      });
      setSteps([]);
    }, s.length * 450 + 150);
  };

  useEffect(() => {
    if (initialPrompt && !started.current && r.ai.messages.length === 0) {
      started.current = true;
      send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const msgs = r.ai.messages;
  const lastAi = [...msgs].reverse().find((m) => m.role === "ai");
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const isDone = lastAi?.kind === "done" && !r.ai.pending;

  if (!open)
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="pd-float fixed bottom-5 left-1/2 z-40 inline-flex h-10 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium animate-in fade-in slide-in-from-bottom-2 hover:-translate-y-0.5 hover:-translate-x-1/2 transition-transform lg:left-[calc(50%-160px)]"
      >
        <span className="pd-ai-diamond" /> Ask copilot
        {r.ai.pending && <span className="size-1.5 rounded-full bg-primary ai-thinking-dot" />}
      </button>
    );

  return (
    <div className="pd-float fixed bottom-5 left-1/2 z-40 w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-surface animate-in fade-in slide-in-from-bottom-4 duration-300 lg:left-[calc(50%-160px)]">
      <div className="flex items-center justify-end gap-1 px-3 pt-2">
        {msgs.length > 1 && (
          <button className="mr-auto pl-3 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setHistory((h) => !h)}>
            {history ? "Hide conversation" : `Show conversation (${msgs.length})`}
          </button>
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
            <ol className="space-y-1">
              {steps.map((s, i) => (
                <li key={s} className={cn("flex items-center gap-2 text-sm transition-colors", i <= stepIdx ? "text-foreground" : "text-muted-foreground/40")}>
                  {i < stepIdx ? <Check className="size-3.5 text-success animate-in zoom-in" /> : <span className={cn("size-1.5 rounded-full bg-primary", i === stepIdx ? "ai-thinking-dot" : "opacity-30")} />}
                  {s}
                </li>
              ))}
            </ol>
          </div>
        ) : !lastAi ? (
          <div className="space-y-3">
            <p className="flex items-start gap-3 text-[15px] font-medium"><span className="pd-ai-diamond mt-1.5" /> What do you need? Describe it and I'll fill in the request.</p>
            <div className="flex flex-wrap gap-2 pl-6">
              {["4 MacBook Pro laptops for new hires", "10 monitors for the design team", "Standing desks for Austin"].map((s) => (
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
            {lastAi.catalogIds && lastAi.options && (
              <div className="flex flex-wrap gap-2 pl-6">
                {lastAi.options.map((o) => {
                  const c = db.catalog.find((x) => lastAi.catalogIds!.includes(x.id) && o.toLowerCase().includes(x.name.toLowerCase()));
                  const v = c && db.vendors.find((x) => x.id === c.vendorId);
                  return (
                    <button key={o} className="pd-pill" onClick={() => send(o)}>
                      <span className="font-medium">{c ? c.name : o}</span>
                      {c && <span className="text-muted-foreground">{v?.name} · {money(c.price)}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {!lastAi.catalogIds && lastAi.options && (
              <div className="flex flex-wrap gap-2 pl-6">
                {lastAi.options.map((o) => <button key={o} className="pd-pill" onClick={() => send(o)}>{o}</button>)}
              </div>
            )}
            {isDone && <p className="flex items-center gap-1.5 pl-6 text-xs text-success"><Check className="size-3.5" /> Request filled in — review the items below.</p>}
          </div>
        )}

        <form className="mt-3 flex items-center gap-2 pl-6" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              className="h-10 w-full rounded-full border border-dashed border-input bg-transparent px-4 pr-11 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-solid focus:border-primary focus:ring-4 focus:ring-primary/10"
              disabled={busy}
              placeholder={r.ai.pending ? "Or type your answer…" : lastAi ? "Add something else, e.g. 4 docking stations" : "e.g. I need 4 MacBook Pro laptops for new hires"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" aria-label="Send" disabled={!text.trim() || busy} className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 disabled:scale-90 disabled:opacity-0">
              <ArrowUp className="size-4" />
            </button>
          </div>
        </form>

        {(r.ai.pending || isDone) && (
          <div className="mt-3 flex justify-end border-t border-border pt-3">
            <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => {
              updateRequest(r.id, (x) => { x.ai.pending = null; });
              setOpen(false);
            }}>
              {isDone ? <><X className="size-3" /> Close</> : <><Sparkles className="size-3" /> Skip, I'll fill it in</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
