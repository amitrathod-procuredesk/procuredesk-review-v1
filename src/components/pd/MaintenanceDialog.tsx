import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox, Select, TextArea, TextInput } from "@/components/pd/form";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AssetThumb, Field } from "@/components/pd/assetUi";
import { cn } from "@/lib/utils";
import { cancelMaintenance, holderName, logMaintenance, MAINT_TYPE_LABEL, progressMaintenance, scheduleMaintenance, today, type Asset, type MaintenancePlan } from "@/lib/pd/assetRegister";
import { mutate, useDB, useMe } from "@/lib/pd/store";

/** Shared maintenance dialogs used by the maintenance list and the maintenance detail page. */
export type MaintAction = "schedule" | "progress" | "complete" | "cancel" | "assign" | "vendor";
export const stageNames = { in_progress: "In progress", waiting_parts: "Waiting for parts", at_vendor: "At vendor" };
export const dueDate = (a: Asset) => a.nextMaintenance || a.plan?.due;
export const retired = (a: Asset) => ["draft", "disposed", "decommissioned"].includes(a.statusId);

export function ServiceDialog({ action, initialId, onClose, onCancel }: { action: MaintAction; initialId?: string; onClose: () => void; onCancel: () => void }) {
  const db = useDB(); const me = useMe();
  const [id, setId] = useState(initialId ?? "");
  const asset = db.assetItems?.find((a) => a.id === id);
  const [plan, setPlan] = useState<MaintenancePlan>(() => asset?.plan ? { ...asset.plan, due: dueDate(asset) || today() } : { name: "", type: "preventive", instructions: "", due: asset ? dueDate(asset) || today() : today(), cost: 0, repeats: !!asset?.maintenanceEveryMonths });
  const [months, setMonths] = useState(asset?.maintenanceEveryMonths ?? 12);
  const [stage, setStage] = useState<"in_progress" | "waiting_parts" | "at_vendor">(asset?.service?.stage ?? "in_progress");
  const [note, setNote] = useState(""); const [cost, setCost] = useState("0"); const [date, setDate] = useState(today()); const [error, setError] = useState("");
  const title = action === "assign" ? "Assign maintenance" : action === "vendor" ? "Send to vendor" : action === "schedule" ? initialId ? "Edit maintenance schedule" : "Schedule maintenance" : action === "complete" ? "Complete maintenance" : action === "cancel" ? "Cancel maintenance" : asset?.service ? "Update service" : "Start service";
  const up = (p: Partial<MaintenancePlan>) => setPlan((v) => ({ ...v, ...p }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!id) return setError("Choose an asset.");
    try {
      mutate((d) => {
        if (action === "schedule") scheduleMaintenance(d, id, plan, plan.repeats ? months : undefined, me?.id);
        if (action === "assign") scheduleMaintenance(d, id, plan, plan.repeats ? months : undefined, me?.id);
        if (action === "vendor") { if (!plan.vendorId) throw new Error("Choose a vendor."); scheduleMaintenance(d, id, plan, plan.repeats ? months : undefined, me?.id); progressMaintenance(d, id, "at_vendor", note, me?.id); }
        if (action === "progress") progressMaintenance(d, id, stage, note, me?.id);
        if (action === "complete") logMaintenance(d, id, note, cost.trim() ? Number(cost) : NaN, me?.id, date);
        if (action === "cancel") cancelMaintenance(d, id, note, me?.id);
      });
      toast.success(action === "assign" ? "Maintenance assigned" : action === "vendor" ? "Sent to vendor" : action === "complete" ? "Maintenance completed" : action === "cancel" ? "Maintenance cancelled" : action === "schedule" ? "Maintenance scheduled" : "Service updated"); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save maintenance."); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto bg-surface"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{asset ? `${asset.name} · ${asset.tag}` : "Choose an asset and its service details."}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      {action === "assign" ? <Field label="Assigned to" htmlFor="mt-as"><Select id="mt-as" value={plan.assigneeId || ""} onChange={(e) => up({ assigneeId: e.target.value || undefined })}><option value="">Unassigned</option>{db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      : action === "vendor" ? <>
        <Field label="Vendor" htmlFor="mt-v" required><Select id="mt-v" value={plan.vendorId || ""} onChange={(e) => up({ vendorId: e.target.value || undefined })}><option value="">Choose a vendor…</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        <Field label="Handover note" htmlFor="mt-vn" required><TextArea id="mt-vn" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </> : action === "schedule" ? <>
        {!initialId && <Field label="Asset" htmlFor="mt-asset" required><AssetPicker value={id} onChange={(v) => { setId(v); const a = db.assetItems?.find((x) => x.id === v); setPlan(a?.plan ? { ...a.plan, due: dueDate(a) || today() } : { name: "", type: "preventive", instructions: "", due: a ? dueDate(a) || today() : today(), cost: 0, repeats: !!a?.maintenanceEveryMonths }); setMonths(a?.maintenanceEveryMonths ?? 12); }} /></Field>}
        {asset?.plan && !initialId && <p className="text-[12px] text-warning">Saving updates this asset’s existing maintenance plan.</p>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Maintenance name" htmlFor="mt-name" required><TextInput id="mt-name" value={plan.name} onChange={(e) => up({ name: e.target.value })} /></Field><Field label="Maintenance type" htmlFor="mt-type"><Select id="mt-type" value={plan.type} onChange={(e) => up({ type: e.target.value as MaintenancePlan["type"] })}>{Object.entries(MAINT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field></div>
        <Field label="Description / instructions" htmlFor="mt-instructions"><TextArea id="mt-instructions" rows={2} value={plan.instructions} onChange={(e) => up({ instructions: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Due date" htmlFor="mt-due" required><TextInput id="mt-due" type="date" value={plan.due || ""} onChange={(e) => up({ due: e.target.value })} /></Field><Field label="Assigned to" htmlFor="mt-assignee"><Select id="mt-assignee" value={plan.assigneeId || ""} onChange={(e) => up({ assigneeId: e.target.value || undefined })}><option value="">Unassigned</option>{db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field><Field label="Vendor" htmlFor="mt-vendor"><Select id="mt-vendor" value={plan.vendorId || ""} onChange={(e) => up({ vendorId: e.target.value || undefined })}><option value="">No vendor</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field><Field label="Estimated cost ($)" htmlFor="mt-cost"><TextInput id="mt-cost" type="number" min={0} step="0.01" value={plan.cost} onChange={(e) => up({ cost: Number(e.target.value) })} /></Field></div>
        <Checkbox label="This service repeats on a schedule" checked={plan.repeats} onChange={(e) => up({ repeats: e.target.checked })} />
        {plan.repeats && <Field label="Repeat every (months)" htmlFor="mt-months" hint="The next date is calculated from when the service is completed."><TextInput id="mt-months" type="number" min={1} max={120} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></Field>}
        {asset?.checkout && <p className="text-[12px] text-warning">Currently with {holderName(asset.checkout.to, db)}. You can schedule now; check it in before starting service.</p>}
      </> : action === "progress" ? <>
        {asset?.plan?.instructions && <p className="rounded-md bg-subtle p-3 text-[13px]">{asset.plan.instructions}</p>}
        <Field label="Service stage" htmlFor="mt-stage"><Select id="mt-stage" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>{Object.entries(stageNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label={stage === "in_progress" ? "Note (optional)" : "Delay / handover note"} htmlFor="mt-note" required={stage !== "in_progress"}><TextArea id="mt-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="text-[12px] text-muted-foreground">Service progress does not change the asset’s assignment or lifecycle status.</p>
      </> : action === "complete" ? <>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Completed on" htmlFor="mt-date" required><TextInput id="mt-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Actual cost ($)" htmlFor="mt-actual" required><TextInput id="mt-actual" type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field></div>
        <Field label="Work completed / findings" htmlFor="mt-work" required><TextArea id="mt-work" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="text-[12px] text-muted-foreground">{asset?.maintenanceEveryMonths ? `Next service will be due ${asset.maintenanceEveryMonths} months after completion.` : "This is a one-time service. Completion clears the due date."}</p>
        <p className="text-[12px] text-muted-foreground">If further repair is needed, open a repair from the asset record.</p>
      </> : <Field label="Cancellation reason" htmlFor="mt-cancel" required hint="Removes this schedule and any recurring service. Completed history is kept."><TextArea id="mt-cancel" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
      {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        {initialId && (action === "schedule" || action === "progress") && <Button type="button" variant="ghost" size="sm" className="mr-auto text-destructive" onClick={onCancel}>Cancel schedule</Button>}
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Close</Button><Button type="submit" size="sm" variant={action === "cancel" ? "destructive" : "default"}>{action === "assign" ? "Save" : action === "vendor" ? "Send to vendor" : action === "schedule" ? "Save schedule" : action === "complete" ? "Complete maintenance" : action === "cancel" ? "Cancel schedule" : "Save service"}</Button>
      </div>
    </form>
  </DialogContent></Dialog>;
}
/** Searchable asset chooser: type a name, ID, serial or site and pick from suggestions. */
function AssetPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const db = useDB();
  const [open, setOpen] = useState(false);
  const list = (db.assetItems ?? []).filter((a) => !retired(a) && !a.service);
  const cur = list.find((a) => a.id === value);
  const cat = (id: string) => db.assets?.categories.find((c) => c.id === id)?.name;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button id="mt-asset" type="button" role="combobox" aria-expanded={open} className="pd-input flex items-center gap-2 text-left">
        {cur ? <><span className="min-w-0 flex-1 truncate">{cur.name}</span><span className="num text-[11px] text-muted-foreground">{cur.tag}</span></> : <span className="flex-1 text-muted-foreground">Search by name, asset ID or serial…</span>}
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
      <Command filter={(v, q) => (v.toLowerCase().includes(q.toLowerCase()) ? 1 : 0)}>
        <CommandInput placeholder="Type to search assets…" />
        <CommandList className="max-h-64">
          <CommandEmpty>No matching assets.</CommandEmpty>
          <CommandGroup>
            {list.map((a) => <CommandItem key={a.id} value={`${a.name} ${a.tag} ${a.identifier} ${a.site} ${cat(a.categoryId) ?? ""}`} onSelect={() => { onChange(a.id); setOpen(false); }} className="gap-2.5">
              <AssetThumb a={a} />
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{a.name}</p><p className="truncate text-[11px] text-muted-foreground"><span className="num">{a.tag}</span>{cat(a.categoryId) ? ` · ${cat(a.categoryId)}` : ""}{a.site ? ` · ${a.site}` : ""}</p></div>
              {dueDate(a) && <span className="rounded bg-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">Scheduled</span>}
              <Check className={cn("size-3.5", a.id === value ? "opacity-100" : "opacity-0")} />
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
