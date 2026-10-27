import { approveLines } from "@/lib/pd/store";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, ListChecks, MessageSquareReply, CheckCheck, Building2, FileText, User, MapPin, CreditCard, Truck, CalendarDays, Hash, Zap, StickyNote, Users, FolderKanban, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, Section, StatusBadge } from "@/components/pd/bits";
import { LineItems } from "@/components/pd/LineItems";
import { AuditTrailButton, POST_APPROVAL, RequestActionsButton } from "@/components/pd/RequestActions";
import { Attachments, ChecksBlock, Comments, SummaryRail } from "@/components/pd/RequestPanels";
import { isPendingFor, lineTotal, money, runChecks, smartDate, totals } from "@/lib/pd/engine";
import { decide, delegate, log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";
import type { PRequest } from "@/lib/pd/types";

export const Route = createFileRoute("/app/requests/$id/")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} · ProcureDesk` },
      { name: "description", content: "Purchase request detail with budget, policy checks, approval route and audit trail." },
      { property: "og:title", content: `${params.id} · ProcureDesk` },
      { property: "og:description", content: "Purchase request detail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const db = useDB();
  const me = useMe();
  const nav = useNavigate();
  const r = db.requests.find((x) => x.id === id);
  const [action, setAction] = useState<null | "approve" | "partial" | "reject" | "changes" | "delegate">(null);
  const [keep, setKeep] = useState<string[]>([]);
  
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState("");
  const [delegateTo, setDelegateTo] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  if (!me) return null;
  if (!r) return <div className="p-8"><Empty title="Request not found" action={<Link to="/app/requests" className="pd-chip">Back to requests</Link>} /></div>;
  const canView = me.role !== "requestor" || r.requesterId === me.id;
  if (!canView) return <div className="p-8"><Empty title="Permission denied" body="You can only view requests you created." /></div>;

  const mine = isPendingFor(r, me.id);
  const isOwner = r.requesterId === me.id;
  const requester = db.users.find((u) => u.id === r.requesterId);
  const dept = db.departments.find((d) => d.id === r.departmentId);
  const checks = runChecks(r, db);
  const needsConfirm = checks.some((c) => c.level !== "ok");

  const confirm = () => {
    if (action === "delegate") {
      delegate(r.id, me.id, delegateTo);
      toast.success("Approval delegated");
    } else if (action === "partial") {
      const live = r.items.filter((l) => !l.declined);
      decide(r.id, me.id, "approve", reason, live.filter((l) => !keep.includes(l.id)).map((l) => l.id));
      toast.success(`Approved ${keep.length} of ${live.length} items`, { description: "Declined items are excluded from the total." });
    } else if (action) {
      const text = action === "reject" ? [preset, reason].filter(Boolean).join(" — ") : reason;
      decide(r.id, me.id, action, text);
      toast.success(action === "approve" ? "Approved" : action === "reject" ? "Request rejected" : "Changes requested");
    }
    setAction(null);
    setReason("");
    setPreset("");
  };
  const liveItems = r.items.filter((l) => !l.declined);
  const approvePicked = () => {
    approveLines(r.id, me.id, keep);
    toast.success(keep.length === openItems.length ? "Approved" : `Approved ${keep.length} of ${openItems.length} items`, { description: keep.length === openItems.length ? undefined : "The remaining items stay pending for your decision." });
    setKeep([]); setReason("");
  };
  const openItems = liveItems.filter((l) => !l.approved);
  const picking = mine && openItems.length >= 2;
  const keptTotal = liveItems.filter((l) => keep.includes(l.id)).reduce((s, l) => s + lineTotal(l), 0);
  const approveMenu = (full?: boolean) => <Button size="sm" className={cn(full && "flex-1")} onClick={quickApprove}>Approve</Button>;
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
    <div className="pb-24 md:pb-0 lg:flex lg:h-[calc(100dvh-60px)] lg:flex-col lg:overflow-hidden lg:pb-0 print:block print:h-auto">
      <header className="no-print-actions shrink-0 bg-surface px-4 py-4 md:px-8">
        <Link to={mine ? "/app/approvals" : "/app/requests"} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> {mine ? "Approvals" : "Requests"}</Link>
        <div className="flex flex-wrap items-start justify-between gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-6">
          <div className="min-w-0 flex-1 basis-[28rem]">
            <RequestTitle text={r.title || "Untitled request"} />
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="num">{r.id}</span><StatusBadge r={r} />
              {r.urgent && <span className="pd-badge st-rejected">Urgent</span>}
              {r.tags?.map((t) => <span key={t} className="inline-flex h-5 items-center rounded-full bg-subtle px-2 text-[11px] font-medium text-foreground/70">{t}</span>)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2 md:hidden">
              <AuditTrailButton r={r} compact />
              {(r.status === "pending" || (POST_APPROVAL as readonly string[]).includes(r.status)) && <RequestActionsButton r={r} />}
            </div>
            {/* Text actions first; icon-only utilities (audit trail, more) grouped at the end */}
            <div className="hidden items-center gap-2 md:flex">
              {mine && <>
                <Button variant="ghost" size="sm" onClick={() => nav({ to: "/app/requests/$id/edit", params: { id: r.id }, search: { prompt: undefined } })}><Pencil className="size-3.5" />Edit</Button>
                <Button variant="outline" size="sm" onClick={() => setAction("delegate")}>Reassign</Button>
                <Button variant="outline" size="sm" onClick={() => setAction("changes")}>Request changes</Button>
                <Button variant="destructive-soft" size="sm" onClick={() => setAction("reject")}>Reject</Button>
                {keep.length === 0 && approveMenu()}
              </>}
              {isOwner && ["draft", "changes"].includes(r.status) && <Button size="sm" onClick={() => nav({ to: "/app/requests/$id/edit", params: { id: r.id }, search: { prompt: undefined } })}>{r.status === "changes" ? "Edit & resubmit" : "Continue editing"}</Button>}
              {isOwner && r.status === "pending" && <Button size="sm" variant="outline" className="border-destructive/25 text-destructive hover:border-destructive/40 hover:bg-danger-soft hover:text-destructive" onClick={() => setWithdrawOpen(true)}>Withdraw</Button>}
              {me.role === "admin" && ["approved", "order_deleted", "part_ordered"].includes(r.status) && <Button size="sm" variant="outline" onClick={() => advance("ordered", r.status === "part_ordered" ? "Remaining items ordered" : "Purchase order created")}>{r.status === "order_deleted" ? "Re-create order" : r.status === "part_ordered" ? "Order remaining" : "Create order"}</Button>}
              {me.role === "admin" && r.status === "approved" && <Button size="sm" variant="outline" onClick={() => advance("part_ordered", "Purchase order created for some items")}>Partially order</Button>}
              {me.role === "admin" && ["ordered", "part_ordered"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("Delete this purchase order? The request stays approved and can be re-ordered.")) advance("order_deleted", "Purchase order deleted"); }}>Delete order</Button>}
              {me.role === "admin" && r.status === "ordered" && <><Button size="sm" variant="outline" onClick={() => advance("partial", "Partially received")}>Partially received</Button><Button size="sm" variant="outline" onClick={() => advance("received", "All items received")}>Mark received</Button></>}
              {me.role === "admin" && r.status === "partial" && <Button size="sm" variant="outline" onClick={() => advance("received", "All items received")}>Mark received</Button>}
              <AuditTrailButton r={r} />
              {(r.status === "pending" || (POST_APPROVAL as readonly string[]).includes(r.status)) && <RequestActionsButton r={r} />}
            </div>
          </div>
        </div>
        {r.decisionReason && ["changes", "rejected"].includes(r.status) && <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm">{r.status === "rejected" ? "Rejected" : "Changes requested"}: “{r.decisionReason}”</p>}
      </header>

      <div className={cn("grid gap-4 p-4 md:p-8 lg:min-h-0 lg:flex-1 lg:gap-0 lg:p-0", "lg:grid-cols-[1fr_320px]")}>
        <div className="pd-scroll min-w-0 space-y-3 lg:overflow-y-auto lg:overscroll-contain lg:py-4 lg:pl-6 lg:pr-2">
          <section className="pd-panel px-4 py-3" aria-label="Request details">
            {(() => {
              type Fact = [typeof Building2, string, string | undefined, string?];
              const opts: Fact[] = ([[r.urgent, "Urgent", "text-destructive"], [r.delayed, "Delayed release", ""], [r.blanket, "Blanket order", ""]] as const).filter(([on]) => on).map(([, t, c]) => [Zap, "Option", t, c]);
              const facts: Fact[] = [[Building2, "Business unit", r.businessUnit], [Users, "Department", dept?.name], [FolderKanban, "Project", r.project], [FileText, "Type", r.requestType], [User, "Requester", requester?.name], [CalendarDays, "Needed by", r.requiredBy ? smartDate(r.requiredBy) : ""], [MapPin, "Ship to", r.shipTo], [Truck, "Shipment", r.shipmentType], [CreditCard, "Payment", r.paymentMethod], [Hash, "Quote", r.quoteNo], ...opts];
              const shown = facts.filter(([, , v]) => v);
              return (
                <>
                  <ul className="flex flex-wrap items-center gap-1.5">
                    {shown.map(([Icon, k, v, c]) => (
                      <li key={k + v} title={`${k}: ${v}`} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[13px] leading-snug">
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${c || "text-muted-foreground"}`} aria-hidden />
                        <span className="shrink-0 text-[11px] text-muted-foreground">{k}</span>
                        <span className={`min-w-0 break-words [overflow-wrap:anywhere] ${c || ""}`}>{v}</span>
                      </li>
                    ))}
                  </ul>
                  {(r.noteBuyer || r.noteSupplier) && (
                    <p className="mt-2.5 flex gap-2 border-t border-border/60 pt-2.5 text-[13px] text-muted-foreground">
                      <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 text-foreground/80">{r.noteBuyer}{r.noteSupplier && <>{r.noteBuyer && " · "}<span className="text-muted-foreground">To supplier:</span> {r.noteSupplier}</>}</span>
                    </p>
                  )}
                </>
              );
            })()}
          </section>
          <section id="line-items-panel" className="pd-panel scroll-mt-4 px-4 pb-4 pt-3">
            {picking && keep.length > 0 && (
              <div className="-mx-4 -mt-3 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-[inherit] border-b border-border bg-primary/[0.04] px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium"><span className="num">{keep.length} of {openItems.length}</span> selected · <span className="num">{money(keptTotal)}</span></p>
                  <p className="text-xs text-muted-foreground">{keep.length < openItems.length ? `The other ${openItems.length - keep.length} stay pending · request becomes Partially approved` : "All pending items selected"}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setKeep([]); setReason(""); }}>Clear</Button>
                  <Button size="sm" onClick={keep.length === openItems.length ? quickApprove : approvePicked}>{keep.length === openItems.length ? "Approve all items" : `Approve ${keep.length} selected`}</Button>
                </div>
              </div>
            )}
            <LineItems r={r} editable={false} canSplit={mine && !picking} pick={picking ? { selected: keep, toggle: (id) => setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id])) } : undefined} heading={<span className="flex items-center gap-2">Line items<span className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-subtle px-1.5 text-[11px] font-medium normal-case tracking-normal text-foreground/70">{r.items.length}</span></span>} /></section>
        </div>
        <aside className="pd-scroll space-y-3 lg:overflow-y-auto lg:overscroll-contain lg:py-4 lg:pl-2 lg:pr-6">
          <div>
            <SummaryRail r={r} hideChecks extra={<Section title="Attachments"><Attachments r={r} editable={isOwner && ["draft", "changes"].includes(r.status)} /></Section>} after={<Section title="Comments"><Comments r={r} /></Section>} />
          </div>
        </aside>
      </div>

      {mine && (
        <div className="fixed inset-x-0 bottom-14 z-20 flex gap-2 border-t border-border bg-surface p-3 md:hidden">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setAction("changes")}>Changes</Button>
          <Button variant="destructive-soft" size="sm" className="flex-1" onClick={() => setAction("reject")}>Reject</Button>
          {keep.length === 0 && approveMenu(true)}
        </div>
      )}

      {isOwner && r.status === "pending" && !mine && (
        <div className="fixed inset-x-0 bottom-14 z-20 border-t border-border bg-surface p-3 md:hidden">
          <Button variant="outline" className="w-full border-destructive/25 text-destructive hover:bg-danger-soft hover:text-destructive" onClick={() => setWithdrawOpen(true)}>Withdraw</Button>
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
          <DialogHeader><DialogTitle>{{ approve: "Approve request", partial: "Approve selected items", reject: "Reject request", changes: "Request changes", delegate: "Reassign approval" }[action ?? "approve"]}</DialogTitle></DialogHeader>
          {action === "approve" && (
            <div className="space-y-3 text-sm">
              <p>You're approving <span className="font-medium">{money(totals(r).total)}</span> despite these open checks:</p>
              <ChecksBlock r={{ ...r }} />
              <textarea className="pd-input py-2" placeholder="Optional comment" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {action === "partial" && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Unselected lines will be declined and removed from the total. The request then continues to the next approver.</p>
              <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {liveItems.map((l) => {
                  const on = keep.includes(l.id);
                  return (
                    <li key={l.id}>
                      <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-subtle/60", !on && "bg-subtle/40")}>
                        <input type="checkbox" checked={on} onChange={() => setKeep((k) => (on ? k.filter((x) => x !== l.id) : [...k, l.id]))} />
                        <span className={cn("min-w-0 flex-1", !on && "text-muted-foreground line-through")}>
                          <span className="block truncate font-medium">{l.description || "Untitled item"}</span>
                          <span className="num block text-xs text-muted-foreground">{l.qty} × {money(l.unitPrice)}</span>
                        </span>
                        <span className={cn("num shrink-0 font-medium", !on && "text-muted-foreground line-through")}>{money(lineTotal(l))}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-baseline justify-between rounded-md bg-subtle/60 px-3 py-2">
                <span className="text-muted-foreground">Approving {keep.length} of {liveItems.length}</span>
                <span className="num"><span className="font-semibold">{money(keptTotal)}</span>{keep.length < liveItems.length && <span className="ml-1.5 text-xs text-muted-foreground line-through">{money(totals(r).total)}</span>}</span>
              </div>
              <textarea className="pd-input py-2" placeholder={keep.length < liveItems.length ? "Why are the other lines declined? (optional)" : "Optional comment"} value={reason} onChange={(e) => setReason(e.target.value)} />
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
              variant={action === "reject" ? "destructive-soft" : "default"}
              disabled={(action === "partial" && (keep.length === 0 || keep.length === liveItems.length)) || (action === "changes" && !reason.trim()) || (action === "reject" && (!preset || (preset === "Other" && !reason.trim()))) || (action === "delegate" && !delegateTo)}
              onClick={confirm}
            >
              {action === "partial" ? (keep.length === 0 ? "Select at least one" : keep.length === liveItems.length ? "Deselect lines to decline" : `Approve ${keep.length} item${keep.length > 1 ? "s" : ""}`) : { approve: "Approve", partial: "", reject: "Reject request", changes: "Send back to requester", delegate: "Reassign" }[action ?? "approve"]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Clamps long titles to two lines; a "Show more" toggle appears only when the title actually overflows. */
function RequestTitle({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => { if (!open) setOver(el.scrollHeight - el.clientHeight > 1); };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  useEffect(() => setOpen(false), [text]);
  const toggle = over || open;
  return (
    <h1
      ref={ref}
      id="req-title"
      title={toggle ? (open ? "Collapse title" : "Expand title") : undefined}
      aria-label={toggle ? text : undefined}
      role={toggle ? "button" : undefined}
      tabIndex={toggle ? 0 : undefined}
      aria-expanded={toggle ? open : undefined}
      onClick={toggle ? () => setOpen((o) => !o) : undefined}
      onKeyDown={toggle ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } } : undefined}
      className={`group relative break-words text-xl font-semibold leading-snug tracking-tight ${open ? "" : "line-clamp-2"} ${toggle ? "cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""}`}
    >
      {text}
      {/* Quiet chevron affordance (muted, not link-blue): fades the clipped end when collapsed */}
      {toggle && (
        <span aria-hidden className={open ? "ml-1.5 inline-flex align-middle" : "absolute bottom-0 right-0 flex h-[1.375em] items-center bg-surface pl-1.5"}>
          <span className="grid size-5 place-items-center rounded-full bg-subtle text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-foreground">
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </span>
      )}
    </h1>
  );
}
