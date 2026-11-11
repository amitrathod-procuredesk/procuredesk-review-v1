import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, Radio } from "./form";
import { currentStageIndex } from "@/lib/pd/engine";
import { canAddApprover, canRemoveApprover } from "@/lib/pd/adHocApprovals";
import { approvalRouteContext, changeAdHocApprover } from "@/lib/pd/adHocApprovals.functions";
import { signInInsights } from "@/lib/pd/insights.functions";
import { acceptWorkspaceSnapshot, useDB, useMe, waitForWorkspaceSave, workspaceVersion } from "@/lib/pd/store";
import type { PRequest, Stage } from "@/lib/pd/types";

export function AdHocApprover({ r, remove }: { r: PRequest; remove?: Stage }) {
  const db = useDB();
  const me = useMe();
  const context = useServerFn(approvalRouteContext);
  const restore = useServerFn(signInInsights);
  const change = useServerFn(changeAdHocApprover);
  const [open, setOpen] = useState(false);
  const [approverId, setApproverId] = useState("");
  const [stepId, setStepId] = useState("");
  const [placement, setPlacement] = useState<"before" | "after">("after");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  if (!me || me.role !== "approver" || !(remove ? canRemoveApprover(r, remove, me.id) : canAddApprover(r, me.id))) return null;
  const current = currentStageIndex(r);
  const steps = r.route.slice(current);
  const candidates = db.users.filter((u) => u.active && u.role === "approver" && u.id !== r.requesterId && !r.route.some((s) => s.approvals.some((a) => a.userId === u.id)));
  const name = (s: Stage) => s.approvals.map((a) => db.users.find((u) => u.id === a.userId)?.name ?? "Approver").join(", ");
  const target = r.route.find((s) => s.id === stepId);
  const selected = db.users.find((u) => u.id === approverId);
  const show = () => {
    setError(""); setApproverId(""); setStepId(r.route[current]?.id ?? "");
    setPlacement("after"); setKey(crypto.randomUUID()); setOpen(true);
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      await waitForWorkspaceSave();
      try { if ((await context()).userId !== me.id) throw new Error("Account changed"); }
      catch { await restore({ data: { email: me.email, password: me.password } }); }
      const base = { requestId: r.id, key, version: workspaceVersion() };
      const snapshot = await change({ data: remove
        ? { ...base, action: "remove", stepId: remove.id }
        : { ...base, action: "add", stepId, approverId, placement } });
      acceptWorkspaceSnapshot(snapshot);
      setOpen(false);
      toast.success(remove ? "Ad hoc approver removed" : "Ad hoc approver added");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update the approval route."); }
    finally { setBusy(false); }
  };
  return <>
    {remove ? <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:bg-danger-soft hover:text-destructive" onClick={show} aria-label={`Remove ad hoc approver ${name(remove)}`} title={`Remove ad hoc approver ${name(remove)}`}><Trash2 className="size-3.5" /></Button>
      : <Button variant="ghost" size="sm" className="mt-2 h-7 px-0 text-xs text-primary hover:bg-transparent" onClick={show}><UserPlus className="size-3.5" />Add ad hoc approver</Button>}
    <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{remove ? "Remove ad hoc approver?" : "Add ad hoc approver"}</DialogTitle></DialogHeader>
        {remove ? <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{name(remove)}</span> will be removed from this request’s approval route. Other approvals stay unchanged.</p> : <div className="space-y-4">
          <div><label htmlFor="adhoc-person" className="pd-label">Approver</label><Select id="adhoc-person" value={approverId} onChange={(e) => setApproverId(e.target.value)} disabled={busy}><option value="">Choose an approver…</option>{candidates.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.title}</option>)}</Select>{!candidates.length && <p className="mt-1 text-xs text-muted-foreground">All eligible approvers are already in this route.</p>}</div>
          <fieldset><legend className="pd-label">Position</legend><div className="flex gap-6"><Radio name="adhoc-position" checked={placement === "before"} onChange={() => setPlacement("before")} disabled={busy} label={<span className="inline-flex items-center gap-1"><ArrowUp className="size-3.5" />Before</span>} /><Radio name="adhoc-position" checked={placement === "after"} onChange={() => setPlacement("after")} disabled={busy} label={<span className="inline-flex items-center gap-1"><ArrowDown className="size-3.5" />After</span>} /></div></fieldset>
          <div><label htmlFor="adhoc-step" className="pd-label">Approval step</label><Select id="adhoc-step" value={stepId} onChange={(e) => setStepId(e.target.value)} disabled={busy}>{steps.map((s, i) => <option key={s.id} value={s.id}>Step {current + i + 1} · {name(s)}</option>)}</Select></div>
          {selected && target && <p className="border-t border-border pt-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">{selected.name}</span> will approve {placement} {name(target)}.{placement === "before" && target.id === r.route[current]?.id && " The current step will wait until this approval is complete."}</p>}
        </div>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button variant={remove ? "destructive-soft" : "default"} onClick={save} disabled={busy || (!remove && (!approverId || !stepId))}>{busy && <Loader2 className="size-3.5 animate-spin" />}{remove ? "Remove approver" : "Add approver"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}