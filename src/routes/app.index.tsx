import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AiGlyph, Empty, Money, Section, StatusBadge } from "@/components/pd/bits";
import { ApprovalInbox } from "@/components/pd/ApprovalInbox";
import { budgetAvailable, budgetStatus, money, runChecks, smartTime, totals } from "@/lib/pd/engine";
import { createDraft, useDB, useMe } from "@/lib/pd/store";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Home · ProcureDesk" },
      { name: "description", content: "Tell ProcureDesk what you need to buy, track requests, and review approvals." },
      { property: "og:title", content: "Home · ProcureDesk" },
      { property: "og:description", content: "AI-first procurement home." },
    ],
  }),
  component: Home,
});

function Home() {
  const me = useMe()!;
  if (me.role === "admin") return <AdminDashboard />;
  if (me.role === "approver") return <div className="mx-auto max-w-5xl p-4 md:p-8"><h1 className="pd-h1 mb-4">Waiting for your approval</h1><ApprovalInbox /></div>;
  return <RequestorHome />;
}

function RequestorHome() {
  const me = useMe()!;
  const db = useDB();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const mine = db.requests.filter((r) => r.requesterId === me.id);
  const needsAction = mine.filter((r) => r.status === "changes" || r.status === "draft");
  const go = (manual: boolean) => {
    const id = createDraft(me.id, manual);
    nav({ to: "/app/requests/$id/edit", params: { id }, search: { prompt: manual ? undefined : text.trim() || undefined } });
  };
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 md:py-16">
      <div>
        <p className="text-sm text-muted-foreground">Good to see you, {me.name.split(" ")[0]}.</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">What do you need to purchase?</h1>
        <form className="mt-5 pd-panel p-2 focus-within:border-ring" onSubmit={(e) => { e.preventDefault(); go(false); }}>
          <label htmlFor="need" className="sr-only">Tell me what you need to buy</label>
          <textarea id="need" rows={2} className="w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground" placeholder="Try: 4 laptops for new hires starting next month" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(false); } }} />
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><AiGlyph className="size-4" /> Checks catalog, budget and policy as it builds</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => go(true)}>Create manually</Button>
              <Button type="submit" size="sm" disabled={!text.trim()}>Create with AI</Button>
            </div>
          </div>
        </form>
      </div>

      {needsAction.length > 0 && (
        <div>
          <h2 className="pd-section-title mb-2">Needs your attention</h2>
          <ul className="pd-panel divide-y divide-border">
            {needsAction.map((r) => (
              <li key={r.id}>
                <Link to="/app/requests/$id/edit" params={{ id: r.id }} search={{ prompt: undefined }} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-medium" title={r.title}>{r.title || "Untitled request"}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.status === "changes" ? `“${r.decisionReason}”` : `Draft · saved ${smartTime(r.updatedAt)}`}</p>
                  </div>
                  <StatusBadge r={r} />
                  <span className="w-24 text-right"><Money v={totals(r).total} className="text-sm" /><span className="block text-[11px] font-normal text-muted-foreground">{r.items.filter((i) => !i.declined).length} item{r.items.filter((i) => !i.declined).length === 1 ? "" : "s"}</span></span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between"><h2 className="pd-section-title">Recent requests</h2><Link to="/app/requests" className="text-xs text-primary hover:underline">View all</Link></div>
        {mine.length === 0 ? <Empty title="No requests yet" body="Describe what you need above and the copilot will build your first request." /> : (
          <ul className="pd-panel divide-y divide-border">
            {mine.filter((r) => !needsAction.includes(r)).slice(0, 6).map((r) => {
              const stage = r.route.find((s) => s.approvals.some((a) => a.status === "pending"));
              return (
                <li key={r.id}>
                  <Link to="/app/requests/$id" params={{ id: r.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-sm" title={r.title}>{r.title}</p>
                      <p className="text-xs text-muted-foreground"><span className="num">{r.id}</span>{stage ? ` · With ${stage.name}` : ""}</p>
                    </div>
                    <StatusBadge r={r} />
                    <span className="w-24 text-right"><Money v={totals(r).total} className="text-sm" /><span className="block text-[11px] font-normal text-muted-foreground">{r.items.filter((i) => !i.declined).length} item{r.items.filter((i) => !i.declined).length === 1 ? "" : "s"}</span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const db = useDB();
  const pending = db.requests.filter((r) => r.status === "pending");
  const open = db.requests.filter((r) => ["draft", "pending", "changes"].includes(r.status));
  const spend = db.requests.filter((r) => ["approved", "ordered", "part_ordered", "partial", "received"].includes(r.status)).reduce((s, r) => s + totals(r).total, 0);
  const blocked = open.filter((r) => budgetStatus(r, db)?.over);
  const exceptions = db.requests.filter((r) => r.exceptionRequested || runChecks(r, db).some((c) => c.level !== "ok" && c.id !== "dup") && r.status === "pending");
  const activity = db.requests.flatMap((r) => r.activity.map((a) => ({ ...a, rid: r.id }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex items-end justify-between"><div><h1 className="pd-h1">Operations</h1><p className="text-sm text-muted-foreground">{db.org.name} · {db.org.fiscalYear}</p></div><Link to="/app/admin" className="pd-chip">Configure organization</Link></div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
        {[["Pending approvals", pending.length.toString()], ["Open requests", open.length.toString()], ["Committed spend", money(spend)], ["Policy exceptions", exceptions.length.toString()]].map(([k, v]) => (
          <div key={k} className="bg-surface p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="num mt-1 text-xl">{v}</p></div>
        ))}
      </div>
      {blocked.length > 0 && (
        <div className="ai-surface flex flex-wrap items-center gap-3 rounded-r-md px-4 py-3 text-sm">
          <AiGlyph />
          <span className="flex-1">{blocked.length} purchase request{blocked.length > 1 ? "s are" : " is"} currently blocked by insufficient budget ({blocked.map((r) => r.id).join(", ")}).</span>
          <Link to="/app/requests" search={{ q: "over budget" }} className="pd-chip">Review</Link>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Budget utilization">
          <ul className="space-y-3">
            {db.budgets.map((b) => {
              const avail = budgetAvailable(b.id, db);
              const pct = Math.min(100, ((b.total - avail) / b.total) * 100);
              return (
                <li key={b.id}>
                  <div className="flex justify-between text-sm"><span>{b.name}</span><span className="num text-xs text-muted-foreground">{money(avail)} left of {money(b.total)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-subtle"><div className={pct > 90 ? "h-1.5 rounded-full bg-destructive" : "h-1.5 rounded-full bg-primary/70"} style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </Section>
        <Section title="Pending approvals">
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">Nothing in approval.</p> : (
            <ul className="divide-y divide-border">
              {pending.map((r) => {
                const s = r.route.find((x) => x.approvals.some((a) => a.status === "pending"));
                return (
                  <li key={r.id}><Link to="/app/requests/$id" params={{ id: r.id }} className="flex items-center gap-3 py-2 text-sm hover:text-primary"><span className="min-w-0 flex-1 truncate">{r.title}</span><span className="text-xs text-muted-foreground">{s?.name}</span><Money v={totals(r).total} /></Link></li>
                );
              })}
            </ul>
          )}
        </Section>
        <Section title="Recent activity" className="lg:col-span-2">
          <ul className="space-y-2">
            {activity.map((a) => (
              <li key={a.rid + a.id} className="flex gap-3 text-sm"><span className="num w-24 shrink-0 text-xs text-muted-foreground">{smartTime(a.at)}</span><Link to="/app/requests/$id" params={{ id: a.rid }} className="num w-28 shrink-0 text-xs text-primary">{a.rid}</Link><span className="min-w-0 truncate">{a.text}</span></li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
