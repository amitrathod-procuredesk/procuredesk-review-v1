import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  BarChart3,
  Boxes,
  CircleDollarSign,
  FileText,
  SquarePen,
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
import { InsightReport, periodLabel, recordNoun } from "@/components/pd/InsightReport";
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

function followUps(r: Report): { label: string; ask?: string }[] {
  const q = r.query;
  const out: { label: string; ask?: string }[] = [];
  const noun = recordNoun(q.topic);
  if (q.topic === "budgets") {
    if (q.group !== "department") out.push({ label: "By department", ask: "Break it down by department instead." });
    if (q.group !== "category") out.push({ label: "By category", ask: "Break it down by category instead." });
    out.push({ label: "Invoiced spend instead", ask: "Show invoiced spend for this year instead." });
  } else {
    if (q.group === "month") {
      out.push({ label: "By supplier", ask: "Break it down by supplier instead." });
      out.push({ label: "By department", ask: "Break it down by department instead." });
    } else {
      out.push({ label: "Month by month", ask: "Break it down by month instead." });
      const top = r.groups[0]?.label;
      if (top && q.group === "supplier")
        out.push({ label: `${top} month by month`, ask: `Show ${top} month by month.` });
      else if (q.group !== "supplier") out.push({ label: "By supplier", ask: "Break it down by supplier instead." });
    }
    const y = q.start?.slice(0, 4);
    if (y && q.start === `${y}-01-01`) {
      const prev = Number(y) - 1;
      out.push({ label: `${prev} instead`, ask: `Show the same for ${prev} instead (Jan 1 – Dec 31, ${prev}).` });
    } else out.push({ label: "Last year only", ask: "Limit this to last year." });
    if (q.topic === "invoices") out.push({ label: "Committed instead", ask: "Show committed purchase orders for the same period instead." });
    else if (q.topic === "orders") out.push({ label: "Invoiced instead", ask: "Show invoiced spend for the same period instead." });
    if (r.count) out.push({ label: `See the ${noun}` });
  }
  return out;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

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
    // A new conversation is only created when the user actually submits a
    // question; this just returns to the empty starting screen.
    setQuestion("");
    setError("");
    if (threadId) await router.navigate({ to: "/app/insights/ask" });
    else input.current?.focus();
  };
  const [messages, setMessages] = useState<InsightMessage[]>([]);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">("ready");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [report, setReport] = useState<Report>();
  const [refreshing, setRefreshing] = useState(false);
  const [drill, setDrill] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const reportPanel = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = status === "submitted" || status === "streaming";
  const showingConversation = messages.length > 0;
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
        if (
          !(e instanceof Error) ||
          !/Sign in|session expired|switch Insights accounts/i.test(e.message)
        )
          throw e;
        if (!currentEmail || !currentPassword) throw e;
        // Revalidate the existing prototype account credential on the server;
        // never authorize history from the browser's user ID alone.
        await restoreSession({ data: { email: currentEmail, password: currentPassword } });
        return load({ data: { userId: currentUserId, threadId } });
      })
      .then((v) => {
        if (active) {
          setThreads(v.threads);
          setMessages(threadId ? v.messages : []);
          setVersion(threadId ? v.version : 0);
          setLoaded(true);
          // An empty thread with nothing waiting to be asked has no report to
          // show: return to the starting screen instead of an empty report view.
          if (
            threadId &&
            !v.messages.length &&
            !sessionStorage.getItem(`pd-insights-pending-${threadId}`)
          ) {
            void router.navigate({ to: "/app/insights/ask", replace: true });
            return;
          }
          const last = v.messages
            .flatMap((m) => m.parts)
            .filter((p) => p.type === "report")
            .at(-1);
          if (threadId && last?.type === "report") setReport(last.report);
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
  const ask = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      if (!threadId) {
        try {
          const t = await createThread();
          sessionStorage.setItem(`pd-insights-pending-${t.id}`, text);
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
              setDrill(null);
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
    },
    [busy, threadId, createThread, router, messages, version],
  );
  useEffect(() => {
    if (threadId && loaded) {
      const pending = sessionStorage.getItem(`pd-insights-pending-${threadId}`);
      if (pending) {
        sessionStorage.removeItem(`pd-insights-pending-${threadId}`);
        void ask(pending);
      }
    }
  }, [threadId, loaded, ask]);
  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100dvh-124px)] flex-col md:min-h-[calc(100dvh-60px)]",
        showingConversation && "md:h-[calc(100dvh-60px)] md:min-h-0 md:overflow-hidden",
      )}
    >
      <div
        className={cn(
          "grid min-h-0 min-w-0 flex-1",
          showingConversation && "md:grid-cols-[minmax(280px,29%)_minmax(0,1fr)]",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col",
            !messages.length && "justify-center px-5 pb-[12vh] pt-16 sm:px-7",
            showingConversation
              ? "border-border bg-surface md:border-r"
              : "mx-auto w-full max-w-2xl",
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-3",
              showingConversation
                ? "border-b border-border bg-surface px-5 py-3 sm:px-7"
                : "absolute right-3 top-3 sm:right-5",
            )}
          >
            <h1
              className={cn("text-sm font-semibold text-foreground", !showingConversation && "sr-only")}
            >
              Ask Insights
            </h1>
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
                      <SquarePen className="size-4" />
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
                        <p className="py-3 text-sm text-muted-foreground">
                          No past conversations yet.
                        </p>
                      )}
                    </nav>
                  </PopoverContent>
                </Popover>
              </div>
            </TooltipProvider>
          </div>
          {!messages.length && (
            <div className="mb-7 text-center">
              <AgentNavIcon className="mx-auto mb-5 size-7 text-primary" />
              <h2 className="text-balance text-[26px] font-semibold tracking-tight text-foreground sm:text-3xl">
                {greeting()}
                {me?.name ? `, ${me.name.split(" ")[0]}` : ""}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask anything about spend, purchase orders, invoices or budgets.
              </p>
            </div>
          )}
          {!!messages.length && (
            <Conversation className={cn("min-h-0 flex-1 max-h-[50dvh] md:max-h-none")}>
              <ConversationContent className="gap-5 p-4 sm:p-5">
                {messages.map((m) => (
                  <Message key={m.id} from={m.role}>
                    <MessageContent
                      className={cn(
                        "min-w-0 max-w-full",
                        m.role === "user" && "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {m.parts.map((p, i) =>
                        p.type === "text" ? (
                          <MessageResponse key={i}>{p.text}</MessageResponse>
                        ) : (
                          <div key={i} className="space-y-2">
                            <Tool defaultOpen={false} className="mb-0 border-0">
                              <ToolHeader
                                className="px-0 py-2 [&>div>svg]:hidden [&>div>span:last-child]:hidden [&>div>span]:text-xs [&>div>span]:text-muted-foreground"
                                type="tool-create_report"
                                state="output-available"
                                title={`Read ${p.report.count} ${recordNoun(p.report.query.topic, p.report.count)}`}
                              />
                              <ToolContent>
                                <p className="text-xs text-muted-foreground">
                                  {p.report.demo
                                    ? "Sample financial records"
                                    : "Current workspace records"}
                                </p>
                              </ToolContent>
                            </Tool>
                            <Button
                              key={i}
                              variant={
                                report?.generatedAt === p.report.generatedAt
                                  ? "secondary"
                                  : "outline"
                              }
                              className="h-auto w-full justify-start whitespace-normal border border-primary/20 bg-primary/5 p-3 text-left"
                              onClick={() => {
                                setReport(p.report);
                                setDrill(null);
                                if (window.innerWidth < 768)
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
                                {p.report.query.topic !== "budgets" &&
                                  ` · ${periodLabel(p.report.query).split(" · ")[0]}`}
                                <span className="block text-xs text-primary">
                                  {!p.report.available
                                    ? "Data not available"
                                    : report?.generatedAt === p.report.generatedAt
                                      ? "Showing"
                                      : "Open in panel"}
                                </span>
                              </span>
                              <ArrowUpRight className="text-muted-foreground" />
                            </Button>
                          </div>
                        ),
                      )}
                    </MessageContent>
                  </Message>
                ))}
                {busy && (
                  <Tool defaultOpen={false}>
                    <ToolHeader
                      type="tool-create_report"
                      state="input-available"
                      title={report ? "Writing your summary" : "Reading records"}
                    />
                    <ToolContent>
                      <Shimmer>
                        {report ? "Preparing the explanation…" : "Reading current records…"}
                      </Shimmer>
                    </ToolContent>
                  </Tool>
                )}
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
          <div className={cn("space-y-2", messages.length && "shrink-0 p-4 pt-2")}>
            {report && !busy && (
              <div className="flex flex-wrap gap-2 pb-1">
                {followUps(report).map((t) => (
                  <Button
                    key={t.label}
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-8 whitespace-normal rounded-full bg-surface px-3 text-left text-xs font-normal"
                    onClick={() => (t.ask ? void ask(t.ask) : setDrill(""))}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            )}
            <PromptInput
              onSubmit={({ text }) => ask(text)}
              className={cn(
                "[&>[data-slot=input-group]]:bg-surface",
                showingConversation
                  ? "relative [&>[data-slot=input-group]]:rounded-lg"
                  : "[&>[data-slot=input-group]]:rounded-2xl [&>[data-slot=input-group]]:shadow-[var(--shadow-composer)]",
              )}
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
                className={cn(
                  "text-sm",
                  showingConversation
                    ? "max-h-32 min-h-14 px-4 py-4 pr-16"
                    : "max-h-48 min-h-16 px-5 pt-4 pb-1 text-[15px]",
                )}
              />
              <PromptInputFooter
                className={cn(
                  showingConversation
                    ? "absolute bottom-0 right-0 w-auto justify-end p-3"
                    : "justify-between px-3 pb-3 pt-1",
                )}
              >
                {!showingConversation && (
                  <span className="pl-2 text-xs text-muted-foreground">
                    Answers use your live ProcureDesk records
                  </span>
                )}
                <PromptInputSubmit
                  status={status}
                  onStop={() => abort.current?.abort()}
                  disabled={!loaded || (!busy && !question.trim())}
                  aria-label={busy ? "Stop" : "Send question"}
                >
                  {busy ? undefined : <ArrowUp className="size-4" />}
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
            <div className="mt-5 flex flex-wrap justify-center gap-2">
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
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full bg-surface px-3.5 text-xs font-normal text-muted-foreground shadow-none hover:text-foreground"
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
        {showingConversation && (
          <div
            ref={reportPanel}
            className="min-h-0 min-w-0 scroll-mt-4 overflow-y-auto border-t border-border bg-subtle p-4 sm:p-6 md:border-t-0 md:p-7"
          >
            {report ? (
              <InsightReport
                report={report}
                loading={refreshing}
                onRefresh={updateReport}
                drill={drill}
                onDrill={setDrill}
              />
            ) : (
              <div className="flex min-h-64 h-full items-center justify-center text-center">
                <div className="space-y-3">
                  <BarChart3 className="mx-auto size-8 text-primary" />
                  <Shimmer>
                    {busy ? "Preparing your report…" : "Your report will appear here"}
                  </Shimmer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
