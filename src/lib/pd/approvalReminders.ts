import { currentStageIndex } from "./engine";
import type { PRequest, User } from "./types";

/** Reminder recipients must have a decision due in the current approval step. */
export function canRemindApprover(r: PRequest, actor: User | null, recipientId: string): boolean {
  if (!actor || recipientId === actor.id) return false;
  const stage = r.route[currentStageIndex(r)];
  if (!stage?.approvals.some((a) => a.userId === recipientId && a.status === "pending")) return false;
  return actor.id === r.requesterId || actor.role === "admin" ||
    stage.approvals.some((a) => a.userId === actor.id);
}