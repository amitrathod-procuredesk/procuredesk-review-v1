import { useNavigate } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { answer, type Answer } from "@/lib/pd/assistant";
import { createDraft, getDB, useDB, useMe } from "@/lib/pd/store";
import type { PRequest } from "@/lib/pd/types";
import { AiGlyph } from "./bits";

interface Turn { q: string; a: Answer }

export function AssistantThread({ ctx, suggestions, compact }: { ctx?: PRequest; suggestions: string[]; compact?: boolean }) {
  const db = useDB();
  const me = useMe();
  const nav = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [turns, thinking]);

  const ask = (text: string) => {
    if (!text.trim() || !me) return;
    setQ("");
    setThinking(true);
    setTimeout(() => {
      setTurns((t) => [...t, { q: text, a: answer(getDB(), me, text, ctx) }]);
      setThinking(false);
    }, 450);
  };
  void db;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} className="pd-chip h-auto py-1.5 text-left" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">{t.q}</p>
            <div className="flex gap-2">
              <AiGlyph className="mt-0.5" />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p>{t.a.text}</p>
                {t.a.rows && (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {t.a.rows.map((r, j) => (
                      <li key={j}>
                        <button
                          disabled={!r.requestId}
                          onClick={() => r.requestId && nav({ to: "/app/requests/$id", params: { id: r.requestId } })}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs enabled:hover:bg-subtle"
                        >
                          <span className="truncate">{r.label}</span>
                          <span className="shrink-0 text-muted-foreground">{r.value}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {t.a.startRequest && me && (
                  <button
                    className="pd-chip"
                    onClick={() => {
                      const id = createDraft(me.id, false);
                      nav({ to: "/app/requests/$id/edit", params: { id }, search: { prompt: t.a.startRequest } });
                    }}
                  >
                    Prepare draft request →
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {thinking && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="ai-thinking-dot size-1.5 rounded-full bg-ai" /> Looking through ProcureDesk data…
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className={compact ? "mt-3 flex gap-2" : "mt-4 flex gap-2 border-t border-border pt-4"}
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input className="pd-input h-9" placeholder="Ask about requests, budgets, suppliers…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" aria-label="Ask" className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40" disabled={!q.trim()}>
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}

export function GlobalAssistant({ open, onOpenChange, ctx }: { open: boolean; onOpenChange: (o: boolean) => void; ctx?: PRequest }) {
  const me = useMe();
  const base =
    me?.role === "approver"
      ? ["Show requests waiting for my approval", "How much budget does Engineering have left?", "Show purchases over $5,000"]
      : me?.role === "admin"
        ? ["Which requests are blocked by budget?", "Show purchases over $10,000", "Which vendors do we use for laptops?"]
        : ["Create a purchase request for 10 monitors", "How much budget does Engineering have left?", "Which vendors do we use for laptops?"];
  const suggestions = ctx ? ["Why is this request blocked?", "Is the supplier preferred?", ...base.slice(0, 2)] : base;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border pb-3">
          <SheetTitle className="flex items-center gap-2 text-sm"><AiGlyph /> Ask ProcureDesk</SheetTitle>
          <p className="text-xs text-muted-foreground">Answers come only from your organization's procurement data{ctx ? ` · Context: ${ctx.id}` : ""}.</p>
        </SheetHeader>
        <div className="min-h-0 flex-1 p-4">
          <AssistantThread key={ctx?.id ?? "global"} ctx={ctx} suggestions={suggestions} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
