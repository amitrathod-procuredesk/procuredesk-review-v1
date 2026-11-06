import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  CircleDollarSign,
  FileText,
  LockKeyhole,
  Plus,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { TextInput } from "@/components/pd/form";
import {
  loadInsights,
  signInInsights,
  refreshInsight,
  createInsightsConversation,
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
  const signIn = useServerFn(signInInsights);
  const refresh = useServerFn(refreshInsight);
  const createThread = useServerFn(createInsightsConversation);
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
  const [auth, setAuth] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [report, setReport] = useState<Report>();
  const [refreshing, setRefreshing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const reportPanel = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = status === "submitted" || status === "streaming";
  const currentUserId = me?.id;
  useEffect(() => {
    let active = true;
    if (!currentUserId) return;
    setMessages([]);
    setReport(undefined);
    setLoaded(false);
    load({ data: { userId: currentUserId, threadId } })
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
          setAuth(false);
          const last = v.messages
            .flatMap((m) => m.parts)
            .filter((p) => p.type === "report")
            .at(-1);
          if (last?.type === "report") setReport(last.report);
        }
      })
      .catch(() => {
        if (active) {
          setAuth(true);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, [load, currentUserId, threadId, router]);
  useEffect(() => {
    if (loaded && !auth && !busy) input.current?.focus();
  }, [loaded, auth, busy, threadId]);
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
    if (threadId && loaded && !auth) {
      const pending = sessionStorage.getItem("pd-insights-pending");
      if (pending) {
        sessionStorage.removeItem("pd-insights-pending");
        setQuestion(pending);
        input.current?.focus();
      }
    }
  }, [threadId, loaded, auth]);
  if (auth)
    return (
      <div className="mx-auto max-w-md space-y-5 px-6 py-12">
        <AgentNavIcon className="size-10 text-primary" />
        <h1 className="pd-h1">Ask Insights</h1>
        <p className="text-sm text-muted-foreground">
          Confirm your ProcureDesk password to access your saved financial conversation.
        </p>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await signIn({ data: { email: me?.email ?? "", password } });
              setPassword("");
              setAuth(false);
              const v = await load({ data: { userId: me?.id ?? "", threadId } });
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
              const p = v.messages
                .flatMap((m) => m.parts)
                .filter((p) => p.type === "report")
                .at(-1);
              if (p?.type === "report") setReport(p.report);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not sign in.");
            }
          }}
        >
          <label className="pd-label" htmlFor="insights-password">
            Password
          </label>
          <TextInput
            id="insights-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit">
            <LockKeyhole />
            Continue
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <div className="flex min-h-[calc(100dvh-116px)] flex-col md:min-h-[calc(100dvh-60px)]">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-5 py-4">
        <div className="flex items-center gap-3">
          <AgentNavIcon className="size-7 text-primary" />
          <div>
            <h1 className="pd-h1">Ask Insights</h1>
            <p className="text-xs text-muted-foreground">
              Workspace budgets · Sample invoice and purchase data
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/app/reports" })}>
          All reports
          <ArrowUpRight />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-2">
        <Button variant="outline" size="sm" disabled={busy || !loaded} onClick={newConversation}>
          <Plus />
          New conversation
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setHistoryOpen((v) => !v)}>
          <History />
          History ({threads.length})
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {threads.find((t) => t.id === threadId)?.title ?? "New conversation"}
        </span>
      </div>
      {historyOpen && (
        <nav
          aria-label="Conversation history"
          className="max-h-56 overflow-y-auto border-b border-border bg-surface px-5 py-2"
        >
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
      )}
      <div
        className={cn(
          "grid min-w-0 flex-1",
          report && "lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col",
            report ? "border-border lg:border-r" : "mx-auto w-full max-w-3xl",
          )}
        >
          <Conversation
            className={cn(
              "min-h-72",
              report ? "max-h-[45dvh] lg:max-h-[calc(100dvh-320px)]" : "max-h-[calc(100dvh-280px)]",
            )}
          >
            <ConversationContent className="gap-6 p-5 sm:p-7">
              {!messages.length && (
                <div className="py-7 sm:py-12">
                  <div className="mb-5 inline-flex size-14 items-center justify-center rounded-lg border border-primary/20 bg-accent">
                    <AgentNavIcon className="size-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-semibold">What would you like to understand?</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Spend, purchases and budgets — one question at a time.
                  </p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        icon: FileText,
                        label: "Invoiced spend",
                        text: "Show invoiced spend for the last 12 months",
                      },
                      {
                        icon: CircleDollarSign,
                        label: "Purchase commitments",
                        text: "How much have we committed in purchase orders this year?",
                      },
                      {
                        icon: Boxes,
                        label: "Purchased items",
                        text: "Which items did we purchase this year?",
                      },
                      {
                        icon: BarChart3,
                        label: "Budget consumption",
                        text: "Show current budget consumption by department",
                      },
                    ].map((s) => (
                      <Button
                        key={s.label}
                        variant="outline"
                        className="h-auto justify-start whitespace-normal bg-surface p-4 text-left"
                        disabled={!loaded || busy}
                        onClick={() => ask(s.text)}
                      >
                        <s.icon className="text-primary" />
                        <span className="flex-1">{s.label}</span>
                        <ArrowUpRight className="text-muted-foreground" />
                      </Button>
                    ))}
                  </div>
                </div>
              )}
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
                          onClick={() => { setReport(p.report); if (window.innerWidth < 1024) setTimeout(()=>reportPanel.current?.scrollIntoView({behavior:"smooth",block:"start"}),0); }}
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
          <div className="mt-auto space-y-2 border-t border-border bg-surface p-4 sm:p-5">
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
            <PromptInput onSubmit={({ text }) => ask(text)} className="bg-surface">
              <PromptInputTextarea
                ref={input}
                aria-label="Ask a financial question"
                placeholder={
                  messages.length ? "Ask a follow-up…" : "Ask about your spend or budget…"
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={4000}
              />
              <PromptInputFooter>
                <span className="text-[11px] text-muted-foreground">
                  Read-only · Saved to your account
                </span>
                <PromptInputSubmit
                  status={status}
                  onStop={() => abort.current?.abort()}
                  disabled={!loaded || (!busy && !question.trim())}
                />
              </PromptInputFooter>
            </PromptInput>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>
        {report && (
          <div ref={reportPanel} className="min-w-0 scroll-mt-4 border-t border-border bg-surface p-5 sm:p-7 lg:border-t-0">
            <InsightReport report={report} loading={refreshing} onRefresh={updateReport} />
          </div>
        )}
      </div>
    </div>
  );
}
