import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { applyAdHocChange, canAddApprover, canRemoveApprover } from "../adHocApprovals";
import { isPendingFor } from "../engine";

function setup() {
  const db = seedDB();
  const r = db.requests[0];
  r.requesterId = "u_amit"; r.status = "pending";
  r.route = [
    { id: "done", name: "Finance", reason: "", mode: "all", approvals: [{ userId: "u_mark", status: "approved", at: "2026-11-01" }] },
    { id: "priya", name: "IT", reason: "", mode: "all", approvals: [{ userId: "u_priya", status: "pending" }] },
    { id: "rachel", name: "Operations", reason: "", mode: "all", approvals: [{ userId: "u_rachel", status: "waiting" }] },
  ];
  return { db, r };
}
const add = (requestId: string, placement: "before" | "after", stepId = "priya") => ({ requestId, action: "add" as const, key: "one", approverId: "u_daniel", stepId, placement });
describe("ad hoc approval route", () => {
  it("lets Priya add another ad hoc approver after inserting before herself", () => {
    const { db, r } = setup();
    applyAdHocChange(db, "u_priya", add(r.id, "before"));
    expect(canAddApprover(r, "u_priya")).toBe(true);
    applyAdHocChange(db, "u_priya", { ...add(r.id, "after", "adhoc-one"), key: "two", approverId: "u_jordan" });
    expect(r.route.map((s) => s.id)).toEqual(["done", "adhoc-one", "adhoc-two", "priya", "rachel"]);
    expect(isPendingFor(r, "u_daniel")).toBe(true);
    expect(r.route[2].adHoc?.addedBy).toBe("u_priya");
    expect(r.route[2].approvals[0].status).toBe("waiting");
  });
  it("lets Priya add repeatedly after her step while she remains current", () => {
    const { db, r } = setup();
    applyAdHocChange(db, "u_priya", add(r.id, "after"));
    applyAdHocChange(db, "u_priya", { ...add(r.id, "before", "adhoc-one"), key: "two", approverId: "u_jordan" });
    expect(r.route.map((s) => s.id)).toEqual(["done", "priya", "adhoc-two", "adhoc-one", "rachel"]);
    expect(isPendingFor(r, "u_priya")).toBe(true);
  });
  it("lets the current ad hoc approver insert a further approver", () => {
    const { db, r } = setup();
    applyAdHocChange(db, "u_priya", add(r.id, "before"));
    applyAdHocChange(db, "u_daniel", { ...add(r.id, "before", "adhoc-one"), key: "two", approverId: "u_jordan" });
    expect(isPendingFor(r, "u_jordan")).toBe(true);
    expect(r.route[1].adHoc?.addedBy).toBe("u_daniel");
  });
  it("does not extend add permission to unrelated waiting or completed approvers", () => {
    const { db, r } = setup();
    applyAdHocChange(db, "u_priya", add(r.id, "before"));
    expect(canAddApprover(r, "u_rachel")).toBe(false);
    r.route.find((s) => s.id === "priya")?.approvals.forEach((a) => { a.status = "approved"; a.at = "2026-11-11"; });
    expect(canAddApprover(r, "u_priya")).toBe(false);
    r.status = "approved";
    expect(canAddApprover(r, "u_daniel")).toBe(false);
  });
  it("Priya inserts before her step and waits for Daniel", () => {
    const { db, r } = setup(); applyAdHocChange(db, "u_priya", add(r.id, "before"));
    expect(r.route.map((s) => s.id)).toEqual(["done", "adhoc-one", "priya", "rachel"]);
    expect(isPendingFor(r, "u_daniel")).toBe(true); expect(isPendingFor(r, "u_priya")).toBe(false);
    expect(r.route[0].approvals[0].at).toBe("2026-11-01");
  });
  it("inserts after a particular future step without changing current approval", () => {
    const { db, r } = setup(); applyAdHocChange(db, "u_priya", add(r.id, "after", "rachel"));
    expect(r.route.map((s) => s.id)).toEqual(["done", "priya", "rachel", "adhoc-one"]);
    expect(isPendingFor(r, "u_priya")).toBe(true); expect(isPendingFor(r, "u_daniel")).toBe(false);
  });
  it("creator removes an unfinished inserted-before step and resumes original approval", () => {
    const { db, r } = setup(); applyAdHocChange(db, "u_priya", add(r.id, "before"));
    applyAdHocChange(db, "u_priya", { requestId: r.id, action: "remove", stepId: "adhoc-one", key: "two" });
    expect(r.route.map((s) => s.id)).toEqual(["done", "priya", "rachel"]); expect(isPendingFor(r, "u_priya")).toBe(true);
  });
  it("never removes a completed ad hoc decision", () => {
    const { db, r } = setup(); applyAdHocChange(db, "u_priya", add(r.id, "before"));
    r.route[1].approvals[0].status = "approved"; r.route[1].approvals[0].at = "2026-11-02";
    expect(canRemoveApprover(r, r.route[1], "u_priya")).toBe(false);
    expect(() => applyAdHocChange(db, "u_priya", { requestId: r.id, action: "remove", stepId: "adhoc-one", key: "two" })).toThrow();
  });
  it("blocks edits around completed steps", () => {
    const { db, r } = setup(); expect(() => applyAdHocChange(db, "u_priya", add(r.id, "after", "done"))).toThrow();
  });
  it("blocks other approvers and requester from inserting", () => {
    for (const actor of ["u_daniel", "u_amit"]) { const { db, r } = setup(); expect(() => applyAdHocChange(db, actor, add(r.id, "after"))).toThrow(); }
  });
  it("blocks duplicate and inactive approvers", () => {
    for (const approverId of ["u_priya", "u_rachel", "u_mark", "u_amit", "u_daniel"]) {
      const { db, r } = setup(); const user = db.users.find((u) => u.id === "u_daniel"); if (user) user.active = false;
      expect(() => applyAdHocChange(db, "u_priya", { ...add(r.id, "after"), approverId })).toThrow();
    }
  });
  it("never deletes a configured step", () => {
    const { db, r } = setup(); expect(() => applyAdHocChange(db, "u_priya", { requestId: r.id, action: "remove", stepId: "rachel", key: "two" })).toThrow();
  });
  it("retries the same insertion without duplicating steps", () => {
    const { db, r } = setup(); const change = add(r.id, "before"); applyAdHocChange(db, "u_priya", change); applyAdHocChange(db, "u_priya", change);
    expect(r.route.filter((s) => s.adHoc)).toHaveLength(1);
  });
});