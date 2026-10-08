import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, Money, Section, StatusBadge } from "@/components/pd/bits";
import { LineItems } from "@/components/pd/LineItems";
import { ActivityLog, Attachments, ChecksBlock, Comments, SummaryRail } from "@/components/pd/RequestPanels";
import { currentStageIndex, isPendingFor, money, runChecks, smartDate, totals } from "@/lib/pd/engine";
import { decide, delegate, log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import type { PRequest } from "@/lib/pd/types";

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
  const [withdrawOpen, setWithdrawOpen] = useState(false);

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

  const withdraw = () => {
    updateRequest(r.id, (x) => {
      x.status = "draft";
      x.route.forEach((st) => st.approvals.forEach((ap) => { if (ap.status === "pending") ap.status = "waiting"; }));
      log(x, `Request withdrawn by requester${reason.trim() ? ` — ${reason.trim()}` : ""}`, "system", me.id);
    });
    setWithdrawOpen(false);
    setReason("");
    toast.success("Request withdrawn — it's back in your drafts");
  };

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
              {isOwner && r.status === "pending" && <Button size="sm" variant="outline" onClick={() => setWithdrawOpen(true)}>Withdraw request</Button>}
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
          <Section title={`Line items · ${r.items.length}`}><LineItems r={r} editable={false} /></Section>
          <Section title="Overview">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[["Business unit", r.businessUnit], ["Request type", r.requestType], ["Contact", requester?.name], ["Ship to", r.shipTo], ["Payment", r.paymentMethod], ["Shipment", r.shipmentType], ["Required by", smartDate(r.requiredBy)], ["Quote #", r.quoteNo || "—"], ["Options", [r.urgent && "Urgent", r.delayed && "Delayed release", r.blanket && "Blanket"].filter(Boolean).join(", ") || "—"]].map(([k, v]) => (
                <div key={k as string}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>
              ))}
              {(r.noteBuyer || r.noteSupplier) && <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Notes</dt><dd>{r.noteBuyer}{r.noteSupplier && <><br />To supplier: {r.noteSupplier}</>}</dd></div>}
            </dl>
          </Section>
          <Section title="Comments"><Comments r={r} /></Section>
          <Section title="Activity · audit trail"><ActivityLog r={r} /></Section>
        </div>
        <aside className="space-y-4">
          <div className="lg:sticky lg:top-4">
            <SummaryRail r={r} hideChecks extra={<Section title="Attachments"><Attachments r={r} editable={isOwner && ["draft", "changes"].includes(r.status)} /></Section>} />
          </div>
        </aside>
      </div>

      {mine && (
        <div className="fixed inset-x-0 bottom-14 z-20 flex gap-2 border-t border-border bg-surface p-3 md:hidden">
          <Button variant="outline" className="flex-1" onClick={() => setAction("reject")}>Reject</Button>
          <Button variant="outline" className="flex-1" onClick={() => setAction("changes")}>Changes</Button>
          <Button className="flex-1" onClick={quickApprove}>Approve</Button>
        </div>
      )}

      {isOwner && r.status === "pending" && !mine && (
        <div className="fixed inset-x-0 bottom-14 z-20 border-t border-border bg-surface p-3 md:hidden">
          <Button variant="outline" className="w-full" onClick={() => setWithdrawOpen(true)}>Withdraw request</Button>
        </div>
      )}

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Withdraw this request?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">It will be pulled back from approvers and returned to you as a draft, so you can edit and resubmit it.</p>
          <textarea className="pd-input py-2" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Keep pending</Button>
            <Button onClick={withdraw}>Withdraw request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{{ approve: "Approve request", reject: "Reject request", changes: "Request changes", delegate: "Delegate approval" }[action ?? "approve"]}</DialogTitle></DialogHeader>
          {action === "approve" && (
            <div className="space-y-3 text-sm">
              <p>You're approving <span className="font-medium">{money(totals(r).total)}</span> despite these open checks:</p>
              <ChecksBlock r={{ ...r }} />
              <textarea className="pd-input py-2" placeholder="Optional comment" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {action === "reject" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {["Budget unavailable", "Duplicate purchase", "Not required", "Policy violation", "Incorrect information", "Other"].map((p) => <button key={p} className="pd-chip" data-active={preset === p} onClick={() => setPreset(p)}>{p}</button>)}
              </div>
              <textarea className="pd-input" placeholder={preset === "Other" ? "Explain the reason (required)" : "Add detail for the requester"} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {action === "changes" && <textarea className="pd-input" placeholder="e.g. Please select the approved laptop model." value={reason} onChange={(e) => setReason(e.target.value)} />}
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
