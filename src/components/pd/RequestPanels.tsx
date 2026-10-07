import { useNavigate } from "@tanstack/react-router";
import { Check, Clock, FileUp, Paperclip, Users, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { budgetStatus, computeRoute, currentStageIndex, findDuplicates, money, runChecks, smartDate, smartTime, supplierBreakdown, totals, uid, type Check as CheckT } from "@/lib/pd/engine";
import { log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import type { Attachment, PRequest, Stage } from "@/lib/pd/types";
import { CheckIcon, Money, Section, SourceMark, StatusBadge, UserAvatar } from "./bits";
import { cn } from "@/lib/utils";

export function TotalsBlock({ r }: { r: PRequest }) {
  const t = totals(r);
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Request total</p>
      <Money v={t.total} className="block text-2xl font-medium tracking-tight" />
      <dl className="space-y-1 pt-2 text-xs">
        {[["Subtotal", t.subtotal], ["Shipping", t.shipping], ["Tax", t.tax]].map(([k, v]) => (
          <div key={k as string} className="flex justify-between text-muted-foreground">
            <dt>{k}</dt>
            <dd><Money v={v as number} /></dd>
          </div>
        ))}
      </dl>
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
      {editable ? (
        <div>
          <div className="mb-1 flex justify-between"><span className="text-xs text-muted-foreground">Budget</span><SourceMark s={r.sources.budget} /></div>
          <select id="budget-select-anchor" className="pd-input" value={r.budgetId ?? ""} onChange={(e) => setBudget(e.target.value)}>
            <option value="">Select a budget…</option>
            {db.budgets.map((bb) => <option key={bb.id} value={bb.id}>{bb.name}</option>)}
          </select>
        </div>
      ) : (
        <p className="text-sm font-medium">{b?.budget.name ?? "No budget selected"}</p>
      )}
      {b && (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><p className="text-muted-foreground">Available</p><Money v={Math.max(0, b.available)} className="text-sm" /></div>
            <div><p className="text-muted-foreground">This request</p><Money v={b.request} className="text-sm" /></div>
            <div><p className="text-muted-foreground">Total</p><Money v={b.budget.total} className="text-sm" /></div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
            <div className={cn("h-full", b.over ? "bg-destructive" : "bg-success")} style={{ width: `${Math.min(100, ((b.budget.total - b.available + b.request) / b.budget.total) * 100)}%` }} />
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
  const requester = db.users.find((u) => u.id === r.requesterId);
  if (!stages.length) return <p className="text-xs text-muted-foreground">Route will be calculated from your organization's approval rules.</p>;
  return (
    <ol className="relative space-y-4">
      <li className="flex items-center gap-2.5 text-sm">
        <UserAvatar user={requester} /> <span>{requester?.name}</span>
        <span className="text-xs text-muted-foreground">{r.submittedAt ? `Submitted ${smartTime(r.submittedAt)}` : "Requester"}</span>
      </li>
      {stages.map((s, i) => {
        const done = !preview && s.approvals.every((a) => a.status === "approved");
        const active = !preview && i === cur;
        return (
          <li key={s.id} className="relative pl-3.5">
            <span className={cn("absolute top-1 left-0 h-[calc(100%-4px)] w-0.5 rounded-full", done ? "bg-success" : active ? "bg-primary" : "bg-border")} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{i + 1}. {s.name}</p>
              <span className="text-[11px] text-muted-foreground">{done ? "Complete" : active ? "In review" : preview ? s.reason : "Upcoming"}</span>
            </div>
            {s.approvals.length > 1 && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Users className="size-3" /> Parallel · {s.mode === "all" ? `All ${s.approvals.length} reviewers must approve` : "Any one reviewer can approve"}</p>
            )}
            <ul className="mt-1.5 space-y-1.5">
              {s.approvals.map((a) => {
                const u = db.users.find((x) => x.id === a.userId);
                return (
                  <li key={a.userId} className="flex items-start gap-2 text-sm">
                    <UserAvatar user={u} />
                    <div className="min-w-0 flex-1">
                      <p className="leading-6">{u?.name} <span className="text-xs text-muted-foreground">· {u?.title}</span></p>
                      {a.comment && <p className="text-xs text-muted-foreground">“{a.comment}”</p>}
                      {a.delegatedFrom && <p className="text-[11px] text-muted-foreground">Delegated by {db.users.find((x) => x.id === a.delegatedFrom)?.name}</p>}
                    </div>
                    <ApprovalState status={preview ? "waiting" : a.status} at={a.at} />
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function ApprovalState({ status, at }: { status: string; at?: string }) {
  const map: Record<string, [string, string]> = {
    approved: ["Approved", "text-success"],
    rejected: ["Rejected", "text-destructive"],
    changes: ["Changes", "text-warning"],
    pending: ["Awaiting", "text-primary"],
    waiting: ["Upcoming", "text-muted-foreground"],
  };
  const [l, c] = map[status];
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-[11px] leading-6", c)} title={at ? new Date(at).toLocaleString() : undefined}>
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
  const [kind, setKind] = useState<Attachment["kind"]>("spec");
  const [uploading, setUploading] = useState<string[]>([]);
  const add = (files: FileList | null) => {
    if (!files) return;
    [...files].forEach((f) => {
      setUploading((u) => [...u, f.name]);
      setTimeout(() => {
        updateRequest(r.id, (x) => {
          x.attachments.push({ id: uid("att"), name: f.name, size: f.size, kind, uploadedAt: new Date().toISOString() });
          log(x, `Attachment added: ${f.name}`, "edit", me?.id);
        });
        setUploading((u) => u.filter((n) => n !== f.name));
      }, 700);
    });
  };
  const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <div className="space-y-2">
      {r.attachments.length === 0 && uploading.length === 0 && <p className="text-xs text-muted-foreground">No attachments. Quotes, specifications and business cases help approvers decide faster.</p>}
      {r.attachments.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <Paperclip className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{a.name}</span>
          <span className="text-[11px] capitalize text-muted-foreground">{a.kind} · {kb(a.size)}</span>
          {editable && (
            <button aria-label={`Remove ${a.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => updateRequest(r.id, (x) => { x.attachments = x.attachments.filter((y) => y.id !== a.id); log(x, `Attachment removed: ${a.name}`, "edit", me?.id); })}>
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      {uploading.map((n) => (
        <div key={n} className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          <span className="ai-thinking-dot size-1.5 rounded-full bg-primary" /> Uploading {n}…
        </div>
      ))}
      {editable && (
        <div className="flex items-center gap-2 pt-1">
          <select className="pd-input h-8 w-36" value={kind} onChange={(e) => setKind(e.target.value as Attachment["kind"])}>
            <option value="quote">Supplier quote</option>
            <option value="spec">Specification</option>
            <option value="business">Business case</option>
            <option value="other">Other</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => input.current?.click()}><FileUp /> Upload</Button>
          <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </div>
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

export function SummaryRail({ r, editable, onCheckAction }: { r: PRequest; editable?: boolean; onCheckAction?: (c: CheckT) => void }) {
  return (
    <div className="space-y-4">
      <Section title="Total"><TotalsBlock r={r} /></Section>
      <Section title="Budget"><BudgetBlock r={r} editable={editable} /></Section>
      <Section title="Procurement checks"><ChecksBlock r={r} onAction={onCheckAction} /></Section>
      <Section title="Suppliers"><SupplierBlock r={r} /></Section>
      <Section title={editable ? "Approval route preview" : "Approval route"}>
        <RouteTimeline r={r} preview={editable} />
      </Section>
      {r.requiredBy && <p className="px-1 text-xs text-muted-foreground">Required by {smartDate(r.requiredBy)}</p>}
    </div>
  );
}
