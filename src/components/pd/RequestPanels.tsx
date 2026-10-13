import { useNavigate } from "@tanstack/react-router";
import { Bell, BellRing, Check, ChevronDown, Clock, GitFork, FileUp, Paperclip, Users, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { budgetLevelOf, budgetStatus, budgetStatuses, budgetedLines, lineBudgetId, computeRoute, currentStageIndex, findDuplicates, money, runChecks, smartTime, stageComplete, supplierBreakdown, totals, uid, type Check as CheckT } from "@/lib/pd/engine";
import { log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import type { Attachment, PRequest, Stage } from "@/lib/pd/types";
import { CheckIcon, Money, Section, SourceMark, StatusBadge, UserAvatar } from "./bits";
import { cn } from "@/lib/utils";

const SHADES = ["bg-primary", "bg-primary/60", "bg-primary/30", "bg-primary/15", "bg-muted-foreground/30"];

/** Requester's first question: "how much?" — one big number, its make-up as quiet subtext, suppliers only when there's more than one. */
export function TotalsBlock({ r }: { r: PRequest }) {
  const t = totals(r);
  return (
    <div>
      <p className="text-xs text-muted-foreground">Request total</p>
      <Money v={t.total} className="block text-[28px] font-semibold leading-tight tracking-tight" />
      <p className="mt-1 text-xs text-muted-foreground">
        {t.shipping || t.tax
          ? <>Subtotal <Money v={t.subtotal} className="num text-foreground/80" />{t.shipping > 0 && <> + shipping <Money v={t.shipping} className="num text-foreground/80" /></>}{t.tax > 0 && <> + tax <Money v={t.tax} className="num text-foreground/80" /></>}</>
          : "No shipping or tax added"}
      </p>
    </div>
  );
}

export function SupplierBlock({ r }: { r: PRequest }) {
  const db = useDB();
  const rows = supplierBreakdown(r, db);
  if (!rows.length) return <p className="text-xs text-muted-foreground">No suppliers yet.</p>;
  const total = totals(r).total || 1;
  return (
    <div className="space-y-2">
      {rows.length > 1 && <p className="text-xs text-muted-foreground">{rows.length} suppliers — each line is sourced from its catalog or quoted supplier, so this request will produce {rows.length} purchase orders.</p>}
      {rows.map((s) => {
        const v = db.vendors.find((x) => x.id === s.vendorId);
        return (
          <div key={s.vendorId}>
            <div className="flex items-center justify-between text-sm">
              <span className="truncate">{s.name} <span className="text-xs text-muted-foreground">· {s.lines} line{s.lines > 1 ? "s" : ""}{v?.preferred ? " · preferred" : ""}</span></span>
              <Money v={s.amount} />
            </div>
            <div className="mt-1 h-1 rounded-full bg-subtle"><div className="h-1 rounded-full bg-primary/60" style={{ width: `${(s.amount / total) * 100}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export function BudgetBlock({ r, editable }: { r: PRequest; editable?: boolean }) {
  const db = useDB();
  const me = useMe();
  const lineMode = budgetLevelOf(r, db) === "line";
  const all = budgetStatuses(r, db);
  const b = lineMode ? all.find((x) => x.over) ?? null : budgetStatus(r, db);
  const unassigned = lineMode ? budgetedLines(r).filter((l) => !lineBudgetId(l, r, db)).length : 0;
  const [exc, setExc] = useState(false);
  const [reason, setReason] = useState("");
  const setBudget = (id: string) =>
    updateRequest(r.id, (x, d) => {
      x.budgetId = id || undefined;
      x.sources.budget = "confirmed";
      x.exceptionRequested = false;
      log(x, `Budget changed to ${d.budgets.find((bb) => bb.id === id)?.name ?? "none"}`, "edit", me?.id);
    });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{lineMode ? "Budgets" : "Budget"}</span>
        {lineMode ? (
          all.length ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", all.some((x) => x.over) ? "bg-danger-soft text-destructive" : "bg-success-soft text-success")}>{all.some((x) => x.over) ? "Over budget" : "Within budget"}</span> : null
        ) : b ? (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", b.over ? "bg-danger-soft text-destructive" : "bg-success-soft text-success")}>{b.over ? "Over budget" : "Within budget"}</span>
        ) : <SourceMark s={r.sources.budget} />}
      </div>
      {lineMode ? (
        <LineBudgets r={r} all={all} unassigned={unassigned} />
      ) : editable ? (
        <select id="budget-select-anchor" aria-label="Budget" aria-invalid={!r.budgetId || undefined} className="pd-input" value={r.budgetId ?? ""} onChange={(e) => setBudget(e.target.value)}>
          <option value="">Select a budget…</option>
          {db.budgets.map((bb) => <option key={bb.id} value={bb.id}>{bb.name}</option>)}
        </select>
      ) : (
        <p className="flex items-baseline justify-between gap-3 text-sm text-foreground/80"><span className="min-w-0 truncate">{b?.budget.name ?? "No budget selected"}</span>{b && <Money v={b.budget.total} className="num shrink-0 text-xs text-muted-foreground" />}</p>
      )}
      {b && (
        <>
          {!lineMode && (() => {
            const used = Math.max(0, b.budget.total - b.available);
            const pct = (v: number) => `${Math.max(0, Math.min(100, (v / b.budget.total) * 100))}%`;
            const segs = [
              { k: "Already used", v: used, c: "bg-muted-foreground/35" },
              { k: "This request", v: b.over ? Math.max(0, b.available) : b.request, c: b.over ? "bg-destructive" : "bg-primary" },
              { k: b.over ? "Over by" : "Left after", v: b.over ? -b.remaining : b.remaining, c: b.over ? "bg-destructive/30" : "bg-success" },
            ];
            const usedPct = Math.round(((used + b.request) / b.budget.total) * 100);
            return (
              <div>
                <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-success/20" role="img" aria-label={`${usedPct}% of budget used after this request`} title={segs.map((g) => `${g.k}: ${money(g.v)}`).join("\n")}>
                  <div className="h-full bg-muted-foreground/35 transition-all duration-500" style={{ width: pct(used) }} />
                  <div className={cn("h-full transition-all duration-500", b.over ? "bg-destructive" : "bg-primary")} style={{ width: pct(b.over ? Math.max(0, b.available) : b.request) }} />
                </div>
                <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/35" />Used <Money v={used} className="num text-foreground/80" /></li>
                  <li className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", b.over ? "bg-destructive" : "bg-primary")} />This request <Money v={b.request} className="num text-foreground/80" /></li>
                  <li className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", b.over ? "bg-destructive/30" : "bg-success/40")} />{b.over ? "Over by" : "Left"} <Money v={Math.abs(b.remaining)} className={cn("num font-medium", b.over ? "text-destructive" : "text-success")} /></li>
                </ul>
              </div>
            );
          })()}
          {b.over ? (
            <div className="rounded-md bg-danger-soft p-3 text-xs">
              {!lineMode && <p className="font-medium text-destructive">Over budget by {money(-b.remaining)}</p>}
              <p className={cn("text-foreground/80", !lineMode && "mt-1")}>{lineMode ? `${b.budget.name} is exceeded by the lines charged to it.` : "This request exceeds the selected budget."} {r.exceptionRequested ? "An exception has been requested — approvers will decide." : "You can choose another budget or request an exception."}</p>
              {editable && !r.exceptionRequested && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {lineMode
                    ? <button className="pd-chip" onClick={() => document.getElementById("line-items")?.scrollIntoView({ behavior: "smooth" })}>Change line budgets</button>
                    : <button className="pd-chip" onClick={() => document.getElementById("budget-select-anchor")?.focus()}>Choose another budget</button>}
                  <button className="pd-chip" onClick={() => setExc(true)}>Request exception</button>
                  {!lineMode && <button className="pd-chip" onClick={() => document.getElementById("line-items")?.scrollIntoView({ behavior: "smooth" })}>Edit request</button>}
                </div>
              )}
              {r.exceptionRequested && r.exceptionReason && <p className="mt-1 italic text-muted-foreground">“{r.exceptionReason}”</p>}
            </div>
          ) : null}
        </>
      )}
      <Dialog open={exc} onOpenChange={setExc}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request budget exception</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Explain why this purchase should proceed over budget. Approvers will see your justification.</p>
          <textarea className="pd-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Hiring plan approved in Q3; budget top-up pending in FY26 reforecast." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setExc(false)}>Cancel</Button>
            <Button disabled={!reason.trim()} onClick={() => { updateRequest(r.id, (x) => { x.exceptionRequested = true; x.exceptionReason = reason; log(x, "Budget exception requested", "edit", me?.id); }); setExc(false); toast.success("Exception will be reviewed by approvers"); }}>Request exception</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Line-level budget control: one compact row per budget the lines charge to. */
function LineBudgets({ r, all, unassigned }: { r: PRequest; all: ReturnType<typeof budgetStatuses>; unassigned: number }) {
  return (
    <div className="space-y-2.5">
      {all.length === 0 && !unassigned && <p className="text-xs text-muted-foreground">Each line item picks its budget. Add items to see budget use.</p>}
      {all.map((x) => {
        const used = Math.max(0, x.budget.total - x.available);
        const pct = (v: number) => `${Math.max(0, Math.min(100, (v / x.budget.total) * 100))}%`;
        return (
          <div key={x.budget.id} className="animate-in fade-in">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate">{x.budget.name} <span className="text-[11px] text-muted-foreground">· {x.lines} line{x.lines === 1 ? "" : "s"}</span></span>
              <Money v={x.request} className="shrink-0 font-medium" />
            </div>
            <div className="mt-1 flex h-1 gap-px overflow-hidden rounded-full bg-success/20" title={`Used ${money(used)} · This request ${money(x.request)} · ${x.over ? "Over by" : "Left"} ${money(Math.abs(x.remaining))}`}>
              <div className="h-full bg-muted-foreground/35 transition-all duration-500" style={{ width: pct(used) }} />
              <div className={cn("h-full transition-all duration-500", x.over ? "bg-destructive" : "bg-primary")} style={{ width: pct(x.over ? Math.max(0, x.available) : x.request) }} />
            </div>
            <p className={cn("mt-1 text-[11px]", x.over ? "font-medium text-destructive" : "text-muted-foreground")}>{x.over ? `Over by ${money(-x.remaining)}` : `${money(x.remaining)} left after this request`}</p>
          </div>
        );
      })}
      {unassigned > 0 && (
        <button onClick={() => document.getElementById("line-items")?.scrollIntoView({ behavior: "smooth" })} aria-invalid={r.status === "draft" || undefined} className="flex w-full items-center gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-left text-xs text-warning transition-colors hover:opacity-90">
          <span className="size-1.5 rounded-full bg-warning" />{unassigned} line{unassigned === 1 ? " needs" : "s need"} a budget
        </button>
      )}
    </div>
  );
}

export function ChecksBlock({ r, onAction }: { r: PRequest; onAction?: (c: CheckT) => void }) {
  const db = useDB();
  const checks = runChecks(r, db);
  return (
    <ul className="space-y-2.5">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2.5">
          <CheckIcon level={c.level} />
          <div className="min-w-0 text-sm">
            <p className={cn(c.level === "error" && "text-destructive")}>{c.title}</p>
            {c.detail && <p className="text-xs text-muted-foreground">{c.detail}</p>}
            {onAction && c.action && c.level !== "ok" && (
              <button className="mt-1 text-xs font-medium text-primary hover:underline" onClick={() => onAction(c)}>
                {{ budget: "Choose budget", exception: "Resolve budget", attach: "Attach quote", edit: "Fix now", duplicate: "Review similar requests" }[c.action]}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RouteTimeline({ r, preview }: { r: PRequest; preview?: boolean }) {
  const db = useDB();
  const me = useMe();
  const canRemind = !preview && r.status === "pending" && me?.id === r.requesterId;
  const COOLDOWN = 4 * 3600_000;
  const lastReminder = (uid2: string) => [...(r.reminders ?? [])].reverse().find((x) => x.userId === uid2);
  const remind = (uid2: string) => {
    const name = db.users.find((x) => x.id === uid2)?.name ?? "approver";
    updateRequest(r.id, (x) => { x.reminders = [...(x.reminders ?? []), { userId: uid2, at: new Date().toISOString(), by: me!.id }]; log(x, `Reminder sent to ${name}`, "system", me?.id); });
    toast.success(`Reminder sent to ${name.split(" ")[0]}`, { description: "They'll get a notification about this pending approval." });
  };
  const stages: Stage[] = preview ? computeRoute(r, db) : r.route;
  const cur = currentStageIndex(r);
  if (!stages.length) return <p className="text-xs text-muted-foreground">Route will be calculated from your organization's approval rules.</p>;
  return (
    <ol>
      {stages.map((s, i) => {
        const done = !preview && stageComplete(s);
        const active = !preview && i === cur;
        const isNext = !preview && cur >= 0 && i === cur + 1;
        const last = i === stages.length - 1;
        const multi = s.approvals.length > 1;
        const anyDone = s.mode === "any" && done;
        const approvedCount = s.approvals.filter((a) => a.status === "approved").length;
        const person = (a: (typeof s.approvals)[number], dense?: boolean) => {
          const u = db.users.find((x) => x.id === a.userId);
          const st = preview ? "waiting" : anyDone && a.status !== "approved" ? "skipped" : isNext && !multi && a.status === "waiting" ? "next" : a.status;
          return (
            <div key={a.userId} title={!multi ? s.name : undefined} className={cn("flex items-center gap-2.5 rounded-md transition-colors", dense ? "px-2 py-1.5 hover:bg-subtle/70" : "min-h-6", st === "skipped" && "opacity-55")}>
              <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-[10px] font-semibold text-foreground/70", st === "pending" && "ring-2 ring-pending/30")}>
                {u?.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                {st === "pending" && <span className="absolute -right-0.5 -top-0.5 size-2 animate-pulse rounded-full bg-pending ring-2 ring-surface" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-5">{u?.name}</p>
                <p className="truncate text-xs leading-4 text-muted-foreground">{u?.title}</p>
                {a.comment && <p className="mt-0.5 text-xs text-muted-foreground">“{a.comment}”</p>}
                {a.delegatedFrom && <p className="text-[11px] text-muted-foreground">Delegated by {db.users.find((x) => x.id === a.delegatedFrom)?.name}</p>}
              </div>
              {canRemind && st === "pending" && (() => {
                const lr = lastReminder(a.userId);
                const cooling = !!lr && Date.now() - new Date(lr.at).getTime() < COOLDOWN;
                return (
                  <button type="button" onClick={() => remind(a.userId)} disabled={cooling}
                    aria-label={cooling ? `Reminded ${smartTime(lr!.at)}` : `Send reminder to ${u?.name}`}
                    title={cooling ? `Reminded ${smartTime(lr!.at)} · you can remind again in a few hours` : `Remind ${u?.name?.split(" ")[0]}`}
                    className={cn("group/rem flex size-7 shrink-0 items-center justify-center rounded-full transition-colors", cooling ? "cursor-default text-success" : "text-muted-foreground hover:bg-pending-soft hover:text-pending focus-visible:bg-pending-soft focus-visible:text-pending")}>
                    {cooling ? <BellRing className="size-3.5" /> : <Bell className="size-3.5 transition-transform group-hover/rem:rotate-12" />}
                  </button>
                );
              })()}
              <ApprovalState status={st} at={a.at} />
            </div>
          );
        };
        const marker = (
          <span className={cn("absolute left-0 flex size-6 items-center justify-center rounded-full border text-[11px] font-medium transition-colors", multi ? "top-0" : "top-0.5", done ? "border-success bg-success text-primary-foreground" : active ? "border-pending bg-pending-soft text-pending" : "border-border bg-surface text-muted-foreground")}>
            {done ? <Check className="size-3" /> : i + 1}
          </span>
        );
        return (
          <li key={s.id} className="relative pb-4 pl-9 last:pb-0 animate-in fade-in" style={{ animationDelay: `${i * 40}ms` }}>
            {!last && <span className={cn("absolute bottom-0 left-[11px] top-7 w-px", done ? "bg-success/50" : "bg-border")} />}
            {marker}
            {!multi ? (
              person(s.approvals[0])
            ) : (
              <>
                <div className="flex min-h-6 min-w-0 items-center gap-1.5">
                  <p className="truncate whitespace-nowrap text-[13px] font-semibold text-foreground/85">{s.mode === "all" ? "Parallel approval" : "Group approval"}</p>
                  {(() => { const tip = s.mode === "all" ? "All approvers must approve" : "Any one approver can approve"; return (
                    <span tabIndex={0} role="img" aria-label={tip} title={tip} className="inline-flex shrink-0 cursor-help items-center rounded text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                      {s.mode === "all" ? <GitFork className="size-3.5" /> : <Users className="size-3.5" />}
                    </span>); })()}
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {isNext && <span className="whitespace-nowrap rounded-full bg-transit-soft px-1.5 py-px text-[10.5px] font-medium text-transit">Up next</span>}
                    {!preview && s.mode === "all" && <span className="num text-[11px] text-muted-foreground" title={`${approvedCount} of ${s.approvals.length} approved`}>{approvedCount}/{s.approvals.length}</span>}
                  </span>
                </div>
                <div className={cn("mt-2 space-y-0.5 rounded-lg border p-1 transition-colors", active ? "border-pending/40" : "border-border")}>{s.approvals.map((a) => person(a, true))}</div>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ApprovalState({ status, at }: { status: string; at?: string }) {
  const map: Record<string, [string, string]> = {
    approved: ["Approved", "bg-success/10 text-success"],
    rejected: ["Rejected", "bg-destructive/10 text-destructive"],
    changes: ["Changes", "bg-attention-soft text-attention"],
    pending: ["Awaiting", "bg-pending-soft text-pending"],
    waiting: ["Upcoming", "bg-subtle text-muted-foreground"],
    next: ["Up next", "bg-transit-soft text-transit"],
    skipped: ["Not needed", "bg-transparent text-muted-foreground"],
  };
  const [l, c] = map[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", c)} title={at ? new Date(at).toLocaleString() : undefined}>
      {status === "approved" ? <Check className="size-3" /> : status === "pending" ? <Clock className="size-3" /> : null}
      {l}
    </span>
  );
}

export function DuplicateList({ r }: { r: PRequest }) {
  const db = useDB();
  const nav = useNavigate();
  const d = findDuplicates(r, db);
  if (!d.length) return null;
  return (
    <div className="rounded-md border border-warning/40 bg-warning-soft p-3">
      <p className="text-sm font-medium">Possible duplicate</p>
      {d.map((o) => {
        const u = db.users.find((x) => x.id === o.requesterId);
        const first = o.items[0];
        return (
          <div key={o.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>A similar request for {first.qty} × {first.description} was submitted {smartTime(o.submittedAt ?? o.createdAt)}.<br /><span className="text-muted-foreground">{o.id} · {u?.name} · {money(totals(o).total)} · </span><StatusBadge status={o.status} /></span>
            <button className="pd-chip" onClick={() => nav({ to: "/app/requests/$id", params: { id: o.id } })}>View request</button>
          </div>
        );
      })}
      {!r.duplicateAcknowledged && r.status === "draft" && (
        <button className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => updateRequest(r.id, (x) => { x.duplicateAcknowledged = true; log(x, "Requester acknowledged possible duplicate and continued", "edit", x.requesterId); })}>
          Continue anyway
        </button>
      )}
    </div>
  );
}

export function Attachments({ r, editable }: { r: PRequest; editable?: boolean }) {
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const kindOf = (n: string): Attachment["kind"] => (/quote|quotation/i.test(n) ? "quote" : /spec/i.test(n) ? "spec" : "other");
  const [uploading, setUploading] = useState<string[]>([]);
  const add = (files: FileList | null) => {
    if (!files) return;
    [...files].forEach((f) => {
      setUploading((u) => [...u, f.name]);
      setTimeout(() => {
        updateRequest(r.id, (x) => {
          x.attachments.push({ id: uid("att"), name: f.name, size: f.size, kind: kindOf(f.name), uploadedAt: new Date().toISOString() });
          log(x, `Attachment added: ${f.name}`, "edit", me?.id);
        });
        setUploading((u) => u.filter((n) => n !== f.name));
      }, 700);
    });
  };
  const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <div className="space-y-1.5">
      {!editable && r.attachments.length === 0 && <p className="text-xs text-muted-foreground">No attachments.</p>}
      {r.attachments.map((a) => (
        <div key={a.id} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-subtle">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-subtle text-muted-foreground group-hover:bg-card"><Paperclip className="size-3.5" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{a.name}</p>
            <p className="text-[11px] text-muted-foreground">{kb(a.size)}</p>
          </div>
          {editable && (
            <button aria-label={`Remove ${a.name}`} className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100" onClick={() => updateRequest(r.id, (x) => { x.attachments = x.attachments.filter((y) => y.id !== a.id); log(x, `Attachment removed: ${a.name}`, "edit", me?.id); })}>
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      {uploading.map((n) => (
        <div key={n} className="flex items-center gap-2.5 px-2 py-1.5 text-[13px] text-muted-foreground">
          <span className="ai-thinking-dot size-1.5 rounded-full bg-primary" /> Uploading {n}…
        </div>
      ))}
      {editable && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
            className={cn("flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.03] hover:text-primary", drag && "border-primary bg-primary/[0.05] text-primary")}
          >
            <FileUp className="size-3.5" /> <span><span className="font-medium">Upload files</span> or drag here</span>
          </button>
          <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </>
      )}
    </div>
  );
}

export function Comments({ r }: { r: PRequest }) {
  const db = useDB();
  const me = useMe();
  const [text, setText] = useState("");
  const render = (t: string) =>
    t.split(/(@[A-Z][a-z]+(?: [A-Z][a-z]+)?)/g).map((p, i) => (p.startsWith("@") ? <span key={i} className="font-medium text-primary">{p}</span> : p));
  const mentionable = db.users.filter((u) => u.id !== me?.id);
  const mq = /@(\w*)$/.exec(text)?.[1] ?? null;
  const matches = mq === null ? [] : mentionable.filter((u) => u.name.toLowerCase().startsWith(mq.toLowerCase()) || u.name.toLowerCase().includes(" " + mq.toLowerCase())).slice(0, 5);
  return (
    <div className="space-y-3">
      {r.comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet. Mention a teammate to loop them in.</p>}
      {r.comments.map((c) => {
        const u = db.users.find((x) => x.id === c.userId);
        return (
          <div key={c.id} className="flex gap-2.5">
            <UserAvatar user={u} />
            <div className="min-w-0 flex-1">
              <p className="text-xs"><span className="font-medium">{u?.name}</span> <span className="text-muted-foreground">· {smartTime(c.at)}</span></p>
              <p className="text-sm">{render(c.text)}</p>
              <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setText(`@${u?.name} `)}>Reply</button>
            </div>
          </div>
        );
      })}
      <form
        className="rounded-[6px] border border-input bg-surface transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/12"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || !me) return;
          updateRequest(r.id, (x) => { x.comments.push({ id: uid("c"), userId: me.id, text, at: new Date().toISOString() }); });
          setText("");
        }}
      >
        <textarea rows={1} className="block max-h-32 min-h-9 w-full resize-none bg-transparent px-3 pt-2 text-sm outline-none placeholder:text-muted-foreground/70" placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
        {mq !== null && matches.length > 0 && (
          <ul className="mx-1.5 mb-1 rounded-md border border-border bg-popover p-1 shadow-sm">
            {matches.map((u) => (
              <li key={u.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); setText(text.replace(/@(\w*)$/, `@${u.name} `)); }} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-subtle"><UserAvatar user={u} /> {u.name}</button></li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
          <span className="pl-1.5 text-[11px] text-muted-foreground/70">Type @ to mention</span>
          <Button type="submit" size="sm" className="h-7 shrink-0 px-2.5 text-xs" disabled={!text.trim()}>Send</Button>
        </div>
      </form>
    </div>
  );
}

export function ActivityLog({ r }: { r: PRequest }) {
  const db = useDB();
  const sorted = [...r.activity].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ol className="space-y-2.5">
      {sorted.map((a) => (
        <li key={a.id} className="flex gap-3 text-sm">
          <span className="num w-28 shrink-0 text-[11px] leading-5 text-muted-foreground">{new Date(a.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", a.kind === "ai" ? "bg-ai" : a.kind === "approve" ? "bg-success" : a.kind === "reject" ? "bg-destructive" : a.kind === "changes" ? "bg-attention" : a.kind === "submit" ? "bg-pending" : "bg-muted-foreground/40")} />
          <span className="min-w-0">
            {a.text}
            {a.actorId && <span className="text-xs text-muted-foreground"> · {db.users.find((u) => u.id === a.actorId)?.name}</span>}
            {a.kind === "ai" && <span className="ai-mark ml-1">AI</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function MiniSuppliers({ r }: { r: PRequest }) {
  const db = useDB();
  const sup = supplierBreakdown(r, db);
  if (!sup.length) return null;
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {sup.map((s) => (
        <li key={s.vendorId} className="flex justify-between gap-2 text-muted-foreground">
          <span className="truncate">{s.name} · {s.lines}</span>
          <span className="num text-foreground">{money(s.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Approval route folded under the total: one line answers "who's next?", the full route expands on demand. */
function RouteSummary({ r, editable }: { r: PRequest; editable?: boolean }) {
  const db = useDB();
  const [open, setOpen] = useState(false);
  const route = editable ? computeRoute(r, db) : r.route;
  const count = route.reduce((t, s) => t + s.approvals.length, 0);
  if (!count) return null;
  const user = (id: string) => db.users.find((u) => u.id === id);
  const i = currentStageIndex(r);
  let label = "Next approver", ids: string[] = [], note = "", tone = "text-foreground";
  if (editable || r.status === "draft" || r.status === "changes") { label = "Goes first to"; ids = route[0]?.approvals.map((a) => a.userId) ?? []; note = route[0]?.name ?? ""; }
  else if (i >= 0) { label = "Waiting on"; ids = route[i].approvals.filter((a) => a.status === "pending").map((a) => a.userId); note = route[i].name; tone = "text-pending"; }
  else if (r.status === "rejected") { label = "Rejected by"; ids = route.flatMap((s) => s.approvals).filter((a) => a.status === "rejected").map((a) => a.userId); tone = "text-destructive"; }
  else { label = "Fully approved"; note = `${count} approver${count === 1 ? "" : "s"}`; tone = "text-success"; }
  const first = ids.length ? user(ids[0]) : undefined;
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-subtle">
        {first ? <UserAvatar user={first} /> : <span className={cn("grid size-6 shrink-0 place-items-center rounded-full bg-success-soft", tone)}><Check className="size-3.5" /></span>}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[11px] leading-4", first ? "text-muted-foreground" : tone)} title={note}>{label}{first && route.length > 1 && label !== "Rejected by" && <> · Step {Math.max(0, i) + 1} of {route.length}</>}</span>
          <span className="block truncate text-[13px] font-medium leading-5" title={first && note ? `${first.name} · ${note}` : undefined}>{first ? `${first.name}${ids.length > 1 ? ` +${ids.length - 1}` : ""}` : note}</span>
        </span>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{open ? "Hide" : count > 1 ? `All ${count} approvers` : "View route"}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-3 animate-in fade-in slide-in-from-top-1"><RouteTimeline r={r} preview={editable} /></div>}
    </div>
  );
}

export function SummaryRail({ r, editable, onCheckAction, extra, after, hideChecks }: { r: PRequest; editable?: boolean; onCheckAction?: (c: CheckT) => void; extra?: ReactNode; after?: ReactNode; hideChecks?: boolean }) {
  const db = useDB();
  return (
    <div className="space-y-4">
      <div className="pd-panel rounded-xl p-4">
        <TotalsBlock r={r} />
        <RouteSummary r={r} editable={editable} />
      </div>
      <section className="pd-panel rounded-xl p-4"><BudgetBlock r={r} editable={editable} /></section>
      {!hideChecks && <Section title="Procurement checks"><ChecksBlock r={r} onAction={onCheckAction} /></Section>}
      {extra}
      {after}
    </div>
  );
}
