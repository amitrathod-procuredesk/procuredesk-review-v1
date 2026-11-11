import { currentStageIndex, isPendingFor, stageComplete } from "./engine";
import type { DB, PRequest, Stage } from "./types";

export function canAddApprover(r: PRequest, actorId: string) {
  if (r.status !== "pending" || actorId === r.requesterId) return false;
  if (isPendingFor(r, actorId)) return true;
  // Inserting before one's own step must not remove the ability to finish arranging it.
  const remaining = r.route.slice(currentStageIndex(r));
  return remaining.some((s) => s.approvals.some((a) => a.userId === actorId && ["waiting", "pending"].includes(a.status))) &&
    remaining.some((s) => s.adHoc?.addedBy === actorId && !stageComplete(s));
}

export function canRemoveApprover(r: PRequest, stage: Stage, actorId: string) {
  return r.status === "pending" && actorId !== r.requesterId && !!stage.adHoc &&
    !stageComplete(stage) && stage.approvals.every((a) => !a.at && ["waiting", "pending"].includes(a.status)) &&
    (canAddApprover(r, actorId) || stage.adHoc.addedBy === actorId);
}

export type AdHocChange = { requestId: string; key: string } & (
  | { action: "add"; approverId: string; stepId: string; placement: "before" | "after" }
  | { action: "remove"; stepId: string }
);

/** Only unfinished route steps can change; approved decisions remain immutable. */
export function applyAdHocChange(db: DB, actorId: string, change: AdHocChange, at = new Date().toISOString()) {
  const actor = db.users.find((u) => u.id === actorId && u.active && u.role === "approver");
  if (!actor) throw new Error("Only an active approver can change the approval route.");
  const r = db.requests.find((x) => x.id === change.requestId);
  if (!r) throw new Error("Request not found.");
  const activityId = `adhoc-${change.key}`;
  if (r.activity.some((a) => a.id === activityId && a.actorId === actorId)) return r;
  const current = currentStageIndex(r);
  const index = r.route.findIndex((s) => s.id === change.stepId);
  const step = r.route[index];
  if (!step || current < 0 || index < current) throw new Error("This approval step can no longer be changed.");
  let text: string;
  if (change.action === "add") {
    if (!canAddApprover(r, actorId)) throw new Error("Only a current approver or an approver arranging their unfinished ad hoc steps can add an approver.");
    const user = db.users.find((u) => u.id === change.approverId && u.active && u.role === "approver");
    if (!user || user.id === r.requesterId || r.route.some((s) => s.approvals.some((a) => a.userId === user.id)))
      throw new Error("Choose an active approver who is not the requester or already in this route.");
    const inserted: Stage = {
      id: `adhoc-${change.key}`, name: "Ad hoc approval", reason: `Added by ${actor.name}`,
      mode: "all", adHoc: { addedBy: actorId, addedAt: at },
      approvals: [{ userId: user.id, status: "waiting" }],
    };
    r.route.splice(index + (change.placement === "after" ? 1 : 0), 0, inserted);
    text = `${actor.name} added ${user.name} as an ad hoc approver ${change.placement} ${step.name}`;
  } else {
    if (!canRemoveApprover(r, step, actorId)) throw new Error("This ad hoc approval cannot be removed.");
    const name = db.users.find((u) => u.id === step.approvals[0]?.userId)?.name ?? "approver";
    r.route.splice(index, 1);
    text = `${actor.name} removed ad hoc approver ${name}`;
  }
  const next = currentStageIndex(r);
  r.route.forEach((s, i) => s.approvals.forEach((a) => {
    if (a.status === "waiting" || a.status === "pending") a.status = i === next ? "pending" : "waiting";
  }));
  if (next < 0) r.status = "approved";
  r.activity.push({ id: activityId, at, actorId, kind: "system", text });
  r.updatedAt = at;
  return r;
}