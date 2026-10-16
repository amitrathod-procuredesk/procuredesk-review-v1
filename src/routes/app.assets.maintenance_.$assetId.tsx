import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronRight, Play, Truck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AssetThumb, Card, Meta, StatusPill, fmtDate, fmtDateTime } from "@/components/pd/assetUi";
import { dueDate, ServiceDialog, stageNames, type MaintAction } from "@/components/pd/MaintenanceDialog";
import { maintenanceBlock, MAINT_TYPE_LABEL, progressMaintenance, today } from "@/lib/pd/assetRegister";
import { money } from "@/lib/pd/engine";
import { mutate, useDB, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/assets/maintenance_/$assetId")({
  head: () => ({ meta: [
    { title: "Maintenance details · ProcureDesk" },
    { name: "description", content: "Details, assignment, vendor and progress of a scheduled asset service." },
    { property: "og:title", content: "Maintenance details · ProcureDesk" },
    { property: "og:description", content: "Assign, start or send a scheduled asset service to a vendor." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: MaintenanceDetail,
});

function MaintenanceDetail() {
  const { assetId } = Route.useParams();
  const db = useDB(); const me = useMe();
  const a = db.assetItems?.find((x) => x.id === assetId);
  const [modal, setModal] = useState<MaintAction>();
  if (!a) { if (db.assetItems) throw notFound(); return null; }
  const due = dueDate(a);
  const block = maintenanceBlock(a);
  const user = (id?: string) => db.users.find((u) => u.id === id)?.name;
  const vendor = db.vendors.find((v) => v.id === a.plan?.vendorId)?.name;
  const label = a.service ? stageNames[a.service.stage] : !due ? "Not scheduled" : due < today() ? "Overdue" : due === today() ? "Due today" : "Scheduled";
  const tone = a.service ? "bg-transit-soft text-transit" : due && due < today() ? "bg-danger-soft text-destructive" : "bg-subtle text-muted-foreground";
  const start = () => { try { mutate((d) => progressMaintenance(d, a.id, "in_progress", "", me?.id)); toast.success("Work started"); } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to start work."); } };
  const history = a.history.filter((h) => h.kind === "maintenance").slice(0, 8);

  return <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-muted-foreground"><Link to="/app/assets/register" className="hover:text-foreground">Assets</Link><ChevronRight className="size-3" /><Link to="/app/assets/maintenance" className="hover:text-foreground">Maintenance</Link><ChevronRight className="size-3" /><span className="text-foreground">{a.plan?.name || "Scheduled service"}</span></nav>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h1 className="pd-h1">{a.plan?.name || "Scheduled service"}</h1><span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", tone)}>{label}</span></div>
        <p className="mt-1 text-[13px] text-muted-foreground">{a.plan ? MAINT_TYPE_LABEL[a.plan.type] : "Service"} · Due {fmtDate(due) || "—"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setModal("assign")}><UserPlus />Assign</Button>
        {a.service ? <Button size="sm" disabled={!!block} title={block} onClick={() => setModal("complete")}><Check />Complete</Button>
          : <Button size="sm" disabled={!!block || !due} title={block} onClick={start}><Play />Start work</Button>}
        {a.service?.stage !== "at_vendor" && <Button variant="outline" size="sm" disabled={!!block || !due} title={block} onClick={() => setModal("vendor")}><Truck />Send to vendor</Button>}
      </div>
    </header>
    {block && <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">{block}</p>}
    <div className="grid gap-4 md:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <Card title="Details">
          <div className="grid gap-x-6 sm:grid-cols-2">
            <Meta k="Assigned to" v={user(a.plan?.assigneeId) || "Unassigned"} />
            <Meta k="Vendor" v={vendor || "No vendor"} />
            <Meta k="Due date" v={fmtDate(due) || "—"} />
            <Meta k="Repeats" v={a.maintenanceEveryMonths ? `Every ${a.maintenanceEveryMonths} months` : "One-time"} />
            <Meta k="Estimated cost" v={<span className="num">{money(a.plan?.cost ?? 0)}</span>} />
            {a.service && <Meta k="Started" v={fmtDateTime(a.service.startedAt)} />}
          </div>
          {a.plan?.instructions && <p className="mt-3 rounded-md bg-subtle p-3 text-[13px]">{a.plan.instructions}</p>}
          {a.service?.note && <p className="mt-2 text-[12px] text-muted-foreground">Latest note: {a.service.note}</p>}
        </Card>
        <Card title="Activity">
          {history.length ? <ul className="space-y-2">{history.map((h) => <li key={h.id} className="text-[13px]"><p>{h.text}</p><p className="text-[11px] text-muted-foreground">{fmtDateTime(h.at)} · {user(h.by) || "System"}{h.note ? ` · ${h.note}` : ""}</p></li>)}</ul> : <p className="text-[13px] text-muted-foreground">No activity yet.</p>}
        </Card>
      </div>
      <Card title="Asset">
        <div className="flex items-center gap-2.5"><AssetThumb a={a} /><div className="min-w-0"><Link to="/app/assets/$assetId" params={{ assetId: a.id }} className="block truncate text-[13px] font-medium hover:text-primary">{a.name}</Link><p className="num text-[11px] text-muted-foreground">{a.tag}</p></div></div>
        <div className="mt-3"><Meta k="Status" v={<StatusPill s={db.assets?.statuses.find((s) => s.id === a.statusId)} />} /><Meta k="Site" v={a.site || "—"} /></div>
        {!!a.maintenanceLog.length && <p className="mt-2 text-[12px] text-muted-foreground">Last serviced {fmtDate(a.maintenanceLog[0].at)}</p>}
      </Card>
    </div>
    {modal && <ServiceDialog key={modal} action={modal} initialId={a.id} onClose={() => setModal(undefined)} onCancel={() => setModal("cancel")} />}
  </div>;
}
