import { useNavigate } from "@tanstack/react-router";
import { CircleCheck, CircleX, Copy, History, MoreHorizontal, Printer, Send, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox, TextArea, TextInput } from "@/components/pd/form";
import { ActivityLog } from "@/components/pd/RequestPanels";
import { supplierBreakdown } from "@/lib/pd/engine";
import { copyRequest, log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import type { PRequest } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

/** Statuses after approval where the post-approval action menu applies. */
export const POST_APPROVAL = ["approved", "ordered", "partial", "received", "closed"] as const;

/* ---------------- Audit trail ---------------- */

export function AuditTrailButton({ r, compact }: { r: PRequest; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label="Audit trail" title="Audit trail" className="gap-1.5">
        <History className="size-4" />
        {!compact && <span className="hidden sm:inline">Audit trail</span>}
        <span className="num rounded-full bg-subtle px-1.5 text-[11px] text-muted-foreground">{r.activity.length}</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 bg-surface p-0 sm:max-w-[420px]">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle className="text-base">Audit trail</SheetTitle>
            <SheetDescription className="text-xs">{r.id} · {r.activity.length} events, newest first</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {r.activity.length ? <ActivityLog r={r} /> : <p className="text-sm text-muted-foreground">No activity yet.</p>}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ---------------- Post-approval actions ---------------- */

type Confirm = null | "cancel" | "close" | "rfq" | "tags";

export function RequestActionsButton({ r }: { r: PRequest }) {
  const db = useDB();
  const me = useMe()!;
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Confirm>(null);
  const [reason, setReason] = useState("");
  const [vendors, setVendors] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  const isOwner = r.requesterId === me.id;
  const isOps = me.role === "admin" || me.role === "procurement" || me.role === "finance";
  const closed = r.status === "closed";
  const canCancel = r.status === "approved" && (isOwner || isOps);
  const canClose = !closed && (isOwner || isOps);
  const canRfq = r.status === "approved" && (isOps || isOwner);
  const suppliers = useMemo(() => supplierBreakdown(r, db), [r, db]);
  const tags = r.tags ?? [];

  const items = [
    { key: "copy", label: "Copy request", hint: "Start a new draft with the same items", icon: Copy, show: true },
    { key: "print", label: "Print", hint: "Print or save as PDF", icon: Printer, show: true },
    { key: "rfq", label: "Create RFQ", hint: r.rfqs?.length ? `${r.rfqs.length} sent` : "Request quotes from suppliers", icon: Send, show: canRfq },
    { key: "tags", label: "Manage tags", hint: tags.length ? tags.join(", ") : "Organise and find requests faster", icon: Tag, show: true },
    { key: "close", label: "Mark as closed", hint: "Fulfilled — no further action", icon: CircleCheck, show: canClose },
    { key: "cancel", label: "Cancel request", hint: "Release the approved budget", icon: CircleX, show: canCancel, danger: true },
  ].filter((i) => i.show);

  const run = (key: string) => {
    setOpen(false);
    if (key === "copy") {
      const id = copyRequest(r.id, me.id);
      toast.success(`Copied to ${id}`, { description: "Opening the new draft…" });
      nav({ to: "/app/requests/$id/edit", params: { id }, search: { prompt: undefined } });
    } else if (key === "print") {
      setTimeout(() => window.print(), 250);
    } else {
      if (key === "rfq") setVendors(suppliers.map((s) => s.vendorId));
      setReason("");
      setTagDraft("");
      setDialog(key as Confirm);
    }
  };

  const confirm = () => {
    if (dialog === "cancel") {
      updateRequest(r.id, (x) => { x.status = "cancelled"; log(x, `Request cancelled after approval${reason.trim() ? ` — ${reason.trim()}` : ""}`, "system", me.id); });
      toast("Request cancelled", { description: "Approved budget has been released." });
    } else if (dialog === "close") {
      updateRequest(r.id, (x) => { x.status = "closed"; log(x, `Request closed${reason.trim() ? ` — ${reason.trim()}` : ""}`, "system", me.id); });
      toast.success("Request closed");
    } else if (dialog === "rfq") {
      const names = suppliers.filter((s) => vendors.includes(s.vendorId)).map((s) => s.name);
      updateRequest(r.id, (x) => {
        x.rfqs = [...(x.rfqs ?? []), { id: `RFQ-${Date.now().toString().slice(-6)}`, at: new Date().toISOString(), vendorIds: vendors }];
        log(x, `RFQ sent to ${names.join(", ")}`, "system", me.id);
      });
      toast.success("RFQ created", { description: `Sent to ${names.length} supplier${names.length > 1 ? "s" : ""} (demo).` });
    }
    setDialog(null);
  };

  const addTag = () => {
    const t = tagDraft.trim().replace(/,$/, "");
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) { setTagDraft(""); return; }
    updateRequest(r.id, (x) => { x.tags = [...(x.tags ?? []), t]; log(x, `Tag added: ${t}`, "edit", me.id); });
    setTagDraft("");
  };
  const removeTag = (t: string) => updateRequest(r.id, (x) => { x.tags = (x.tags ?? []).filter((y) => y !== t); log(x, `Tag removed: ${t}`, "edit", me.id); });
  const suggestions = ["Hardware", "Onboarding", "Recurring", "Q4", "Capex"].filter((s) => !tags.includes(s));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5"><MoreHorizontal className="size-4" /> Actions</Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full bg-surface p-0 sm:max-w-[360px] [&>button]:hidden">
          <SheetHeader className="flex-row items-center justify-between space-y-0 px-5 pb-2 pt-5 text-left">
            <SheetTitle className="text-base">Actions</SheetTitle>
            <button onClick={() => setOpen(false)} aria-label="Close" className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"><X className="size-4" /></button>
          </SheetHeader>
          <SheetDescription className="sr-only">Actions for {r.id}</SheetDescription>
          <ul className="space-y-0.5 px-3 pb-5 pt-1">
            {items.map((i, idx) => (
              <li key={i.key} className="animate-in fade-in slide-in-from-right-2 fill-mode-both" style={{ animationDelay: `${idx * 30}ms` }}>
                <button
                  onClick={() => run(i.key)}
                  className={cn("group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none", i.danger && "text-destructive")}
                >
                  <i.icon className={cn("size-[18px] shrink-0 text-muted-foreground transition-colors group-hover:text-foreground", i.danger && "text-destructive group-hover:text-destructive")} strokeWidth={1.6} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{i.label}</span>
                    <span className={cn("block truncate text-xs text-muted-foreground", i.danger && "text-destructive/70")}>{i.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog === "cancel" && <>
            <DialogHeader><DialogTitle>Cancel this approved request?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">The approval stays in the audit trail, the committed budget is released and no order will be placed. This can't be undone.</p>
            <TextArea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Keep request</Button><Button variant="destructive" onClick={confirm}>Cancel request</Button></DialogFooter>
          </>}
          {dialog === "close" && <>
            <DialogHeader><DialogTitle>Mark as closed?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Closing means no further ordering or receiving is expected. You can still copy, print and tag it.</p>
            <TextArea placeholder="Closing note (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Not now</Button><Button onClick={confirm}>Mark as closed</Button></DialogFooter>
          </>}
          {dialog === "rfq" && <>
            <DialogHeader><DialogTitle>Create RFQ</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Ask suppliers to quote on this request's {r.items.length} line item{r.items.length === 1 ? "" : "s"}.</p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {suppliers.map((s) => (
                <li key={s.vendorId} className="px-3 py-2.5">
                  <Checkbox
                    checked={vendors.includes(s.vendorId)}
                    onChange={(e) => setVendors((v) => (e.target.checked ? [...v, s.vendorId] : v.filter((x) => x !== s.vendorId)))}
                    label={<span className="text-sm">{s.name} <span className="text-xs text-muted-foreground">· {s.lines} line{s.lines === 1 ? "" : "s"}</span></span>}
                  />
                </li>
              ))}
            </ul>
            <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={!vendors.length} onClick={confirm}>Send RFQ</Button></DialogFooter>
          </>}
          {dialog === "tags" && <>
            <DialogHeader><DialogTitle>Manage tags</DialogTitle></DialogHeader>
            <div className="flex min-h-8 flex-wrap gap-1.5">
              {tags.length ? tags.map((t) => (
                <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-subtle pl-2.5 pr-1 text-xs font-medium animate-in fade-in zoom-in-95">
                  {t}
                  <button onClick={() => removeTag(t)} aria-label={`Remove ${t}`} className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"><X className="size-3" /></button>
                </span>
              )) : <span className="text-sm text-muted-foreground">No tags yet.</span>}
            </div>
            <TextInput
              placeholder="Type a tag and press Enter"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
            />
            {suggestions.length > 0 && <div className="flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} className="pd-chip" onClick={() => updateRequest(r.id, (x) => { x.tags = [...(x.tags ?? []), s]; log(x, `Tag added: ${s}`, "edit", me.id); })}>+ {s}</button>)}</div>}
            <DialogFooter><Button onClick={() => setDialog(null)}>Done</Button></DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}
