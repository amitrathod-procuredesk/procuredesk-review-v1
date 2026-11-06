import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { applyProcurementDraft, procurementBlockers, procurementDraftBlockers } from "../procurementDraft";
import { converse, startConversation } from "../procurementAi";

const selected = () => {
  const db = seedDB();
  let c = converse(db, startConversation(db, "u_amit"), "I want to buy MacBook Pro");
  c = converse(db, c, "c_mbp");
  c = converse(db, c, "1");
  c = converse(db, c, "Need it by 2026-11-30, use Engineering Hiring budget");
  return { db, proposal: c.request };
};
describe("Procurement AI draft lifecycle", () => {
  it("rejects missing mandatory draft fields without allocating a request ID", () => {
    const { db, proposal } = selected();
    const seq = db.seq;
    proposal.items[0].qty = 0;
    expect(() => applyProcurementDraft(db, proposal, "u_amit", "incomplete")).toThrow("quantity");
    expect(db.seq).toBe(seq);
  });
  it("creates a draft from a selected MacBook Pro, never submits automatically", () => {
    const { db, proposal } = selected();
    applyProcurementDraft(db, proposal, "u_amit", "conversation-1");
    const draft = db.requests[0];
    expect(draft.status).toBe("draft");
    expect(draft.route).toEqual([]);
    expect(draft.items[0]).toMatchObject({ catalogId: "c_mbp", qty: 1, unitPrice: 1999 });
    expect(draft.id).toMatch(/^REQ-\d+$/);
  });
  it("updates and retries the same draft without a duplicate or another number", () => {
    const { db, proposal } = selected();
    const before = db.requests.length;
    applyProcurementDraft(db, proposal, "u_amit", "conversation-1");
    const number = db.seq;
    proposal.requiredBy = "2026-11-30";
    applyProcurementDraft(db, proposal, "u_amit", "conversation-1");
    applyProcurementDraft(db, proposal, "u_amit", "conversation-1");
    expect(db.requests).toHaveLength(before + 1);
    expect(db.seq).toBe(number);
    expect(db.requests[0].requiredBy).toBe("2026-11-30");
  });
  it("lists missing delivery date before approval", () => {
    const { db, proposal } = selected();
    proposal.requiredBy = undefined;
    expect(procurementBlockers(proposal, db)).toContain("a delivery date");
    proposal.requiredBy = "2026-11-30";
    expect(procurementBlockers(proposal, db)).not.toContain("a delivery date");
  });
  it("keeps unknown price in the draft but requires a real supplier", () => {
    const { db, proposal } = selected();
    proposal.items[0].unitPrice = 0;
    proposal.items[0].vendorId = "";
    const seq = db.seq;
    expect(() => applyProcurementDraft(db, proposal, "u_amit", "conversation-1")).toThrow("supplier");
    expect(db.seq).toBe(seq);
    proposal.items[0].vendorId = db.catalog.find((i) => i.id === "c_mbp")?.vendorId ?? "";
    applyProcurementDraft(db, proposal, "u_amit", "conversation-1");
    expect(procurementBlockers(db.requests[0], db)).toContain("MacBook Pro 14-inch: price");
    expect(db.requests[0].status).toBe("draft");
  });
  it("allows drafts without budget, department, delivery date, description or price", () => {
    for (const level of ["header", "line"] as const) {
      const { db, proposal } = selected();
      db.org.budgetLevel = level;
      proposal.departmentId = undefined;
      proposal.requiredBy = undefined;
      proposal.budgetId = undefined;
      proposal.items[0].budgetId = undefined;
      proposal.items[0].description = "";
      proposal.items[0].unitPrice = 0;
      expect(procurementDraftBlockers(proposal, db)).toEqual([]);
      applyProcurementDraft(db, proposal, "u_amit", `essentials-${level}`);
      expect(db.requests[0].status).toBe("draft");
      expect(procurementBlockers(db.requests[0], db)).toContain("a delivery date");
    }
  });
  it("rejects missing item names and unrecognized suppliers before allocating an ID", () => {
    const { db, proposal } = selected();
    const seq = db.seq;
    proposal.items[0].name = "";
    expect(() => applyProcurementDraft(db, proposal, "u_amit", "missing-name")).toThrow("item name");
    proposal.items[0].name = "MacBook Pro";
    proposal.items[0].vendorId = "unknown-supplier";
    expect(() => applyProcurementDraft(db, proposal, "u_amit", "missing-supplier")).toThrow("supplier");
    expect(db.seq).toBe(seq);
  });
  it("does not create an empty request and reports what is required", () => {
    const db = seedDB();
    const before = db.requests.length;
    expect(() =>
      applyProcurementDraft(db, startConversation(db, "u_amit").request, "u_amit", "empty"),
    ).toThrow("at least one item");
    expect(db.requests).toHaveLength(before);
  });
  it("does not overwrite a request already sent for approval", () => {
    const { db, proposal } = selected();
    applyProcurementDraft(db, proposal, "u_amit", "conversation-1");
    db.requests[0].status = "pending";
    expect(() => applyProcurementDraft(db, proposal, "u_amit", "conversation-1")).toThrow(
      "no longer editable",
    );
    expect(db.requests[0].status).toBe("pending");
  });
});
