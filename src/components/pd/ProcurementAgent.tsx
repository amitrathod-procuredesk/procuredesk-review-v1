import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Laptop,
  PenLine,
  ShoppingBag,
  Trash2,
  Package,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Checkbox } from "./form";
import { PdAiIcon } from "./PdAiIcon";
import { useDB, useMe, waitForWorkspaceSave } from "@/lib/pd/store";
import { money, smartDate } from "@/lib/pd/engine";
import { signInInsights } from "@/lib/pd/insights.functions";
import {
  confirmProcurementProposal,
  procurementAgentContext,
  refreshProcurementProposal,
} from "@/lib/pd/procurementAgent.functions";
import {
  emptyAgentProposal,
  type AgentItem,
  type AgentMessage,
  type AgentPart,
  type AgentPreview,
  type AgentProposal,
} from "@/lib/pd/procurementAgent";
import { cn } from "@/lib/utils";

type Snapshot = { messages: AgentMessage[]; proposal: AgentProposal; preview?: AgentPreview };
type StreamEvent =
  | { type: "part"; part: AgentPart }
  | { type: "delta"; text: string }
  | { type: "done"; proposal: AgentProposal; preview: AgentPreview }
  | { type: "error"; message: string };
const mark = (
  <span className="pd-ai-mark size-7 shrink-0">
    <PdAiIcon className="size-[18px]" />
  </span>
);

function ProductChoices({
  items,
  active,
  onChoose,
}: {
  items: Extract<AgentPart, { type: "catalog" }>["items"];
  active: boolean;
  onChoose: (message: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Catalog matches</p>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="py-2.5">
            <Checkbox
              checked={selected.includes(item.id)}
              disabled={!active}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked ? [...s, item.id] : s.filter((id) => id !== item.id),
                )
              }
              className="w-full items-start"
              label={
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap justify-between gap-2 text-xs font-medium">
                    <span>{item.name}</span>
                    <span className="tabular-nums">{money(item.price)} each</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {item.supplier}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {item.description}
                  </span>
                </span>
              }
            />
          </li>
        ))}
      </ul>
      {active && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={!selected.length}
          onClick={() =>
            onChoose(
              `Select these catalog items: ${selected
                .map((id) => {
                  const i = items.find((x) => x.id === id);
                  return `${i?.name} [catalog ID ${id}]`;
                })
                .join(
                  "; ",
                )}. Keep them as separate items and ask for any missing individual quantities.`,
            )
          }
        >
          Use selected {selected.length ? `(${selected.length})` : "items"}
          <ArrowRight />
        </Button>
      )}
    </div>
  );
}

function ItemDetails({
  item,
  active,
  onRemove,
}: {
  item: AgentItem;
  active: boolean;
  onRemove: () => void;
}) {
  const name = item.name.toLowerCase();
  const ProductIcon = /\b(pen|pens|pencil|pencils|marker|markers)\b/.test(name)
    ? PenLine
    : /\b(paper|notebook|notebooks|ream|reams)\b/.test(name)
      ? FileText
      : /\b(laptop|computer|monitor|tablet)\b/.test(name)
        ? Laptop
        : /\b(license|software|subscription)\b/.test(name)
          ? ShoppingBag
          : Package;
  return (
    <li className="flex items-start gap-2.5 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground" aria-hidden="true">
        <ProductIcon className="size-5" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs font-medium">{item.name}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {item.quantity ?? "Qty needed"} {item.unit?.toLowerCase() ?? "· Unit needed"}
        </p>
        {item.description && (
          <p className="mt-1 break-words text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
        )}
        {item.unitPrice !== null && (
          <p className="mt-1 text-xs font-medium tabular-nums">
            {money(item.unitPrice * (item.quantity ?? 0))}
          </p>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        disabled={!active}
        onClick={onRemove}
        aria-label={`Remove ${item.name}`}
        title={`Remove ${item.name}`}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

export function ProcurementAgent() {
  const db = useDB();
  const me = useMe();
  const nav = useNavigate();
  const restore = useServerFn(signInInsights);
  const context = useServerFn(procurementAgentContext);
  const confirm = useServerFn(confirmProcurementProposal);
  const refresh = useServerFn(refreshProcurementProposal);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [proposal, setProposal] = useState<AgentProposal>(emptyAgentProposal);
  const [preview, setPreview] = useState<AgentPreview>();
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming">("ready");
  const [showMissing, setShowMissing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; status: string }>();
  const [undo, setUndo] = useState<Snapshot[]>([]);
  const [mobileItems, setMobileItems] = useState(false);
  const [confirmation, setConfirmation] = useState<"draft" | "approval">();
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const key = useRef(crypto.randomUUID());
  const busyRef = useRef(false);
  const busy = status !== "ready";
  const hasItems = proposal.items.length > 0;
  const currentUser = me?.id;
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (open && !busy && !saving && !confirmation) input.current?.focus();
  }, [open, busy, saving, confirmation]);
  useEffect(() => {
    abort.current?.abort();
    setMessages([]);
    setProposal(emptyAgentProposal());
    setPreview(undefined);
    setReceipt(undefined);
    setUndo([]);
    setConfirmation(undefined);
    setError("");
    key.current = crypto.randomUUID();
  }, [currentUser]);
  if (!me || me.role === "approver") return null;

  const ensureSession = async () => {
    try {
      const result = await context();
      if (result.userId !== me.id) throw new Error("Account changed");
    } catch {
      await restore({ data: { email: me.email, password: me.password } });
    }
  };
  const send = async (text: string) => {
    if (!text.trim() || busyRef.current || saving || receipt?.status === "pending") return;
    busyRef.current = true;
    const snapshot = {
      messages: structuredClone(messages),
      proposal: structuredClone(proposal),
      preview,
    };
    setUndo((u) => [...u, snapshot]);
    setConfirmation(undefined);
    setError("");
    setQuestion("");
    const user: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };
    const assistant: AgentMessage = { id: crypto.randomUUID(), role: "assistant", parts: [] };
    const history = [...messages, user];
    setMessages([...history, assistant]);
    setStatus("submitted");
    abort.current = new AbortController();
    let completed = false;
    try {
      await ensureSession();
      const response = await fetch("/api/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.current.signal,
        body: JSON.stringify({
          proposal,
          history: history.map((m) => ({
            role: m.role,
            content: m.parts
              .map((p) =>
                p.type === "text"
                  ? p.text
                  : p.type === "proposal"
                    ? JSON.stringify({
                        proposal: p.proposal,
                        preview: {
                          total: p.preview.total,
                          approvers: p.preview.approvers,
                          draftMissing: p.preview.draftMissing,
                          approvalMissing: p.preview.approvalMissing,
                        },
                      })
                    : JSON.stringify(p),
              )
              .join("\n"),
          })),
        }),
      });
      if (!response.ok || !response.body) {
        const result = await response.json();
        throw new Error(result.error ?? "Could not connect to Procurement AI.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const update = (event: StreamEvent) => {
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") {
          completed = true;
          setProposal(event.proposal);
          setPreview(event.preview);
          return;
        }
        setStatus("streaming");
        setMessages((ms) =>
          ms.map((m) => {
            if (m.id !== assistant.id) return m;
            const parts = [...m.parts];
            if (event.type === "delta") {
              const last = parts.at(-1);
              if (last?.type === "text")
                parts[parts.length - 1] = { type: "text", text: last.text + event.text };
              else parts.push({ type: "text", text: event.text });
            } else if (event.part.type === "tool") {
              const part = event.part;
              const index = parts.findIndex((p) => p.type === "tool" && p.id === part.id);
              if (index >= 0) parts[index] = part;
              else parts.push(part);
            } else parts.push(event.part);
            return { ...m, parts };
          }),
        );
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let end = buffer.indexOf("\n");
        while (end >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (line.trim()) update(JSON.parse(line));
          end = buffer.indexOf("\n");
        }
        if (done) break;
      }
      if (!completed)
        throw new Error("The reply did not finish. Your last confirmed details are unchanged.");
    } catch (e) {
      setConfirmation(undefined);
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "Reply stopped. Your last confirmed items are unchanged."
          : e instanceof Error
            ? e.message
            : "Could not complete this reply.",
      );
      setQuestion(text);
    } finally {
      busyRef.current = false;
      setStatus("ready");
      input.current?.focus();
    }
  };
  const restart = () => {
    if (
      busy ||
      saving ||
      (messages.length &&
        !window.confirm(
          receipt
            ? "Start over? Your saved request stays in Requests."
            : "Discard these selected items and start over?",
        ))
    )
      return;
    setMessages([]);
    setProposal(emptyAgentProposal());
    setPreview(undefined);
    setUndo([]);
    setReceipt(undefined);
    setQuestion("");
    setError("");
    setConfirmation(undefined);
    key.current = crypto.randomUUID();
  };
  const beginConfirmation = async (action: "draft" | "approval") => {
    setSaving(true);
    setError("");
    try {
      await waitForWorkspaceSave();
      await ensureSession();
      setPreview(await refresh({ data: proposal }));
      setConfirmation(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check your request.");
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (!confirmation || !preview || saving) return;
    setSaving(true);
    setError("");
    try {
      await ensureSession();
      const result = await confirm({
        data: {
          proposal,
          key: key.current,
          action: confirmation,
          fingerprint: preview.fingerprint,
        },
      });
      setReceipt(result);
      setConfirmation(undefined);
      setUndo([]);
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [
            {
              type: "text",
              text:
                result.status === "pending"
                  ? `**${result.id}** has been sent for approval to **${result.approvers.join(" → ")}**. Nothing has been ordered.`
                  : `Your draft **${result.id}** is saved. You can keep filling in details here or open it in Requests.`,
            },
          ],
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Retry the same action.");
    } finally {
      setSaving(false);
    }
  };
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const active = !busy && !saving && receipt?.status !== "pending";
  const proposalsValid = !error && !!preview && hasItems;
  const missing = confirmation === "approval" ? preview?.approvalMissing : preview?.draftMissing;
  const suggestions = lastAssistant?.parts.filter((p) => p.type === "choices").at(-1);
  const recentPurchases = db.requests
    .filter((r) => r.requesterId === me.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-primary/25 bg-accent text-primary"
        onClick={() => setOpen(true)}
      >
        <Package className="size-4" />
        Procurement AI
      </Button>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!value && busy) abort.current?.abort();
          setOpen(value);
        }}
      >
        <SheetContent
          side="right"
          overlayClassName="bg-foreground/15 backdrop-blur-sm"
          className={cn(
            "flex w-full flex-col gap-0 overflow-hidden bg-surface p-0",
            hasItems
              ? "sm:max-w-[min(1040px,calc(100vw-32px))]"
              : "sm:max-w-[min(680px,calc(100vw-32px))]",
          )}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
        >
          <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3 pr-12">
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
              disabled={busy || saving}
              onClick={restart}
            >
              <RotateCcw />
            </Button>
          </header>
          {hasItems && (
            <div
              className="flex shrink-0 gap-4 border-b border-border px-4 md:hidden"
              role="tablist"
            >
              {[
                [false, "Conversation"],
                [true, `Items (${proposal.items.length})`],
              ].map(([value, label]) => (
                <Button
                  key={String(value)}
                  variant="ghost"
                  role="tab"
                  aria-selected={mobileItems === value}
                  className={cn(
                    "rounded-none border-b-2 px-0 text-xs",
                    mobileItems === value
                      ? "border-primary"
                      : "border-transparent text-muted-foreground",
                  )}
                  onClick={() => setMobileItems(value === true)}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          <div
            className={cn(
              "flex min-h-0 flex-1",
              hasItems && "md:grid md:grid-cols-[minmax(0,1fr)_300px]",
            )}
          >
            <section
              aria-label="Procurement conversation"
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col",
                hasItems && mobileItems && "hidden md:flex",
              )}
            >
              <Conversation className="min-h-0">
                <ConversationContent className="gap-5 px-4 py-5 sm:px-5">
                  {!messages.length && (
                    <div className="flex min-h-64 flex-col items-center justify-center text-center">
                      {mark}
                      <h2 className="mt-4 text-xl font-semibold">What do you need to buy?</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Hi {me.name.split(" ")[0]}.
                      </p>
                      {recentPurchases.length > 0 && (
                        <div className="mt-8 w-full max-w-sm text-left">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            Your recent purchases
                          </p>
                          <ul className="divide-y divide-border border-y border-border">
                            {recentPurchases.map((r) => (
                              <li key={r.id}>
                                <button
                                  type="button"
                                  className="group flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:text-primary"
                                  onClick={() => {
                                    setQuestion(`I need another ${r.title}`);
                                    input.current?.focus();
                                  }}
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">
                                      {r.title}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                      {r.id} · {smartDate(r.createdAt)}
                                    </span>
                                  </span>
                                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  {messages
                    .filter((message) => message.role === "user" || message.parts.length > 0)
                    .map((message) => (
                    <Message key={message.id} from={message.role} className="max-w-full">
                      <div className="flex min-w-0 gap-2.5">
                        {message.role === "assistant" && mark}
                        <MessageContent className="min-w-0 flex-1 group-[.is-user]:bg-subtle group-[.is-user]:text-foreground">
                          {message.parts.map((part, index) => {
                            if (part.type === "text")
                              return (
                                <MessageResponse
                                  key={index}
                                  className="text-sm font-normal [&_strong]:font-semibold"
                                >
                                  {part.text}
                                </MessageResponse>
                              );
                            if (part.type === "tool")
                              return (
                                <Tool
                                  key={part.id}
                                  defaultOpen={false}
                                  className="my-2 border-border/60"
                                >
                                  <ToolHeader
                                    type="dynamic-tool"
                                    toolName={part.name}
                                    title={part.name}
                                    state={
                                      part.status === "running"
                                        ? "input-available"
                                        : part.status === "error"
                                          ? "output-error"
                                          : "output-available"
                                    }
                                    className="gap-2 px-2.5 py-2 [&_span]:text-[11px]"
                                  />
                                  <ToolContent className="p-2.5 text-xs text-muted-foreground">
                                    {part.summary || "Checking current organization records…"}
                                  </ToolContent>
                                </Tool>
                              );
                            if (part.type === "catalog")
                              return (
                                <ProductChoices
                                  key={index}
                                  items={part.items}
                                  active={active && message === lastAssistant}
                                  onChoose={(text) => void send(text)}
                                />
                              );
                            if (part.type === "suppliers")
                              return (
                                <div key={index} className="my-3">
                                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                                    Relevant approved suppliers
                                  </p>
                                  <ul className="divide-y divide-border">
                                    {part.items.map((supplier) => (
                                      <li key={supplier.id}>
                                        <Button
                                          variant="ghost"
                                          disabled={!active || message !== lastAssistant}
                                          className="h-auto w-full justify-start whitespace-normal px-0 py-2 text-left"
                                          onClick={() =>
                                            void send(
                                              `Use ${supplier.name} [supplier ID ${supplier.id}] for the requested items whose categories they cover. Do not assume product stock or choose prices.`,
                                            )
                                          }
                                        >
                                          <span>
                                            <span className="block text-xs font-medium">
                                              {supplier.name}
                                              {supplier.preferred ? " · Preferred" : ""}
                                            </span>
                                            <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                                              {supplier.categories.join(" · ")}
                                            </span>
                                          </span>
                                        </Button>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            return null;
                          })}
                        </MessageContent>
                      </div>
                    </Message>
                  ))}
                  {busy && (
                    <div className="flex items-center gap-2.5">
                      {mark}
                      <Shimmer className="text-xs">
                        {status === "submitted"
                          ? "Thinking about your request…"
                          : "Preparing your next step…"}
                      </Shimmer>
                    </div>
                  )}
                  {error && (
                    <div role="alert" className="text-xs text-destructive">
                      {error}
                    </div>
                  )}
                  {proposalsValid && active && !confirmation && (
                    <div className="border-t border-border pt-3 text-sm">
                      {!preview.approvalMissing.length ? (
                        <>
                          <p className="mb-2">
                            Create this request and send it to{" "}
                            <strong>{preview.approvers.join(" → ")}</strong> for approval?
                          </p>
                          <Button size="sm" onClick={() => void beginConfirmation("approval")}>
                            Create & send for approval
                            <ArrowRight />
                          </Button>
                        </>
                      ) : !preview.draftMissing.length ? (
                        <>
                          <p className="mb-2 text-xs text-muted-foreground">
                            You can save these items as a draft while completing the remaining
                            details.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void beginConfirmation("draft")}
                          >
                            {receipt ? "Update draft" : "Create draft"}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  )}
                  {confirmation && preview && (
                    <div
                      className="rounded-md border border-border bg-subtle p-3"
                      role="region"
                      aria-label="Confirm request action"
                    >
                      <p className="text-sm font-semibold">
                        {confirmation === "approval"
                          ? "Confirm request and approval"
                          : receipt
                            ? "Confirm draft update"
                            : "Confirm draft creation"}
                      </p>
                      <ul className="mt-2 space-y-1 text-xs">
                        {proposal.items.map((i) => (
                          <li key={i.id}>
                            {i.quantity ?? "—"} {i.unit?.toLowerCase()} × {i.name}
                            {i.unitPrice !== null
                              ? ` · ${money((i.quantity ?? 0) * i.unitPrice)}`
                              : " · Price needed"}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs font-medium">
                        {proposal.items.some((i) => i.unitPrice === null)
                          ? "Known subtotal"
                          : "Total"}
                        : {money(preview.total)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {db.departments.find((d) => d.id === proposal.departmentId)?.name ??
                          "Department needed"}{" "}
                        ·{" "}
                        {proposal.requiredBy
                          ? smartDate(proposal.requiredBy)
                          : "Delivery date needed"}
                      </p>
                      {proposal.shipTo && (
                        <p className="mt-1 text-xs text-muted-foreground">{proposal.shipTo}</p>
                      )}
                      {confirmation === "approval" && (
                        <p className="mt-2 text-xs">Approvers: {preview.approvers.join(" → ")}</p>
                      )}
                      {!!missing?.length && (
                        <p className="mt-2 text-xs text-destructive">
                          Still needed: {missing.join("; ")}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={saving || !!missing?.length}
                          onClick={() => void save()}
                        >
                          {saving
                            ? "Saving…"
                            : confirmation === "approval"
                              ? "Confirm & send for approval"
                              : "Confirm & save draft"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => setConfirmation(undefined)}
                        >
                          Keep editing
                        </Button>
                      </div>
                    </div>
                  )}
                  {receipt && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() => {
                        setOpen(false);
                        if (receipt.status === "pending")
                          void nav({ to: "/app/requests/$id", params: { id: receipt.id } });
                        else
                          void nav({
                            to: "/app/requests/$id/edit",
                            params: { id: receipt.id },
                            search: { prompt: undefined },
                          });
                      }}
                    >
                      {receipt.status === "pending" ? "View approval status" : "View draft"}
                      <ArrowRight />
                    </Button>
                  )}
                </ConversationContent>
                <ConversationScrollButton aria-label="Latest message" />
              </Conversation>
              <div className="shrink-0 border-t border-border/60 px-4 pb-3 pt-3">
                {active && suggestions?.type === "choices" && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {suggestions.choices.map((c) => (
                      <Button
                        key={c.label}
                        size="sm"
                        variant="ghost"
                        className="h-auto max-w-full whitespace-normal rounded-full border border-border bg-transparent px-3 py-1.5 text-left text-xs font-normal text-foreground shadow-none hover:border-primary/50 hover:bg-transparent hover:text-primary"
                        onClick={() => void send(c.message)}
                      >
                        {c.label}
                      </Button>
                    ))}
                  </div>
                )}
                {!messages.length && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {["Office stationery", "Laptops and monitors", "Consulting services"].map(
                      (example) => (
                        <Button
                          key={example}
                          size="sm"
                          variant="ghost"
                          className="rounded-full border border-border bg-transparent text-xs font-normal text-foreground shadow-none hover:border-primary/50 hover:bg-transparent hover:text-primary"
                          onClick={() => {
                            setQuestion(`I need ${example.toLowerCase()}`);
                            input.current?.focus();
                          }}
                        >
                          {example}
                        </Button>
                      ),
                    )}
                  </div>
                )}
                <PromptInput
                  maxFiles={0}
                  onSubmit={({ text }) => send(text)}
                  className="[&_[data-slot=input-group]]:rounded-lg [&_[data-slot=input-group]]:bg-surface"
                >
                  <PromptInputTextarea
                    ref={input}
                    aria-label="Message Procurement AI"
                    placeholder="Describe what you need…"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={4000}
                    disabled={saving || receipt?.status === "pending"}
                    className="min-h-12 text-sm"
                  />
                  <PromptInputFooter>
                    {undo.length > 0 && !receipt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label="Undo last message"
                        disabled={busy || saving}
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          const s = undo.at(-1);
                          if (s) {
                            setMessages(s.messages);
                            setProposal(s.proposal);
                            setPreview(s.preview);
                            setUndo((u) => u.slice(0, -1));
                            setError("");
                            setConfirmation(undefined);
                          }
                        }}
                      >
                        <Undo2 />
                        Undo
                      </Button>
                    ) : (
                      <span />
                    )}
                    <PromptInputSubmit
                      status={status}
                      onStop={() => abort.current?.abort()}
                      disabled={
                        saving || receipt?.status === "pending" || (!busy && !question.trim())
                      }
                      aria-label={busy ? "Stop reply" : "Send message"}
                    >
                      {!busy && <ArrowUp />}
                    </PromptInputSubmit>
                  </PromptInputFooter>
                </PromptInput>
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  {receipt?.status === "pending"
                    ? "Sent for approval · Nothing ordered"
                    : "Your confirmation is required to create or send a request"}
                </p>
              </div>
            </section>
            {hasItems && (
              <aside
                aria-label="Selected request items"
                className={cn(
                  "min-h-0 overflow-y-auto border-border bg-subtle/30 px-4 py-4 md:block md:border-l",
                  mobileItems ? "block flex-1" : "hidden",
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="pd-section-title">
                    {receipt?.status === "pending"
                      ? "Sent for approval"
                      : receipt
                        ? "Your draft"
                        : "Selected items"}
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    {proposal.items.length} items
                  </span>
                </div>
                <ul className="mt-1 divide-y divide-border">
                  {proposal.items.map((i) => (
                    <ItemDetails
                      key={i.id}
                      item={i}
                      active={active}
                      onRemove={() => {
                        setMobileItems(false);
                        void send(
                          `Remove only ${i.name} [${i.id}] from my selected items. Keep all others unchanged.`,
                        );
                      }}
                    />
                  ))}
                </ul>
                {preview && (
                  <>
                    <div className="flex justify-between border-t border-border py-3 text-sm font-semibold">
                      <span>
                        {proposal.items.some((i) => i.unitPrice === null)
                          ? "Known subtotal"
                          : "Estimated total"}
                      </span>
                      <span className="tabular-nums">{money(preview.total)}</span>
                    </div>
                    <dl className="space-y-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Department</dt>
                        <dd className="mt-1">
                          {db.departments.find((d) => d.id === proposal.departmentId)?.name ??
                            "Not selected"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Required by</dt>
                        <dd className="mt-1">
                          {proposal.requiredBy ? smartDate(proposal.requiredBy) : "Not provided"}
                        </dd>
                      </div>
                      {proposal.budgetId && (
                        <div>
                          <dt className="text-muted-foreground">Budget</dt>
                          <dd className="mt-1">
                            {db.budgets.find((b) => b.id === proposal.budgetId)?.name}
                          </dd>
                        </div>
                      )}
                      {proposal.shipTo && (
                        <div>
                          <dt className="text-muted-foreground">Deliver to</dt>
                          <dd className="mt-1 break-words">{proposal.shipTo}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="mt-4 border-t border-border pt-3">
                      {preview.approvalMissing.length ? (
                        <div>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 text-xs font-medium transition-colors hover:text-primary"
                            aria-expanded={showMissing}
                            onClick={() => setShowMissing((v) => !v)}
                          >
                            <span>
                              {preview.approvalMissing.length} detail
                              {preview.approvalMissing.length === 1 ? "" : "s"} needed before
                              approval
                            </span>
                            <ChevronDown
                              className={cn(
                                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                showMissing && "rotate-180",
                              )}
                            />
                          </button>
                          {showMissing && (
                            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                              {preview.approvalMissing.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="text-xs font-medium">Ready for confirmation</p>
                          <p className="mt-2 flex items-start gap-1.5 text-xs text-success">
                            <Check className="size-3.5 shrink-0" />
                            {preview.approvers.join(" → ")}
                          </p>
                        </>
                      )}
                    </div>
                  </>
                )}
              </aside>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
