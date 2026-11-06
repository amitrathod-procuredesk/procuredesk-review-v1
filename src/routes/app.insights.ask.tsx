import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  CircleDollarSign,
  FileText,
  LockKeyhole,
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
import { loadInsights, signInInsights, refreshInsight } from "@/lib/pd/insights.functions";
import {
  type InsightMessage,
  type InsightReport as Report,
  type InsightQuery,
} from "@/lib/pd/insights";
import { useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/insights/ask")({
  head: () => ({
    meta: [
      { title: "Ask Insights · ProcureDesk" },
      {
        name: "description",
        content:
          "Ask financial questions and inspect visual reports grounded in current ProcureDesk records.",
      },
      { property: "og:title", content: "Ask Insights · ProcureDesk" },
      {
        property: "og:description",
        content: "Conversational spend, purchase and budget insights with traceable records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AskInsights,
});

function AskInsights() {
  const me = useMe();
  const router = useRouter();
  const load = useServerFn(loadInsights);
  const signIn = useServerFn(signInInsights);
  const refresh = useServerFn(refreshInsight);
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
  const abort = useRef<AbortController | null>(null);
  const busy = status === "submitted" || status === "streaming";
  const currentUserId = me?.id;
  useEffect(() => {
    let active = true;
    if (!currentUserId) return;
    setMessages([]);
    setReport(undefined);
    setLoaded(false);
    load({ data: { userId: currentUserId } })
      .then((v) => {
        if (active) {
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
  }, [load, currentUserId]);
  useEffect(() => {
    if (loaded && !auth && !busy) input.current?.focus();
  }, [loaded, auth, busy]);
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
        body: JSON.stringify({ text, version }),
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
              const v = await load({ data: { userId: me?.id ?? "" } });
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
              Financial answers, grounded in your records
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/app/reports" })}>
          All reports
          <ArrowUpRight />
        </Button>
      </div>
      <div
        className={cn(
          "grid min-w-0 flex-1",
          report && "xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col",
            report ? "border-border xl:border-r" : "mx-auto w-full max-w-3xl",
          )}
        >
          <Conversation
            className={cn(
              "min-h-72",
              report ? "max-h-[65dvh] xl:max-h-[calc(100dvh-260px)]" : "max-h-[calc(100dvh-280px)]",
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
                          onClick={() => setReport(p.report)}
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
          <div className="min-w-0 border-t border-border bg-surface p-5 sm:p-7 xl:border-t-0">
            <InsightReport report={report} loading={refreshing} onRefresh={updateReport} />
          </div>
        )}
      </div>
    </div>
  );
}
