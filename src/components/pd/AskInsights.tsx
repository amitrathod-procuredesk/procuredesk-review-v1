import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  BarChart3,
  Boxes,
  CircleDollarSign,
  FileText,
  Plus,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolHeader, ToolContent } from "@/components/ai-elements/tool";
import { AgentNavIcon } from "@/components/pd/agents/AgentNavIcon";
import { InsightReport } from "@/components/pd/InsightReport";
import {
  loadInsights,
  refreshInsight,
  createInsightsConversation,
  signInInsights,
} from "@/lib/pd/insights.functions";
import {
  type InsightMessage,
  type InsightReport as Report,
  type InsightQuery,
} from "@/lib/pd/insights";
import { useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export function AskInsights({ threadId }: { threadId?: string }) {
  const me = useMe();
  const router = useRouter();
  const load = useServerFn(loadInsights);
  const refresh = useServerFn(refreshInsight);
  const createThread = useServerFn(createInsightsConversation);
  const restoreSession = useServerFn(signInInsights);
  const [threads, setThreads] = useState<{ id: string; title: string; updated_at: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const newConversation = async () => {
    try {
      const t = await createThread();
      await router.navigate({ to: "/app/insights/ask/$threadId", params: { threadId: t.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create conversation");
    }
  };
  const [messages, setMessages] = useState<InsightMessage[]>([]);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">("ready");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [report, setReport] = useState<Report>();
  const [refreshing, setRefreshing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const reportPanel = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = status === "submitted" || status === "streaming";
  const currentUserId = me?.id;
  const currentEmail = me?.email;
  const currentPassword = me?.password;
  useEffect(() => {
    let active = true;
    if (!currentUserId) return;
    setMessages([]);
    setReport(undefined);
    setLoaded(false);
    setError("");
    load({ data: { userId: currentUserId, threadId } })
      .catch(async (e: unknown) => {
        if (!active) throw e;
        if (!(e instanceof Error) || !/Sign in|session expired|switch Insights accounts/i.test(e.message)) throw e;
        if (!currentEmail || !currentPassword) throw e;
        // Revalidate the existing prototype account credential on the server;
        // never authorize history from the browser's user ID alone.
        await restoreSession({ data: { email: currentEmail, password: currentPassword } });
        return load({ data: { userId: currentUserId, threadId } });
      })
      .then((v) => {
        if (active) {
          setThreads(v.threads);
          if (!threadId && v.selectedId) {
            void router.navigate({
              to: "/app/insights/ask/$threadId",
              params: { threadId: v.selectedId },
              replace: true,
            });
          }
          setMessages(v.messages);
          setVersion(v.version);
          setLoaded(true);
          const last = v.messages
            .flatMap((m) => m.parts)
            .filter((p) => p.type === "report")
            .at(-1);
          if (last?.type === "report") setReport(last.report);
        }
      })
      .catch(() => {
        if (active) {
          setError("Ask Insights could not connect. Please refresh and try again.");
        }
      });
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, [load, restoreSession, currentUserId, currentEmail, currentPassword, threadId, router]);
  useEffect(() => {
    if (loaded && !busy) input.current?.focus();
  }, [loaded, busy, threadId]);
  const updateReport = async (q: InsightQuery) => {
    setRefreshing(true);
    setError("");
    try {
      setReport(await refresh({ data: q }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh report.");
    } finally {
      setRefreshing(false);
    }
  };
  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    if (!threadId) {
      try {
        const t = await createThread();
        sessionStorage.setItem("pd-insights-pending", text);
        await router.navigate({ to: "/app/insights/ask/$threadId", params: { threadId: t.id } });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start conversation");
      }
      return;
    }
    setError("");
    setQuestion("");
    setStatus("submitted");
    const next: InsightMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] },
    ];
    const assistant: InsightMessage = { id: crypto.randomUUID(), role: "assistant", parts: [] };
    setMessages(next);
    const controller = new AbortController();
    abort.current = controller;
    let completed = false;
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, version, threadId }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Could not answer.");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Answer stream unavailable.");
      let buffer = "";
      const decoder = new TextDecoder();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          setStatus("streaming");
          if (event.type === "delta") {
            const part = assistant.parts.at(-1);
            if (part?.type === "text") part.text += event.text;
            else assistant.parts.push({ type: "text", text: event.text });
            setMessages([...next, { ...assistant, parts: [...assistant.parts] }]);
          }
          if (event.type === "report") {
            assistant.parts.push({ type: "report", report: event.report });
            setReport(event.report);
            setMessages([...next, { ...assistant, parts: [...assistant.parts] }]);
          }
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") {
            completed = true;
            setMessages(event.messages);
            setVersion(event.version);
            setStatus("ready");
            setThreads((ts) =>
              ts.map((t) =>
                t.id === threadId
                  ? { ...t, title: messages.length ? t.title : text.slice(0, 80) }
                  : t,
              ),
            );
          }
        }
      }
      if (!completed) throw new Error("The answer stopped before it was saved.");
    } catch (e) {
      setStatus("error");
      setQuestion(text);
      setMessages(messages);
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "Stopped. Your question is preserved; the unfinished answer was not saved."
          : e instanceof Error
            ? e.message
            : "Could not answer.",
      );
    } finally {
      abort.current = null;
      input.current?.focus();
    }
  };
  useEffect(() => {
    if (threadId && loaded) {
      const pending = sessionStorage.getItem("pd-insights-pending");
      if (pending) {
        sessionStorage.removeItem("pd-insights-pending");
        setQuestion(pending);
        input.current?.focus();
      }
    }
  }, [threadId, loaded]);
  return (
    <div className="flex min-h-[calc(100dvh-124px)] flex-col md:min-h-[calc(100dvh-60px)]">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-7">
        <h1 className="text-sm font-medium text-muted-foreground">Ask Insights</h1>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="New conversation"
                  disabled={busy || !loaded}
                  onClick={newConversation}
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New conversation</TooltipContent>
            </Tooltip>
            <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Conversation history"
                      disabled={busy}
                    >
                      <History className="size-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Past conversations</TooltipContent>
              </Tooltip>
              <PopoverContent align="end" className="w-80 max-w-[calc(100vw-32px)] p-2">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  Past conversations
                </p>
                <nav aria-label="Conversation history" className="max-h-64 overflow-y-auto">
                  {threads.map((t) => (
                    <Button
                      key={t.id}
                      variant={t.id === threadId ? "secondary" : "ghost"}
                      className="h-auto w-full justify-start py-3 text-left"
                      onClick={() => {
                        setHistoryOpen(false);
                        void router.navigate({
                          to: "/app/insights/ask/$threadId",
                          params: { threadId: t.id },
                        });
                      }}
                    >
                      <History />
                      <span className="truncate">{t.title}</span>
                    </Button>
                  ))}
                  {!threads.length && (
                    <p className="py-3 text-sm text-muted-foreground">No past conversations yet.</p>
                  )}
                </nav>
              </PopoverContent>
            </Popover>
          </div>
        </TooltipProvider>
      </div>
      <div
        className={cn(
          "grid min-w-0 flex-1",
          report && "lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col",
            !messages.length && "justify-center px-5 pb-8 sm:px-7 sm:pb-16",
            report ? "border-border lg:border-r" : "mx-auto w-full max-w-3xl",
          )}
        >
          {!messages.length && (
            <div className="mb-6 text-center">
              <AgentNavIcon className="mx-auto mb-4 size-8 text-primary" />
              <h2 className="text-2xl font-semibold sm:text-3xl">What would you like to know?</h2>
            </div>
          )}
          {!!messages.length && (
            <Conversation
              className={cn(
                "min-h-72",
                report
                  ? "max-h-[45dvh] lg:max-h-[calc(100dvh-320px)]"
                  : "max-h-[calc(100dvh-280px)]",
              )}
            >
              <ConversationContent className="gap-6 p-5 sm:p-7">
                {messages.map((m) => (
                  <Message key={m.id} from={m.role}>
                    <MessageContent
                      className={cn(
                        "min-w-0 max-w-full",
                        m.role === "user" && "bg-primary text-primary-foreground",
                      )}
                    >
                      {m.parts.map((p, i) =>
                        p.type === "text" ? (
                          <MessageResponse key={i}>{p.text}</MessageResponse>
                        ) : (
                          <Button
                            key={i}
                            variant="outline"
                            className="h-auto w-full justify-start whitespace-normal bg-surface p-3 text-left"
                            onClick={() => {
                              setReport(p.report);
                              if (window.innerWidth < 1024)
                                setTimeout(
                                  () =>
                                    reportPanel.current?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "start",
                                    }),
                                  0,
                                );
                            }}
                          >
                            <BarChart3 className="text-primary" />
                            <span className="flex-1 text-foreground">
                              {p.report.title}
                              <span className="block text-xs text-muted-foreground">
                                {p.report.available
                                  ? `${p.report.count} records`
                                  : "Data not available"}
                              </span>
                            </span>
                            <ArrowUpRight className="text-muted-foreground" />
                          </Button>
                        ),
                      )}
                    </MessageContent>
                  </Message>
                ))}
                {busy && <Shimmer>Reading current records…</Shimmer>}
                {error && (
                  <Tool defaultOpen={false}>
                    <ToolHeader
                      type="tool-create_report"
                      state="output-error"
                      title="Answer not completed"
                    />
                    <ToolContent>
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    </ToolContent>
                  </Tool>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          )}
          <div className={cn("space-y-2", messages.length && "mt-auto p-4 sm:p-5")}>
            {report && !busy && (
              <div className="flex flex-wrap gap-1">
                {[
                  ...(report.query.topic === "budgets"
                    ? ["By category instead"]
                    : ["Break it down by supplier", "By requestor instead"]),
                  "Show current budget consumption",
                  "Show submitted request value for the last 12 months",
                ].map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant="ghost"
                    className="h-auto whitespace-normal text-left text-xs"
                    onClick={() => ask(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            )}
            <PromptInput
              onSubmit={({ text }) => ask(text)}
              className="[&>[data-slot=input-group]]:rounded-lg [&>[data-slot=input-group]]:bg-surface"
            >
              <PromptInputTextarea
                ref={input}
                aria-label="Ask a financial question"
                placeholder={
                  messages.length ? "Ask a follow-up…" : "Ask about your spend or budget…"
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={4000}
                className="min-h-16 px-4 pt-4 text-sm"
              />
              <PromptInputFooter className="justify-end px-3 pb-3">
                <PromptInputSubmit
                  status={status}
                  onStop={() => abort.current?.abort()}
                  disabled={!loaded || (!busy && !question.trim())}
                  aria-label={busy ? "Stop" : "Send question"}
                >
                  {!busy && <ArrowUp className="size-4" />}
                </PromptInputSubmit>
              </PromptInputFooter>
            </PromptInput>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          {!messages.length && (
            <div className="mt-4 flex flex-wrap justify-center gap-x-2 gap-y-1">
              {[
                {
                  icon: FileText,
                  label: "Spend over 12 months",
                  text: "Show invoiced spend for the last 12 months",
                },
                {
                  icon: CircleDollarSign,
                  label: "Open purchase orders",
                  text: "How much have we committed in purchase orders this year?",
                },
                {
                  icon: Boxes,
                  label: "Purchased items",
                  text: "Which items did we purchase this year?",
                },
                {
                  icon: BarChart3,
                  label: "Budget by department",
                  text: "Show current budget consumption by department",
                },
              ].map((s) => (
                <Button
                  key={s.label}
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-9 whitespace-normal text-xs text-muted-foreground"
                  disabled={!loaded || busy}
                  onClick={() => {
                    setQuestion(s.text);
                    input.current?.focus();
                  }}
                >
                  <s.icon className="size-3.5" />
                  {s.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        {report && (
          <div
            ref={reportPanel}
            className="min-w-0 scroll-mt-4 border-t border-border bg-surface p-5 sm:p-7 lg:border-t-0"
          >
            <InsightReport report={report} loading={refreshing} onRefresh={updateReport} />
          </div>
        )}
      </div>
    </div>
  );
}
