import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, CircleCheck, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, TextArea, TextInput } from "@/components/pd/form";
import { Empty, Field, Money, Section, SourceMark, StatusBadge } from "@/components/pd/bits";
import { Copilot } from "@/components/pd/Copilot";
import { EssentialsBar } from "@/components/pd/EssentialsBar";
import { LineItems } from "@/components/pd/LineItems";
import { Attachments, ChecksBlock, Comments, RouteTimeline, SummaryRail } from "@/components/pd/RequestPanels";
import { budgetStatus, canSubmit, computeRoute, money, runChecks, smartDate, smartTime, supplierBreakdown, totals, type Check as CheckT } from "@/lib/pd/engine";
import { log, submitRequest, updateRequest, useDB, useMe } from "@/lib/pd/store";
import { PAYMENT_METHODS, REQUEST_TYPES, SHIPMENT_TYPES, type PRequest } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/requests/$id/edit")({
  validateSearch: (s: Record<string, unknown>): { prompt?: string } => (typeof s.prompt === "string" ? { prompt: s.prompt } : {}),
  head: ({ params }) => ({
    meta: [
      { title: `Edit ${params.id} · ProcureDesk` },
      { name: "description", content: "Build a purchase request with the procurement copilot." },
      { property: "og:title", content: `Edit ${params.id} · ProcureDesk` },
      { property: "og:description", content: "AI-assisted purchase request builder with live budget and policy checks." },
    ],
  }),
  component: EditRequest,
});

function EditRequest() {
  const { id } = Route.useParams();
  const { prompt } = Route.useSearch();
  const db = useDB();
  const me = useMe()!;
  const r = db.requests.find((x) => x.id === id);
  const [submitted, setSubmitted] = useState(false);
  const [tried, setTried] = useState(false);

  if (!r) return <div className="p-8"><Empty title="Request not found" body={`${id} doesn't exist or was removed.`} action={<Link to="/app/requests" className="pd-chip">Back to requests</Link>} /></div>;
  if (r.requesterId !== me.id && me.role !== "admin")
    return <div className="p-8"><Empty title="You don't have access to edit this request" body="Only the requester or an admin can edit a draft." action={<Link to="/app/requests/$id" params={{ id }} className="pd-chip">View request</Link>} /></div>;
  if (submitted) return <SubmittedState r={r} />;
  if (!["draft", "changes"].includes(r.status))
    return <div className="p-8"><Empty title="This request is read-only" body={`It's ${r.status === "pending" ? "in approval" : r.status}. Editing is available only for drafts or when changes are requested.`} action={<Link to="/app/requests/$id" params={{ id }} className="pd-chip"><Lock className="size-3" /> View request</Link>} /></div>;

  const set = (patch: Partial<PRequest>, key?: string, label?: string) =>
    updateRequest(r.id, (x) => {
      Object.assign(x, patch);
      if (key) x.sources[key] = "confirmed";
      if (label) log(x, label, "edit", me.id);
    });

  const trySubmit = () => {
    const checks = runChecks(r, db);
    if (canSubmit(checks)) { submitRequest(r.id, me.id); setSubmitted(true); return; }
    setTried(true);
    const msg = checks.find((c) => c.level === "error");
    toast.error("Fill in the highlighted fields", { description: msg?.detail ?? msg?.title });
    setTimeout(() => document.querySelector<HTMLElement>('.pd-validate [aria-invalid="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const onCheck = (c: CheckT) => {
    const target = { attach: "attachments", exception: "rail-budget", budget: "rail-budget", edit: "line-items", duplicate: "dup" }[c.action!];
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className={cn("flex min-h-[calc(100vh)] flex-col", tried && "pd-validate")}>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:px-6">
        <Link to="/app/requests" aria-label="Back" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input aria-label="Request title" aria-invalid={!r.title.trim() || undefined} className="pd-input-bare -ml-1.5 max-w-lg text-base font-semibold" placeholder="Untitled request" value={r.title} onChange={(e) => set({ title: e.target.value }, "title")} />
            <SourceMark s={r.sources.title} />
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="num">{r.id}</span> <StatusBadge status={r.status} /> <span className="flex items-center gap-1"><Check className="size-3" /> Saved {smartTime(r.updatedAt)}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Copilot r={r} initialPrompt={prompt} />
          <Button size="sm" variant="outline" onClick={() => toast.success("Draft saved", { description: "You can leave and come back anytime." })}>Save draft</Button>
          <Button size="sm" onClick={trySubmit}>Submit</Button>
        </div>
      </header>

      <div className="grid flex-1 gap-0 lg:grid-cols-[1fr_320px]">

        <div className="min-w-0 space-y-4 p-4 pb-64 md:p-6 md:pb-64">
          {r.status === "changes" && r.decisionReason && (
            <div className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
              <p className="font-medium">Changes requested</p>
              <p className="text-foreground/80">“{r.decisionReason}”</p>
              <p className="mt-1 text-xs text-muted-foreground">Update the request and resubmit — the approval route will restart.</p>
            </div>
          )}

          <Section title="Essentials">
            <EssentialsBar r={r} set={set} />
          </Section>

          <Section title="What you're buying">
            <LineItems r={r} editable />
          </Section>

          <MoreDetails r={r} set={set} />

        </div>

        <aside id="rail-budget" className="border-t border-border bg-subtle/50 p-4 lg:border-t-0 lg:border-l">
          <div className="lg:sticky lg:top-[73px]"><SummaryRail r={r} editable hideChecks onCheckAction={onCheck} extra={<><div id="attachments"><Section title="Attachments"><Attachments r={r} editable /></Section></div><Section title="Comments"><Comments r={r} /></Section></>} /></div>
        </aside>
      </div>

    </div>
  );
}

function MoreDetails({ r, set }: { r: PRequest; set: (p: Partial<PRequest>, key?: string, label?: string) => void }) {
  const db = useDB();
  const [open, setOpen] = useState(false);
  return (
    <section className="pd-panel">
      <button className="flex h-12 w-full items-center justify-between px-5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="pd-section-title">More details</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {!open && "Notes, attention, quote # and website"}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Note to buyer"><TextArea placeholder="Anything procurement should know" value={r.noteBuyer} onChange={(e) => set({ noteBuyer: e.target.value })} /></Field>
            <Field label="Note to supplier"><TextArea placeholder="Shown on the purchase order" value={r.noteSupplier} onChange={(e) => set({ noteSupplier: e.target.value })} /></Field>
            <Field label="Attention"><Select value={r.attentionId ?? ""} onChange={(e) => set({ attentionId: e.target.value || undefined })}><option value="">No one</option>{db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            <Field label="Supplier quote #"><TextInput className="num" placeholder="e.g. Q-10234" value={r.quoteNo} onChange={(e) => set({ quoteNo: e.target.value })} /></Field>
            <Field label="Website reference" className="sm:col-span-2"><TextInput type="url" placeholder="https://" value={r.website} onChange={(e) => set({ website: e.target.value })} /></Field>
          </div>
        </div>
      )}
    </section>
  );
}

function SubmittedState({ r }: { r: PRequest }) {
  const db = useDB();
  const nav = useNavigate();
  const first = r.route[0];
  const names = first?.approvals.map((a) => db.users.find((u) => u.id === a.userId)?.name).join(", ");
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <CircleCheck className="mx-auto size-10 text-success" />
      <h1 className="mt-4 text-xl font-semibold">Request submitted</h1>
      <p className="num mt-1 text-sm text-muted-foreground">{r.id} · {money(totals(r).total)}</p>
      <p className="mt-6 text-sm">Your request has been sent to <span className="font-medium">{names}</span>.</p>
      <p className="text-sm text-muted-foreground">Next: {first?.name}{r.route.length > 1 ? `, then ${r.route.slice(1).map((s) => s.name).join(", ")}` : ""}.</p>
      <div className="mt-8 flex justify-center gap-2">
        <Button onClick={() => nav({ to: "/app/requests/$id", params: { id: r.id } })}>View request</Button>
        <Button variant="outline" onClick={() => nav({ to: "/app/requests" })}>Back to requests</Button>
      </div>
    </div>
  );
}
