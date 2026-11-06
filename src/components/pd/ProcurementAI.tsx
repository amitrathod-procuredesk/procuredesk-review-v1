import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ArrowUp,
  Check,
  LoaderCircle,
  Package,
  RotateCcw,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  budgetStatuses,
  computeRoute,
  lineTotal,
  money,
  runChecks,
  smartDate,
  totals,
} from "@/lib/pd/engine";
import {
  converse,
  matchCatalog,
  startConversation,
  type Msg,
  type ProcurementConversation,
} from "@/lib/pd/procurementAi";
import { purchaseSuggestions } from "@/lib/pd/procurementSuggestions";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { getDB, mutate, submitRequest, waitForWorkspaceSave, useDB, useMe } from "@/lib/pd/store";
import {
  applyProcurementDraft,
  procurementBlockers,
  procurementDraftBlockers,
} from "@/lib/pd/procurementDraft";
import { procurementReply } from "@/lib/pd/procurementReply.functions";
import type { DB } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

export function CatalogPicker({
  db,
  query,
  active,
  onPick,
}: {
  db: DB;
  query: string;
  active: boolean;
  onPick: (id: string, name: string) => void;
}) {
  const history = purchaseSuggestions(db, db.session.userId ?? "", query);
  const rows = matchCatalog(db, query)
    .sort(
      (a, b) =>
        Number(history.some((h) => h.item.catalogId === b.id)) -
        Number(history.some((h) => h.item.catalogId === a.id)),
    );
  return (
      <ul aria-label="Matching products" className="divide-y divide-border">
        {rows.map((c) => {
          const v = db.vendors.find((x) => x.id === c.vendorId);
          return (
            <li key={c.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 py-3">
              <Package className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{c.name}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {v?.name ?? "No supplier"}
                  {v?.preferred ? " · Preferred" : ""}
                  {history.some((h) => h.item.catalogId === c.id) ? " · Purchased before" : ""}
                </p>
              </div>
              <span className="num col-start-2 row-start-2 text-xs font-medium">{money(c.price)} <span className="font-normal text-muted-foreground">each</span></span>
              <Button
                size="sm"
                variant="outline"
                className="col-start-3 row-span-2 row-start-1 h-7 shrink-0 px-2.5 text-xs"
                disabled={!active}
                aria-label={`Select ${c.name}`}
                onClick={() => onPick(c.id, c.name)}
              >
                Select
              </Button>
            </li>
          );
        })}
        {!rows.length && (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            No matching products. Describe another item or add it manually.
          </li>
        )}
      </ul>
  );
}

function emphasizeReply(text: string) {
  if (text.includes("**")) return text;
  return text
    .replace(/“([^”\n]+)”/g, "**“$1”**")
    .replace(/\b(How many do you need\?|What quantity do you need\?|Review request|I couldn’t find|I couldn't find|I found \d+ (?:available catalog )?(?:matches|match))/g, "**$1**");
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
  const [replyError, setReplyError] = useState("");
  const reply = useServerFn(procurementReply);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string>();
  const [receipt, setReceipt] = useState("");
  const [saveError, setSaveError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const conversationKey = useRef("");
  const busy = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const r = conversation?.request;
  const messages = useMemo(() => conversation?.messages ?? [], [conversation?.messages]);
  const lastAi = useMemo(() => [...messages].reverse().find((m) => m.role === "ai"), [messages]);
  const lastIsAi = messages.at(-1)?.role === "ai";
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, typing, open]);
  if (!me || me.role === "approver") return null;

  const persist = async (proposal: ProcurementConversation["request"]) => {
    if (
      !proposal.items.length ||
      procurementDraftBlockers(proposal, getDB()).length ||
      busy.current ||
      submitted
    )
      return;
    busy.current = true;
    setSaving(true);
    setSaveError("");
    conversationKey.current ||= `pd_ai_${crypto.randomUUID()}`;
    const key = conversationKey.current;
    try {
      mutate((workspace) => applyProcurementDraft(workspace, proposal, me.id, key));
      await waitForWorkspaceSave();
      const saved = getDB().requests.find((request) => request.activity.some((a) => a.id === key));
      if (!saved) throw new Error("I couldn’t find the saved draft. Please retry.");
      setDraftId(saved.id);
      setReceipt(
        `I’ve saved your draft, ${saved.id}. Review request to check the remaining details before sending it for approval.`,
      );
      setUndo([]);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "I couldn’t save your request. Retry to save the same draft.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const send = async (value: string, label?: string) => {
    if (!value.trim() || saving || typing || submitted) return;
    const current = conversation ?? startConversation(db, me.id);
    setUndo((h) => [...h, structuredClone(current)]);
    // Show the user's message immediately, then the reply after a short beat.
    setConversation({
      ...current,
      messages: [
        ...current.messages,
        { id: `u_${Date.now()}`, role: "user", text: label ?? value },
      ],
    });
    setText("");
    setReplyError("");
    setTyping(true);
    // Yield one frame so genuine catalog-search activity can be observed.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const next = converse(getDB(), current, value, label);
    setConversation(next);
    const message = next.messages.at(-1);
    try {
      if (
        message?.role === "ai" &&
        !label &&
        !/^(confirm|confirm-request|more|manual|catalog|supplier)$/.test(value)
      ) {
        const response = await reply({
          data: {
            history: next.messages.slice(0, -1).map((m) => ({
              role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
              content: m.text,
            })),
            facts: message.text,
          },
        });
        setConversation((active) =>
          active
            ? {
                ...active,
                messages: active.messages.map((m) =>
                  m.id === message.id ? { ...m, text: response.text } : m,
                ),
              }
            : active,
        );
      }
      if (
        next.draftConfirmed &&
        !next.pending &&
        !next.line &&
        (JSON.stringify(next.request) !== JSON.stringify(current.request) || !draftId)
      )
        await persist(next.request);
    } catch (error) {
      setReplyError(
        error instanceof Error
          ? error.message
          : "AI replies are unavailable. Your purchase details are unchanged.",
      );
    } finally {
      setTyping(false);
      input.current?.focus();
    }
  };
  const restart = () => {
    if (typing || saving) return;
    if (
      messages.length &&
      !window.confirm(
        draftId
          ? "Start a new conversation? Your saved draft will remain in Requests."
          : "Discard this proposal and start a new conversation?",
      )
    )
      return;
    setConversation(null);
    setUndo([]);
    setText("");
    setPreview(false);
    setDraftId(undefined);
    setReceipt("");
    setSaveError("");
    setReplyError("");
    setSubmitted(false);
    conversationKey.current = "";
  };
  const sendForApproval = async () => {
    if (!draftId || saving || typing || conversation?.pending || conversation?.line || submitted)
      return;
    const request = getDB().requests.find((item) => item.id === draftId);
    if (!request || request.requesterId !== me.id || request.status !== "draft") return;
    const missing = procurementBlockers(request, getDB());
    if (missing.length) {
      setReceipt(
        `Before I can send ${draftId} for approval, I need: ${missing.join("; ")}. Tell me here or open the draft.`,
      );
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      submitRequest(draftId, me.id);
      setSubmitted(true);
      await waitForWorkspaceSave();
      setReceipt(`Your request ${draftId} has been sent for approval. Nothing has been ordered.`);
      toast.success("Request sent for approval");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Submission couldn’t be saved. Retry saving without submitting again.",
      );
    } finally {
      setSaving(false);
    }
  };
  const hasItems = !!r?.items.length;
  const blockers = r
    ? draftId && conversation?.intent === "approval"
      ? procurementBlockers(r, db)
      : procurementDraftBlockers(r, db)
    : [];
  const checks =
    hasItems && r ? runChecks(r, db).filter((c) => c.level !== "ok" && c.id !== "req") : [];
  const budgets = r?.departmentId ? budgetStatuses(r, db) : [];
  const route = hasItems && r ? computeRoute(r, db) : [];
  const line = conversation?.line;
  const examples = [
    "I need 4 laptops for Engineering",
    "20 hours of consulting at $125 per hour",
    "Infrastructure project",
  ];
  const recent = purchaseSuggestions(db, me.id).slice(0, 3);

  const interactive = (m: Msg) => m === lastAi && lastIsAi && !typing && !saving && !submitted;
  const mark = (
    <span className="pd-ai-mark size-8">
      <WandSparkles className="size-4" />
    </span>
  );

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-primary/25 bg-gradient-to-r from-accent to-surface text-primary"
        onClick={() => setOpen(true)}
      >
        <span className="pd-ai-mark size-4">
          <WandSparkles className="!size-2.5" />
        </span>{" "}
        Procurement AI
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          overlayClassName="bg-foreground/15 backdrop-blur-[3px]"
          className={cn(
            "flex w-full flex-col gap-0 overflow-hidden bg-surface p-0 transition-[max-width] duration-300 ease-out",
            hasItems || line
              ? "sm:max-w-[min(1080px,calc(100vw-32px))]"
              : "sm:max-w-[min(680px,calc(100vw-32px))]",
          )}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
        >
          <header className="flex shrink-0 items-center gap-2.5 border-b border-border/60 px-4 py-3 pr-12">
            {mark}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-sm font-semibold">Procurement AI</SheetTitle>
              <SheetDescription className="text-[11px]">{db.org.name}</SheetDescription>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label="Start over"
              title="Start over"
              onClick={restart}
            >
              <RotateCcw />
            </Button>
          </header>
          {(hasItems || line) && r && (
            <div
              className="flex shrink-0 gap-1 border-b border-border px-4 py-1.5 md:hidden"
              role="tablist"
            >
              {(
                [
                  [false, "Conversation"],
                  [true, `Proposal · ${money(totals(r).total)}`],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={String(v)}
                  role="tab"
                  aria-selected={preview === v}
                  onClick={() => setPreview(v)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    preview === v
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              (hasItems || line) && "md:grid md:grid-cols-[minmax(0,1fr)_minmax(300px,36%)]",
            )}
          >
            <section
              aria-label="Procurement conversation"
              className={cn("flex min-h-0 min-w-0 flex-1 flex-col", preview && "hidden md:flex")}
            >
              <Conversation className="min-h-0">
                <ConversationContent className="gap-5 px-5 py-6">
                  {!messages.length ? (
                    <div className="flex min-h-full flex-col items-center justify-center pb-10 text-center">
                      <span className="pd-ai-mark size-12">
                        <WandSparkles className="size-6" />
                      </span>
                      <h2 className="mt-4 text-xl font-semibold tracking-tight">
                        What do you need to buy?
                      </h2>
                      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
                        Products, services or project purchases.
                      </p>
                      {!!recent.length && (
                        <div className="mt-6 w-full max-w-sm text-left">
                          <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                            Your recent requests
                          </p>
                          <div className="divide-y divide-border">
                            {recent.map((h) => (
                              <Button
                                key={h.key}
                                variant="ghost"
                                className="h-auto w-full justify-between gap-3 whitespace-normal px-0 py-2 text-left"
                                onClick={() => {
                                  const initial = converse(
                                    db,
                                    startConversation(db, me.id),
                                    h.item.name || h.item.description,
                                  );
                                  setUndo([startConversation(db, me.id)]);
                                  setConversation(
                                    converse(
                                      db,
                                      initial,
                                      `repeat:${h.key}`,
                                      `Use my ${h.request.id} as a starting point`,
                                    ),
                                  );
                                  input.current?.focus();
                                }}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block break-words text-xs font-medium">
                                    {h.item.name || h.item.description}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {h.request.id} · {smartDate(h.request.updatedAt.slice(0, 10))}
                                  </span>
                                </span>
                                <ArrowRight className="size-3.5 shrink-0" />
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="space-y-5"
                      role="log"
                      aria-label="Conversation messages"
                      aria-live="polite"
                    >
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className="animate-in fade-in slide-in-from-bottom-1 duration-200"
                        >
                          <Message
                            from={m.role === "ai" ? "assistant" : "user"}
                            className="max-w-full"
                          >
                            <div className="flex min-w-0 gap-3">
                              {m.role === "ai" && (
                                <span className="pd-ai-mark mt-0.5 size-6 shrink-0">
                                  <WandSparkles className="size-3" />
                                </span>
                              )}
                              <MessageContent className="min-w-0 break-words group-[.is-user]:bg-subtle group-[.is-user]:text-foreground">
                                {m.role === "ai" ? (
                                  <MessageResponse className="font-normal [&_strong]:font-semibold">{emphasizeReply(m.text)}</MessageResponse>
                                ) : (
                                  m.text
                                )}
                              </MessageContent>
                            </div>
                          </Message>
                          {m.search && (
                            <div
                              className="mb-3 ml-9 border-l-2 border-border pl-3 text-xs text-muted-foreground"
                              role="status"
                            >
                              <p className="flex items-center gap-2">
                                <Check className="size-3.5 text-success" /> Catalog search complete
                              </p>
                              <p className="mt-1 break-words">
                                “{m.search.query}” · {m.search.count} exact{" "}
                                {m.search.count === 1 ? "match" : "matches"}
                              </p>
                            </div>
                          )}
                          {m.role === "ai" && m.widget === "suppliers" && m.suppliers && (
                            <div className="mt-3 pl-9">
                              <div className="rounded-xl border border-border bg-surface p-3">
                                <p className="text-xs font-semibold">Approved suppliers</p>
                                <ul className="mt-2 space-y-1.5">
                                  {m.suppliers.map((v) => (
                                    <li key={v.id}>
                                      <button
                                        type="button"
                                        disabled={!interactive(m)}
                                        onClick={() => send(`vendor:${v.id}`, `Buy from ${v.name}`)}
                                        className="w-full rounded-lg border border-border bg-subtle/50 px-3 py-2 text-left transition-colors hover:bg-subtle disabled:cursor-default disabled:hover:bg-subtle/50"
                                      >
                                        <span className="block text-sm font-medium">{v.name}</span>
                                        <span className="block text-xs text-muted-foreground">{v.note}</span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                          {m.role === "ai" && m.followUp && (
                            <div className="mt-3 pl-9 text-sm">
                              <MessageResponse className="font-normal [&_strong]:font-semibold">{emphasizeReply(m.followUp)}</MessageResponse>
                            </div>
                          )}
                          {m.role === "ai" && m.widget === "catalog" && (
                            <div className="mt-3 pl-9">
                              <CatalogPicker
                                db={db}
                                query={m.query ?? ""}
                                active={interactive(m)}
                                onPick={(id, name) => send(id, name)}
                              />
                            </div>
                          )}
                          {m.role === "ai" && m.options && interactive(m) && (
                            <div className="mt-3 flex flex-wrap gap-1.5 pl-9">
                              {m.options.map((o) => (
                                <Button
                                  key={o.value + o.label}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-auto max-w-full flex-wrap justify-start gap-1.5 whitespace-normal rounded-full px-3 py-1.5 text-left text-xs"
                                  onClick={() => send(o.value, o.label)}
                                >
                                  {o.label}
                                  {o.hint && (
                                    <span className="text-[10px] font-normal text-muted-foreground">
                                      {o.hint}
                                    </span>
                                  )}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {typing && (
                        <div
                          className="flex items-center gap-3"
                          aria-label="Procurement AI is working"
                        >
                          <span className="pd-ai-mark size-6 animate-pulse">
                            <WandSparkles className="size-3" />
                          </span>
                          <span className="flex gap-1">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className="size-1.5 rounded-full bg-primary/60 ai-thinking-dot"
                                style={{ animationDelay: `${i * 150}ms` }}
                              />
                            ))}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {messages.at(-1)?.role === "user"
                              ? "Searching catalog and checking your purchase history…"
                              : "Preparing your next step…"}
                          </span>
                        </div>
                      )}
                      {replyError && (
                        <p role="alert" className="text-xs text-destructive">
                          {replyError}
                        </p>
                      )}
                      {(receipt || saving || saveError) && (
                        <div
                          className="border-t border-border pt-3 text-xs leading-relaxed"
                          role="status"
                          aria-live="polite"
                        >
                          {saving ? (
                            <p className="flex items-center gap-2">
                              <LoaderCircle className="size-3.5 animate-spin" /> Saving your
                              request…
                            </p>
                          ) : (
                            receipt && <p>{receipt}</p>
                          )}
                          {saveError && (
                            <div className="mt-2 text-destructive">
                              <p>{saveError}</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={() => {
                                  if (submitted) {
                                    setSaving(true);
                                    void waitForWorkspaceSave()
                                      .then(() => {
                                        setSaveError("");
                                        setReceipt(
                                          `Your request ${draftId} has been sent for approval.`,
                                        );
                                      })
                                      .catch((e: Error) => setSaveError(e.message))
                                      .finally(() => setSaving(false));
                                  } else if (r) void persist(r);
                                }}
                              >
                                Retry saving
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div ref={end} />
                </ConversationContent>
                <ConversationScrollButton aria-label="Latest message" />
              </Conversation>
              <div className="shrink-0 px-4 pb-3 pt-1">
                {!messages.length && (
                  <div className="mb-2.5 flex flex-wrap justify-center gap-1.5">
                    {examples.map((e) => (
                      <Button
                        key={e}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto whitespace-normal rounded-full px-3 py-1.5 text-xs"
                        onClick={() => send(e)}
                      >
                        {e}
                      </Button>
                    ))}
                  </div>
                )}
                <PromptInput
                  onSubmit={({ text: value }) => send(value)}
                  maxFiles={0}
                  className="[&_[data-slot=input-group]]:rounded-xl [&_[data-slot=input-group]]:bg-surface"
                >
                  <PromptInputTextarea
                    ref={input}
                    aria-label="Message Procurement AI"
                    autoFocus
                    placeholder={
                      conversation?.pending ? "Tell me what to change…" : "Describe what you need…"
                    }
                    value={text}
                    maxLength={4000}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-12 text-sm"
                  />
                  <PromptInputFooter>
                    {undo.length > 0 && !typing && !draftId && !saving ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          const previous = undo.at(-1);
                          if (previous) {
                            setConversation(previous);
                            setUndo((h) => h.slice(0, -1));
                            input.current?.focus();
                          }
                        }}
                      >
                        <Undo2 /> Undo
                      </Button>
                    ) : (
                      <span />
                    )}
                    <PromptInputSubmit
                      status={typing ? "submitted" : "ready"}
                      disabled={!text.trim() || saving || typing || submitted}
                      aria-label="Send message"
                      className="rounded-full"
                    >
                      {!typing && <ArrowUp />}
                    </PromptInputSubmit>
                  </PromptInputFooter>
                </PromptInput>
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  {submitted
                    ? "Sent for approval · Nothing ordered"
                    : "Nothing is created until the required details are confirmed"}
                </p>
              </div>
            </section>
            {r && (hasItems || line) && (
              <aside
                aria-label="Request proposal"
                className={cn(
                  "min-h-0 flex-1 flex-col border-border bg-subtle/40 md:flex md:border-l animate-in fade-in slide-in-from-right-4 duration-300",
                  preview ? "flex" : "hidden",
                )}
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="pd-section-title">
                        {submitted ? "Sent for approval" : draftId ? "Your draft" : "Your request"}
                      </p>
                      {draftId && (
                        <p className="mt-1 text-xs font-medium">
                          {draftId} ·{" "}
                          {saving
                            ? "Saving…"
                            : saveError
                              ? "Save pending"
                              : submitted
                                ? "Pending approval"
                                : "Saved"}
                        </p>
                      )}
                    </div>
                  </div>
                  <ul className="mt-2 divide-y divide-border">
                    {r.items.map((item) => (
                      <li key={item.id} className="py-2.5 animate-in fade-in">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 break-words text-xs font-medium">
                            {item.name || item.description}
                          </p>
                          <span className="num shrink-0 text-xs font-semibold">
                            {item.unitPrice > 0 ? money(lineTotal(item)) : "Price needed"}
                          </span>
                        </div>
                        {item.description && item.name && (
                          <p className="mt-0.5 line-clamp-2 break-words text-[11px] text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                        <dl className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="min-w-0">
                            <dt className="text-muted-foreground">Supplier</dt>
                            <dd className="truncate font-medium">
                              {db.vendors.find((v) => v.id === item.vendorId)?.name ?? "Needed"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Unit price</dt>
                            <dd className="num font-medium">
                              {item.unitPrice > 0 ? money(item.unitPrice) : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Qty</dt>
                            <dd className="num font-medium">{item.qty}</dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                    {line && (
                      <li className="py-2.5">
                        <p className="break-words text-xs font-medium text-muted-foreground">
                          {line.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Suggested · Not added yet
                        </p>
                      </li>
                    )}
                  </ul>
                  {hasItems && (
                    <>
                      <div className="flex justify-between border-t border-border pt-2.5 text-sm font-semibold">
                        <span>Estimated total</span>
                        <span className="num">{money(totals(r).total)}</span>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        {r.departmentId && (
                          <div>
                            <dt className="text-muted-foreground">Department</dt>
                            <dd className="mt-0.5 break-words font-medium">
                              {db.departments.find((d) => d.id === r.departmentId)?.name}
                            </dd>
                          </div>
                        )}
                        {r.requiredBy && (
                          <div>
                            <dt className="text-muted-foreground">Required by</dt>
                            <dd className="mt-0.5 font-medium">{smartDate(r.requiredBy)}</dd>
                          </div>
                        )}
                        {r.project && (
                          <div className="col-span-2 min-w-0">
                            <dt className="text-muted-foreground">Project</dt>
                            <dd className="mt-0.5 break-words font-medium">{r.project}</dd>
                          </div>
                        )}
                        {budgets.map((b) => (
                          <div key={b.budget.id} className="col-span-2">
                            <dt className="text-muted-foreground">Budget</dt>
                            <dd className="mt-0.5 font-medium">
                              {b.budget.name}{" "}
                              <span
                                className={cn(
                                  "font-normal",
                                  b.over ? "text-destructive" : "text-success",
                                )}
                              >
                                ·{" "}
                                {b.over
                                  ? `${money(-b.remaining)} over`
                                  : `${money(b.remaining)} left`}
                              </span>
                            </dd>
                          </div>
                        ))}
                        {route.length > 0 && (
                          <div className="col-span-2">
                            <dt className="text-muted-foreground">Approvals</dt>
                            <dd className="mt-0.5">{route.map((s) => s.name).join(" → ")}</dd>
                          </div>
                        )}
                      </dl>
                      {blockers.length > 0 && (
                        <div className="mt-4 border-t border-border pt-3">
                          <p className="text-xs font-medium">
                            {draftId ? "Needed before approval" : "Details to complete"}
                          </p>
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {blockers.map((item) => (
                              <li key={item} className="break-words">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {r.departmentId && (
                        <div className="mt-4 border-t border-border pt-3">
                          {checks.length ? (
                            checks.map((c) => (
                              <div key={c.id} className="mt-2 text-xs first:mt-0">
                                <p
                                  className={
                                    c.level === "error" ? "text-attention" : "text-warning"
                                  }
                                >
                                  {c.title}
                                </p>
                                <p className="mt-0.5 leading-relaxed text-muted-foreground">
                                  {c.detail}
                                </p>
                              </div>
                            ))
                          ) : !blockers.length ? (
                            <p className="flex items-center gap-1.5 text-xs text-success">
                              <Check className="size-3.5" /> All checks pass
                            </p>
                          ) : null}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <footer className="shrink-0 border-t border-border p-3">
                  {draftId && conversation?.intent === "approval" && !submitted ? (
                    <Button
                      className="w-full"
                      disabled={
                        saving ||
                        typing ||
                        !!line ||
                        !!conversation.pending ||
                        !!saveError ||
                        !!blockers.length
                      }
                      onClick={() => void sendForApproval()}
                    >
                      Send for approval
                      <ArrowRight />
                    </Button>
                  ) : draftId ? (
                    <Button
                      className="w-full"
                      disabled={saving || !!saveError}
                      onClick={() => {
                        setOpen(false);
                        if (submitted)
                          void nav({ to: "/app/requests/$id", params: { id: draftId } });
                        else
                          void nav({
                            to: "/app/requests/$id/edit",
                            params: { id: draftId },
                            search: { prompt: undefined },
                          });
                      }}
                    >
                      {submitted ? "View approval status" : "Review request"}
                      <ArrowRight />
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {saving
                        ? "Creating your draft…"
                        : "Confirm the required details in the conversation first."}
                    </p>
                  )}
                </footer>
              </aside>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
