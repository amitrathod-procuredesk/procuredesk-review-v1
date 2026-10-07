import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiGlyph, Empty, Money, Section, StatusBadge } from "@/components/pd/bits";
import { AssistantThread } from "@/components/pd/GlobalAssistant";
import { LineItems } from "@/components/pd/LineItems";
import { ActivityLog, Attachments, BudgetBlock, ChecksBlock, Comments, RouteTimeline, SupplierBlock, TotalsBlock } from "@/components/pd/RequestPanels";
import { budgetStatus, currentStageIndex, findDuplicates, isPendingFor, money, runChecks, smartDate, supplierBreakdown, totals } from "@/lib/pd/engine";
import { decide, delegate, log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import type { DB, PRequest } from "@/lib/pd/types";

export const Route = createFileRoute("/app/requests/$id/")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} · ProcureDesk` },
      { name: "description", content: "Purchase request detail with budget, policy checks, approval route and audit trail." },
      { property: "og:title", content: `${params.id} · ProcureDesk` },
      { property: "og:description", content: "Purchase request detail." },
    ],
  }),
  component: Detail,
});

function aiSummary(r: PRequest, db: DB) {
  const sup = supplierBreakdown(r, db);
  const b = budgetStatus(r, db);
  const items = r.items.slice(0, 2).map((i) => `${i.qty} ${i.description}`).join(" and ");
  const more = r.items.length > 2 ? ` plus ${r.items.length - 2} more line${r.items.length > 3 ? "s" : ""}` : "";
  const dept = db.departments.find((d) => d.id === r.departmentId)?.name;
  let s = `This request includes ${items}${more} for ${dept ?? "an unassigned department"}${r.project ? ` (${r.project})` : ""}. It uses ${sup.map((x) => x.name).join(", ") || "no supplier"}`;
  s += b ? (b.over ? ` and exceeds the ${b.budget.name} budget by ${money(-b.remaining)}${r.exceptionRequested ? "; the requester asked for an exception" : ""}.` : ` and fits within ${b.budget.name}, leaving ${money(b.remaining)}.`) : ".";
  const dups = findDuplicates(r, db);
  if (dups.length) s += ` A similar request (${dups[0].id}) was submitted recently.`;
  return s;
}

function Detail() {
  const { id } = Route.useParams();
  const db = useDB();
  const me = useMe()!;
  const nav = useNavigate();
  const r = db.requests.find((x) => x.id === id);
  const [action, setAction] = useState<null | "approve" | "reject" | "changes" | "delegate">(null);
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState("");
  const [delegateTo, setDelegateTo] = useState("");

  if (!r) return <div className="p-8"><Empty title="Request not found" action={<Link to="/app/requests" className="pd-chip">Back to requests</Link>} /></div>;
  const canView = me.role !== "requestor" || r.requesterId === me.id;
  if (!canView) return <div className="p-8"><Empty title="Permission denied" body="You can only view requests you created." /></div>;

  const mine = isPendingFor(r, me.id);
  const stage = r.route[currentStageIndex(r)];
  const isOwner = r.requesterId === me.id;
  const requester = db.users.find((u) => u.id === r.requesterId);
  const dept = db.departments.find((d) => d.id === r.departmentId);
  const checks = runChecks(r, db);
  const needsConfirm = checks.some((c) => c.level !== "ok");

  const confirm = () => {
    if (action === "delegate") {
      delegate(r.id, me.id, delegateTo);
      toast.success("Approval delegated");
    } else if (action) {
      const text = action === "reject" ? [preset, reason].filter(Boolean).join(" — ") : reason;
      decide(r.id, me.id, action, text);
      toast.success(action === "approve" ? "Approved" : action === "reject" ? "Request rejected" : "Changes requested");
    }
    setAction(null);
    setReason("");
    setPreset("");
  };
  const quickApprove = () => (needsConfirm ? setAction("approve") : (decide(r.id, me.id, "approve", ""), toast.success("Approved")));
  const advance = (to: PRequest["status"], label: string) => updateRequest(r.id, (x) => { x.status = to; log(x, label, "system", me.id); });

  return (
    <div className="pb-24 md:pb-0">
      <header className="border-b border-border bg-surface px-4 py-4 md:px-8">
        <Link to={mine ? "/app/approvals" : "/app/requests"} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> {mine ? "Approvals" : "Requests"}</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{r.title || "Untitled request"}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="num">{r.id}</span><StatusBadge status={r.status} />
              <span>· {dept?.name ?? "—"}</span><span>· {r.project || "No project"}</span><span>· {requester?.name}</span>
              {r.urgent && <span className="pd-badge st-rejected">Urgent</span>}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Money v={totals(r).total} className="text-2xl font-medium" />
            <div className="hidden gap-2 md:flex">
              {mine && <>
                <Button variant="outline" size="sm" onClick={() => setAction("delegate")}>Delegate</Button>
                <Button variant="outline" size="sm" onClick={() => setAction("reject")}>Reject</Button>
                <Button variant="outline" size="sm" onClick={() => setAction("changes")}>Request changes</Button>
                <Button size="sm" onClick={quickApprove}>Approve</Button>
              </>}
              {isOwner && ["draft", "changes"].includes(r.status) && <Button size="sm" onClick={() => nav({ to: "/app/requests/$id/edit", params: { id: r.id }, search: { prompt: undefined } })}>{r.status === "changes" ? "Edit & resubmit" : "Continue editing"}</Button>}
              {(isOwner || me.role === "admin") && ["draft", "pending", "changes"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => { advance("cancelled", "Request cancelled"); toast("Request cancelled"); }}>Cancel request</Button>}
              {me.role === "admin" && r.status === "approved" && <Button size="sm" onClick={() => advance("ordered", "Purchase order issued")}>Mark ordered</Button>}
              {me.role === "admin" && r.status === "ordered" && <><Button size="sm" variant="outline" onClick={() => advance("partial", "Partially received")}>Partially received</Button><Button size="sm" onClick={() => advance("received", "All items received")}>Mark received</Button></>}
              {me.role === "admin" && r.status === "partial" && <Button size="sm" onClick={() => advance("received", "All items received")}>Mark received</Button>}
            </div>
          </div>
        </div>
        {mine && stage && <p className="mt-3 text-sm">You're reviewing <span className="font-medium">{stage.name}</span> — required because {stage.reason.toLowerCase()}.{stage.approvals.length > 1 && ` ${stage.mode === "all" ? `All ${stage.approvals.length} reviewers must approve.` : "Any one reviewer can approve."}`}</p>}
        {r.decisionReason && ["changes", "rejected"].includes(r.status) && <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm">{r.status === "rejected" ? "Rejected" : "Changes requested"}: “{r.decisionReason}”</p>}
      </header>

      <div className="grid gap-4 p-4 md:p-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <section className="ai-surface rounded-r-lg px-4 py-3">
            <p className="mb-1 flex items-center gap-2 text-xs font-medium text-ai"><AiGlyph /> AI summary</p>
            <p className="text-sm leading-relaxed">{aiSummary(r, db)}</p>
          </section>
          <Section title="Procurement checks"><ChecksBlock r={r} /></Section>
          <Section title={`Line items · ${r.items.length}`}><LineItems r={r} editable={false} /></Section>
          <Section title="Overview">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[["Business unit", r.businessUnit], ["Request type", r.requestType], ["Contact", requester?.name], ["Ship to", r.shipTo], ["Payment", r.paymentMethod], ["Shipment", r.shipmentType], ["Required by", smartDate(r.requiredBy)], ["Quote #", r.quoteNo || "—"], ["Options", [r.urgent && "Urgent", r.delayed && "Delayed release", r.blanket && "Blanket"].filter(Boolean).join(", ") || "—"]].map(([k, v]) => (
                <div key={k as string}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>
              ))}
              {(r.noteBuyer || r.noteSupplier) && <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Notes</dt><dd>{r.noteBuyer}{r.noteSupplier && <><br />To supplier: {r.noteSupplier}</>}</dd></div>}
            </dl>
          </Section>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Attachments"><Attachments r={r} editable={isOwner && ["draft", "changes"].includes(r.status)} /></Section>
            <Section title="Comments"><Comments r={r} /></Section>
          </div>
          <Section title="Activity · audit trail"><ActivityLog r={r} /></Section>
        </div>
        <aside className="space-y-4">
          <Section title="Total"><TotalsBlock r={r} /></Section>
          <Section title="Budget"><BudgetBlock r={r} /></Section>
          <Section title="Approval route"><RouteTimeline r={r} preview={r.status === "draft"} /></Section>
          <Section title="Suppliers"><SupplierBlock r={r} /></Section>
          {me.role !== "requestor" && (
            <Section title="Ask AI about this request">
              <div className="h-80"><AssistantThread compact ctx={r} suggestions={["Why is this request over budget?", "Is the supplier preferred?", "What similar requests were made recently?", "What policy requires my approval?"]} /></div>
            </Section>
          )}
        </aside>
      </div>

      {mine && (
        <div className="fixed inset-x-0 bottom-14 z-20 flex gap-2 border-t border-border bg-surface p-3 md:hidden">
          <Button variant="outline" className="flex-1" onClick={() => setAction("reject")}>Reject</Button>
          <Button variant="outline" className="flex-1" onClick={() => setAction("changes")}>Changes</Button>
          <Button className="flex-1" onClick={quickApprove}>Approve</Button>
        </div>
      )}

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{{ approve: "Approve request", reject: "Reject request", changes: "Request changes", delegate: "Delegate approval" }[action ?? "approve"]}</DialogTitle></DialogHeader>
          {action === "approve" && (
            <div className="space-y-3 text-sm">
              <p>You're approving <span className="font-medium">{money(totals(r).total)}</span> despite these open checks:</p>
              <ChecksBlock r={{ ...r }} />
              <textarea className="pd-input h-16 py-2" placeholder="Optional comment" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {action === "reject" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {["Budget unavailable", "Duplicate purchase", "Not required", "Policy violation", "Incorrect information", "Other"].map((p) => <button key={p} className="pd-chip" data-active={preset === p} onClick={() => setPreset(p)}>{p}</button>)}
              </div>
              <textarea className="pd-input h-20 py-2" placeholder={preset === "Other" ? "Explain the reason (required)" : "Add detail for the requester"} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {action === "changes" && <textarea className="pd-input h-24 py-2" placeholder="e.g. Please select the approved laptop model." value={reason} onChange={(e) => setReason(e.target.value)} />}
          {action === "delegate" && (
            <select className="pd-input" value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)}>
              <option value="">Choose an approver…</option>
              {db.users.filter((u) => u.role === "approver" && u.id !== me.id && u.active).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.title}</option>)}
            </select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              variant={action === "reject" ? "destructive" : "default"}
              disabled={(action === "changes" && !reason.trim()) || (action === "reject" && (!preset || (preset === "Other" && !reason.trim()))) || (action === "delegate" && !delegateTo)}
              onClick={confirm}
            >
              {{ approve: "Approve", reject: "Reject request", changes: "Send back to requester", delegate: "Delegate" }[action ?? "approve"]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
