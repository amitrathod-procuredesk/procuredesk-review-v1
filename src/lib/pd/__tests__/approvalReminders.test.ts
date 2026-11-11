import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { canRemindApprover } from "../approvalReminders";

function setup() {
  const db = seedDB();
  const r = db.requests[0];
  r.status = "pending";
  r.requesterId = "u_amit";
  r.route = [
    { id: "current", name: "Finance", reason: "", mode: "all", approvals: [{ userId: "u_mark", status: "pending" }] },
    { id: "later", name: "Security", reason: "", mode: "all", approvals: [{ userId: "u_priya", status: "waiting" }] },
  ];
  const actor = (id: string) => db.users.find((u) => u.id === id) ?? null;
  return { r, actor };
}

describe("approval reminder eligibility", () => {
  it("sequential reminders target only the awaiting approver, never upcoming steps", () => {
    const { r, actor } = setup();
    expect(canRemindApprover(r, actor("u_amit"), "u_mark")).toBe(true);
    expect(canRemindApprover(r, actor("u_amit"), "u_priya")).toBe(false);
    r.route[0].approvals[0].status = "approved";
    r.route[1].approvals[0].status = "pending";
    expect(canRemindApprover(r, actor("u_amit"), "u_mark")).toBe(false);
    expect(canRemindApprover(r, actor("u_amit"), "u_priya")).toBe(true);
  });

  it("all-required group members can remind other awaiting members of that group", () => {
    const { r, actor } = setup();
    r.route[0].approvals.push({ userId: "u_daniel", status: "pending" }, { userId: "u_rachel", status: "pending" });
    expect(canRemindApprover(r, actor("u_mark"), "u_daniel")).toBe(true);
    expect(canRemindApprover(r, actor("u_mark"), "u_rachel")).toBe(true);
    expect(canRemindApprover(r, actor("u_mark"), "u_priya")).toBe(false);
    r.route[0].approvals[0].status = "approved";
    expect(canRemindApprover(r, actor("u_mark"), "u_daniel")).toBe(true);
    expect(canRemindApprover(r, actor("u_daniel"), "u_mark")).toBe(false);
    expect(canRemindApprover(r, actor("u_priya"), "u_daniel")).toBe(false);
  });

  it("any-one groups stop receiving reminders once a member approves", () => {
    const { r, actor } = setup();
    r.route[0].mode = "any";
    r.route[0].approvals.push({ userId: "u_daniel", status: "pending" });
    expect(canRemindApprover(r, actor("u_mark"), "u_daniel")).toBe(true);
    r.route[0].approvals[0].status = "approved";
    expect(canRemindApprover(r, actor("u_amit"), "u_daniel")).toBe(false);
  });

  it("blocks self-reminders, unrelated users, signed-out users and closed requests", () => {
    const { r, actor } = setup();
    expect(canRemindApprover(r, actor("u_mark"), "u_mark")).toBe(false);
    expect(canRemindApprover(r, actor("u_rachel"), "u_mark")).toBe(false);
    expect(canRemindApprover(r, null, "u_mark")).toBe(false);
    r.status = "approved";
    expect(canRemindApprover(r, actor("u_admin"), "u_mark")).toBe(false);
  });
});