import { ArrowUp, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { respond, thinkingSteps } from "@/lib/pd/copilot";
import { money } from "@/lib/pd/engine";
import { getDB, updateRequest, useDB } from "@/lib/pd/store";
import type { PRequest } from "@/lib/pd/types";
import { AiGlyph } from "./bits";

export function Copilot({ r, initialPrompt }: { r: PRequest; initialPrompt?: string }) {
  const db = useDB();
  const [text, setText] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const busy = steps.length > 0;
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const send = (t: string) => {
    if (!t.trim() || busy) return;
    setText("");
    const s = thinkingSteps(getDB().requests.find((x) => x.id === r.id)!);
    // Show the user's message immediately, then staged processing.
    updateRequest(r.id, (x) => { x.ai.messages.push({ id: `tmp_${Date.now()}`, role: "user", text: t }); });
    setSteps(s);
    setStepIdx(0);
    s.forEach((_, i) => setTimeout(() => setStepIdx(i), i * 550));
    setTimeout(() => {
      updateRequest(r.id, (x, d) => {
        x.ai.messages = x.ai.messages.filter((m) => !m.id.startsWith("tmp_"));
        respond(d, x, t);
      });
      setSteps([]);
    }, s.length * 550 + 150);
  };

  useEffect(() => {
    if (initialPrompt && !started.current && r.ai.messages.length === 0) {
      started.current = true;
      send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [r.ai.messages.length, stepIdx, busy]);

  const last = r.ai.messages[r.ai.messages.length - 1];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AiGlyph />
        <div>
          <p className="text-sm font-medium">Procurement copilot</p>
          <p className="text-[11px] text-muted-foreground">Prepares your request · you confirm every financial choice</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {r.ai.messages.length === 0 && !busy && (
          <div className="space-y-3">
            <p className="text-sm">What do you need? Describe it in plain words — I'll find catalog items, check budget and policy, and fill in the request.</p>
            <div className="flex flex-col gap-1.5">
              {["I need 4 MacBook Pro laptops for our new engineering hires", "10 monitors for the design team next month", "Standing desks for the Austin office"].map((s) => (
                <button key={s} className="pd-chip h-auto justify-start py-1.5 text-left" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {r.ai.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto w-fit max-w-[90%]">
              <p className="text-right text-[10px] text-muted-foreground">You said</p>
              <p className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="space-y-2">
              <p className="text-sm">{m.text}</p>
              {m.catalogIds && (
                <div className="space-y-1.5">
                  {m.catalogIds.map((id) => {
                    const c = db.catalog.find((x) => x.id === id);
                    if (!c) return null;
                    const v = db.vendors.find((x) => x.id === c.vendorId);
                    return (
                      <div key={id} className="rounded-md border border-border bg-surface p-3">
                        <div className="flex justify-between gap-2">
                          <p className="text-sm font-medium">{c.name}</p>
                          <span className="num text-sm">{money(c.price)}</span>
                        </div>
                        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <dt>Supplier</dt><dd className="text-foreground">{v?.name}</dd>
                          <dt>Contract</dt><dd className="text-foreground">{v?.contractActive ? "Active" : "None"}</dd>
                          <dt>Preferred vendor</dt><dd className="text-foreground">{v?.preferred ? "Yes" : "No"}</dd>
                          <dt>Availability</dt><dd className={c.available ? "text-success" : "text-warning"}>{c.available ? "Available" : "Backordered"}</dd>
                        </dl>
                      </div>
                    );
                  })}
                </div>
              )}
              {m.options && m.id === last?.id && !busy && (
                <div className="flex flex-wrap gap-1.5">
                  {m.options.map((o, i) => (
                    <button key={o} className="pd-chip" data-active={i === 0} onClick={() => send(o)}>{o}</button>
                  ))}
                </div>
              )}
              {m.kind === "done" && (
                <p className="flex items-center gap-1 text-[11px] text-success"><Check className="size-3" /> Structured request generated — review it on the right</p>
              )}
            </div>
          ),
        )}
        {busy && (
          <ol className="space-y-1">
            {steps.map((s, i) => (
              <li key={s} className={`flex items-center gap-2 text-xs ${i <= stepIdx ? "text-foreground" : "text-muted-foreground/50"}`}>
                {i < stepIdx ? <Check className="size-3 text-success" /> : <span className={`size-1.5 rounded-full bg-ai ${i === stepIdx ? "ai-thinking-dot" : "opacity-30"}`} />}
                {s}
              </li>
            ))}
          </ol>
        )}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input className="pd-input h-9" disabled={busy} placeholder={r.ai.pending ? "Type an answer or pick an option…" : "Add something else, e.g. 4 docking stations"} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" aria-label="Send" disabled={!text.trim() || busy} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"><ArrowUp className="size-4" /></button>
      </form>
    </div>
  );
}
