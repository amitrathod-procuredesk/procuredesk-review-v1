import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { converse, procurementProposal } from "../procurementAi";

describe("Procurement AI proposals", () => {
  it("does not add priced items until the user confirms the catalog choice", () => {
    const db = seedDB();
    const c = db.catalog.find((item) => item.available);
    if (!c) throw new Error("Catalog fixture missing");
    const original = JSON.stringify(db);
    let state = { request: procurementProposal(db, "u_amit"), queue: [] as string[] };
    state = converse(db, state, `4 ${c.keywords.find((k) => k !== "laptop") ?? c.name}`);
    expect(state.request.items).toHaveLength(0);
    state = converse(db, state, "approve and submit everything");
    expect(state.request.items).toHaveLength(0);
    expect(state.request.status).toBe("draft");
    expect(JSON.stringify(db)).toBe(original);
  });
  it("never offers unavailable catalog items", () => {
    const db = seedDB();
    db.catalog.forEach((c) => { c.available = false; });
    const state = converse(db, { request: procurementProposal(db, "u_amit"), queue: [] }, "4 laptops");
    expect(state.request.ai.pending).toBe("nomatch");
    expect(state.request.ai.candidateIds).toEqual([]);
  });
  it("leaves unknown products unpriced and unsubmitted after explicit non-catalog confirmation", () => {
    const db = seedDB();
    let state = { request: procurementProposal(db, "u_amit"), queue: [] as string[] };
    state = converse(db, state, "3 custom quantum widgets");
    expect(state.request.items).toHaveLength(0);
    state = converse(db, state, "Create non-catalog item");
    expect(state.request.items[0]?.qty).toBe(3);
    expect(state.request.items[0]?.unitPrice).toBe(0);
    expect(state.request.items[0]?.vendorId).toBe("");
    expect(state.request.status).toBe("draft");
  });
});