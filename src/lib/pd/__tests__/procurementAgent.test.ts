import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { agentRequest, applyAgentConfirmation, emptyAgentProposal, normalizeAgentProposal, previewAgentProposal, relevantAgentSuppliers, searchAgentCatalog, type AgentProposal } from "../procurementAgent";

const stationery = (): AgentProposal => ({ ...emptyAgentProposal(), title: "Office stationery", items: [
  { id: "pens", name: "Blue pens", description: "Blue ballpoint pens", catalogId: null, supplierId: "v_amazon", quantity: 20, unit: "PACK", unitPrice: null, category: "Office Supplies", budgetId: null, productLink: null },
  { id: "paper", name: "A4 paper", description: "A4 80 gsm white paper", catalogId: null, supplierId: "v_amazon", quantity: 10, unit: "REAM", unitPrice: null, category: "Office Supplies", budgetId: null, productLink: null },
] });
const complete = (): AgentProposal => ({ ...emptyAgentProposal(), title: "Laptop", departmentId: "dep_eng", budgetId: "bud_eng_hire", requiredBy: "2026-11-30", shipTo: "US HQ · Agate, CO", items: [{ ...stationery().items[0], id: "laptop", name: "MacBook", description: "", catalogId: "c_mbp", quantity: 1, unit: "EACH", category: "IT Equipment" }] });

describe("Personalized Procurement AI rules", () => {
  it("preserves 20 packs of pens and 10 reams of A4 80 gsm paper independently", () => {
    const r = agentRequest(seedDB(), stationery(), "u_amit");
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ qty: 20, uom: "PACK", description: "Blue ballpoint pens", unitPrice: 0 });
    expect(r.items[1]).toMatchObject({ qty: 10, uom: "REAM", description: "A4 80 gsm white paper", unitPrice: 0 });
  });
  it("recommends office suppliers, not IT-only suppliers for stationery", () => {
    expect(relevantAgentSuppliers(seedDB(), ["Office Supplies"]).map((v) => v.id)).toEqual(["v_amazon", "v_phoenix"]);
  });
  it("never presents unrelated catalog products as pens or paper", () => {
    expect(searchAgentCatalog(seedDB(), ["pens", "A4 paper"], "Office Supplies")).toEqual([]);
  });
  it("offers a draft for selected items with unknown prices but blocks approval", () => {
    const p = previewAgentProposal(seedDB(), stationery(), "u_amit");
    expect(p.draftMissing).toEqual([]);
    expect(p.approvalMissing).toContain("Blue pens: price");
    expect(p.approvalMissing).toContain("A4 paper: price");
  });
  it("does not invent quantity or unit for ambiguous answers", () => {
    const p = stationery(); p.items[0].quantity = null; p.items[0].unit = null;
    const preview = previewAgentProposal(seedDB(), p, "u_amit");
    expect(preview.draftMissing).toContain("Blue pens: quantity");
    expect(preview.draftMissing).toContain("Blue pens: unit (each, pack, ream…)");
  });
  it("search and proposal preview never create or submit a request", () => {
    const db = seedDB(); const before = structuredClone(db.requests);
    searchAgentCatalog(db, ["laptop"]); previewAgentProposal(db, complete(), "u_amit");
    expect(db.requests).toEqual(before);
  });
  it("catalog prices are authoritative rather than AI-generated financial values", () => {
    const p = complete(); p.items[0].unitPrice = 1;
    expect(normalizeAgentProposal(seedDB(), p).items[0].unitPrice).toBe(1999);
  });
  it("rejects invented supplier IDs and unavailable catalog products", () => {
    const db = seedDB(); const p = stationery(); p.items[0].supplierId = "fabricated";
    expect(() => normalizeAgentProposal(db, p)).toThrow("eligible");
    p.items[0].supplierId = "v_amazon"; p.items[0].catalogId = "c_headset";
    expect(() => normalizeAgentProposal(db, p)).toThrow("no longer available");
  });
  it("explicit draft confirmation saves only once and never sends for approval", () => {
    const db = seedDB(); const p = stationery(); const before = db.requests.length;
    const preview = previewAgentProposal(db, p, "u_amit");
    const r = applyAgentConfirmation(db, p, "u_amit", "draft-key", "draft", preview.fingerprint);
    applyAgentConfirmation(db, p, "u_amit", "draft-key", "draft", preview.fingerprint);
    expect(db.requests).toHaveLength(before + 1); expect(r.status).toBe("draft");
  });
  it("complete details display the real approver and submit once after explicit confirmation", () => {
    const db = seedDB(); const p = complete(); const preview = previewAgentProposal(db, p, "u_amit");
    expect(preview.approvalMissing).toEqual([]); expect(preview.approvers).toEqual(["Priya Shah"]);
    const r = applyAgentConfirmation(db, p, "u_amit", "approval-key", "approval", preview.fingerprint);
    applyAgentConfirmation(db, p, "u_amit", "approval-key", "approval", preview.fingerprint);
    expect(r.status).toBe("pending"); expect(r.activity.filter((a) => a.kind === "submit")).toHaveLength(1);
  });
  it("rejects approval when mandatory details are missing", () => {
    const db = seedDB(); const p = stationery(); const preview = previewAgentProposal(db, p, "u_amit");
    const count = db.requests.length;
    expect(() => applyAgentConfirmation(db, p, "u_amit", "missing", "approval", preview.fingerprint)).toThrow("delivery date");
    expect(db.requests).toHaveLength(count);
  });
  it("requires new confirmation when a catalog price changes", () => {
    const db = seedDB(); const p = complete(); const preview = previewAgentProposal(db, p, "u_amit");
    const c = db.catalog.find((c) => c.id === "c_mbp"); if (c) c.price = 2100;
    expect(() => applyAgentConfirmation(db, p, "u_amit", "changed", "approval", preview.fingerprint)).toThrow("changed");
  });
  it("rejects approver accounts and another user's saved request", () => {
    const db = seedDB(); const p = complete(); const preview = previewAgentProposal(db, p, "u_amit");
    expect(() => applyAgentConfirmation(db, p, "u_priya", "key", "draft", preview.fingerprint)).toThrow("cannot create");
    applyAgentConfirmation(db, p, "u_amit", "owned", "draft", preview.fingerprint);
    expect(() => applyAgentConfirmation(db, p, "u_admin", "owned", "draft", preview.fingerprint)).toThrow("another account");
  });
});