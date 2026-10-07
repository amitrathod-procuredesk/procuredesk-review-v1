import { useNavigate } from "@tanstack/react-router";
import { Check, Clock, GitFork, FileUp, Paperclip, Users, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { budgetStatus, computeRoute, currentStageIndex, findDuplicates, money, runChecks, smartDate, smartTime, supplierBreakdown, totals, uid, type Check as CheckT } from "@/lib/pd/engine";
import { log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import type { Attachment, PRequest, Stage } from "@/lib/pd/types";
import { CheckIcon, Money, Section, SourceMark, StatusBadge, UserAvatar } from "./bits";
import { cn } from "@/lib/utils";

const SHADES = ["bg-primary", "bg-primary/60", "bg-primary/30", "bg-primary/15", "bg-muted-foreground/30"];

export function TotalsBlock({ r }: { r: PRequest }) {
  const db = useDB();
  const t = totals(r);
  const sup = supplierBreakdown(r, db);
  return (
    <div>
      <p className="text-xs text-muted-foreground">Request total</p>
      <Money v={t.total} className="block text-[28px] font-semibold leading-tight tracking-tight" />
      <p className="text-xs text-muted-foreground">{r.items.length} line{r.items.length === 1 ? "" : "s"} · {sup.length} supplier{sup.length === 1 ? "" : "s"}</p>
      <dl className="mt-3 space-y-1 border-y border-border py-2.5 text-xs">
        {([["Subtotal", t.subtotal], ["Shipping", t.shipping], ["Tax", t.tax]] as const).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <dt className="text-muted-foreground">{k}</dt>
            <dd><Money v={v} className={cn("num", v === 0 && k !== "Subtotal" && "text-muted-foreground")} /></dd>
          </div>
        ))}
      </dl>
      {sup.length > 0 && t.total > 0 && (
        <>
          <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            {sup.map((s, i) => <div key={s.vendorId} className={cn("h-full transition-all duration-500", SHADES[i % SHADES.length])} style={{ width: `${(s.amount / t.total) * 100}%` }} title={s.name} />)}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {sup.map((s, i) => (
              <li key={s.vendorId} className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-[3px]", SHADES[i % SHADES.length])} />
                <span className="flex-1 truncate">{s.name}</span>
                <Money v={s.amount} />
              </li>
            ))}
          </ul>
        </>
      )}
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
  const b = budgetStatus(r, db);
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
        <span className="text-sm font-semibold">Budget</span>
        {b ? (
          <span className={cn("num text-xs font-medium", b.over ? "text-destructive" : "text-success")}>{b.over ? `Over by ${money(-b.remaining)}` : `${money(b.remaining)} left after`}</span>
        ) : <SourceMark s={r.sources.budget} />}
      </div>
      {editable ? (
        <select id="budget-select-anchor" className="pd-input h-10 rounded-lg" value={r.budgetId ?? ""} onChange={(e) => setBudget(e.target.value)}>
          <option value="">Select a budget…</option>
          {db.budgets.map((bb) => <option key={bb.id} value={bb.id}>{bb.name}</option>)}
        </select>
      ) : (
        <p className="rounded-lg border border-border px-3 py-2 text-sm">{b?.budget.name ?? "No budget selected"}</p>
      )}
      {b && (
        <>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-subtle">
            <div className="h-full bg-muted-foreground/30 transition-all duration-500" style={{ width: `${Math.min(100, ((b.budget.total - b.available) / b.budget.total) * 100)}%` }} />
            <div className={cn("h-full transition-all duration-500", b.over ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.max(1, Math.min(100, (b.request / b.budget.total) * 100))}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span><Money v={Math.max(0, b.available)} /> available</span>
            <span><Money v={b.budget.total} /> total</span>
          </div>
          {b.over ? (
            <div className="rounded-md bg-danger-soft p-3 text-xs">
              <p className="font-medium text-destructive">Over budget by {money(-b.remaining)}</p>
              <p className="mt-1 text-foreground/80">This request exceeds the selected budget. {r.exceptionRequested ? "An exception has been requested — approvers will decide." : "You can choose another budget or request an exception."}</p>
              {editable && !r.exceptionRequested && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button className="pd-chip" onClick={() => document.getElementById("budget-select-anchor")?.focus()}>Choose another budget</button>
                  <button className="pd-chip" onClick={() => setExc(true)}>Request exception</button>
                  <button className="pd-chip" onClick={() => document.getElementById("line-items")?.scrollIntoView({ behavior: "smooth" })}>Edit request</button>
                </div>
              )}
              {r.exceptionRequested && r.exceptionReason && <p className="mt-1 italic text-muted-foreground">“{r.exceptionReason}”</p>}
            </div>
          ) : (
            <p className="text-xs text-success">Within budget · {money(b.remaining)} remains after this request</p>
          )}
        </>
      )}
      <Dialog open={exc} onOpenChange={setExc}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request budget exception</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Explain why this purchase should proceed over budget. Approvers will see your justification.</p>
          <textarea className="pd-input h-24 py-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Hiring plan approved in Q3; budget top-up pending in FY26 reforecast." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setExc(false)}>Cancel</Button>
            <Button disabled={!reason.trim()} onClick={() => { updateRequest(r.id, (x) => { x.exceptionRequested = true; x.exceptionReason = reason; log(x, "Budget exception requested", "edit", me?.id); }); setExc(false); toast.success("Exception will be reviewed by approvers"); }}>Request exception</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const stages: Stage[] = preview ? computeRoute(r, db) : r.route;
  const cur = currentStageIndex(r);
  if (!stages.length) return <p className="text-xs text-muted-foreground">Route will be calculated from your organization's approval rules.</p>;
  const par = stages.map((s, i) => ({ s, i })).filter(({ s }) => s.approvals.length > 1);
  return (
    <div>
      <ol>
        {stages.map((s, i) => {
          const done = !preview && s.approvals.every((a) => a.status === "approved");
          const active = !preview && i === cur;
          const last = i === stages.length - 1;
          const multi = s.approvals.length > 1;
          const rows = s.approvals.map((a) => {
            const u = db.users.find((x) => x.id === a.userId);
            return (
              <li key={a.userId} className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-[11px] font-semibold text-foreground/70">{u?.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-5">{u?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u?.title}</p>
                  {a.comment && <p className="text-xs text-muted-foreground">“{a.comment}”</p>}
                  {a.delegatedFrom && <p className="text-[11px] text-muted-foreground">Delegated by {db.users.find((x) => x.id === a.delegatedFrom)?.name}</p>}
                </div>
                <ApprovalState status={preview ? "waiting" : a.status} at={a.at} />
              </li>
            );
          });
          return (
            <li key={s.id} className="relative pb-4 pl-9 last:pb-0">
              {!last && <span className={cn("absolute left-[11px] top-6 bottom-0 w-px", done ? "bg-success/50" : "bg-border")} />}
              <span className={cn("absolute left-0 top-0 flex size-6 items-center justify-center rounded-full border text-[11px] font-medium", done ? "border-success bg-success text-primary-foreground" : active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground")}>
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <div className="flex min-h-6 flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-foreground/85">{s.name}</p>
                {multi && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><GitFork className="size-3" /> Parallel</span>}
              </div>
              <ul className={cn("mt-2 space-y-2.5", multi && "rounded-lg border border-border p-2.5")}>{rows}</ul>
            </li>
          );
        })}
      </ol>
      {par.map(({ s, i }) => (
        <p key={s.id} className="mt-3 text-xs text-muted-foreground">Step {i + 1} approvers review at the same time. {s.mode === "all" ? `All ${s.approvals.length} must approve.` : "Any one can approve."}</p>
      ))}
    </div>
  );
}

function ApprovalState({ status, at }: { status: string; at?: string }) {
  const map: Record<string, [string, string]> = {
    approved: ["Approved", "bg-success/10 text-success"],
    rejected: ["Rejected", "bg-destructive/10 text-destructive"],
    changes: ["Changes", "bg-warning/15 text-warning"],
    pending: ["Awaiting", "bg-primary/10 text-primary"],
    waiting: ["Upcoming", "bg-subtle text-muted-foreground"],
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
  const mentionable = db.users.filter((u) => u.role !== "admin" || u.id === me?.id).slice(0, 6);
  return (
    <div className="space-y-3">
      {r.comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
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
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || !me) return;
          updateRequest(r.id, (x) => { x.comments.push({ id: uid("c"), userId: me.id, text, at: new Date().toISOString() }); });
          setText("");
        }}
      >
        <textarea className="pd-input h-16 py-2" placeholder="Add a comment… use @ to mention" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-1">
          {mentionable.map((u) => (
            <button type="button" key={u.id} className="rounded-sm px-1.5 text-[11px] text-muted-foreground hover:bg-subtle" onClick={() => setText((t) => `${t}@${u.name} `)}>@{u.name.split(" ")[0]}</button>
          ))}
          <Button type="submit" size="sm" className="ml-auto" disabled={!text.trim()}>Comment</Button>
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
          <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", a.kind === "ai" ? "bg-ai" : a.kind === "approve" ? "bg-success" : a.kind === "reject" ? "bg-destructive" : a.kind === "changes" ? "bg-warning" : "bg-muted-foreground/40")} />
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

export function SummaryRail({ r, editable, onCheckAction, extra, hideChecks }: { r: PRequest; editable?: boolean; onCheckAction?: (c: CheckT) => void; extra?: ReactNode; hideChecks?: boolean }) {
  const db = useDB();
  return (
    <div className="space-y-4">
      <div className="pd-panel rounded-xl p-4">
        <TotalsBlock r={r} />
        <div className="mt-4 border-t border-border pt-4"><BudgetBlock r={r} editable={editable} /></div>
      </div>
      {!hideChecks && <Section title="Procurement checks"><ChecksBlock r={r} onAction={onCheckAction} /></Section>}
      {extra}
      <section className="pd-panel p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">Approval route</h3>
          <span className="text-xs text-muted-foreground">{(() => { const n = (editable ? computeRoute(r, db) : r.route).reduce((t, s) => t + s.approvals.length, 0); return `${n} approver${n === 1 ? "" : "s"}`; })()}</span>
        </div>
        <RouteTimeline r={r} preview={editable} />
      </section>
      {r.requiredBy && <p className="px-1 text-xs text-muted-foreground">Required by {smartDate(r.requiredBy)}</p>}
    </div>
  );
}
