import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { confirmManual, converse, matchCatalog, startConversation } from "../procurementAi";
import { manualDefaults, purchaseSuggestions } from "../procurementSuggestions";

describe("Procurement AI conversation", () => {
  it("matches a 27 inch monitor without substituting laptops or different sizes", () => {
    const db = seedDB();
    for (const query of ["Monitor 27 inch", "27-inch monitor", '27" monitor'])
      expect(matchCatalog(db, query).map((i) => i.id)).toEqual(["c_mon"]);
    expect(matchCatalog(db, "Monitor 14 inch")).toEqual([]);
  });
  it("saves readiness after catalog item and quantity confirmation without administrative questions", () => {
    const db = seedDB();
    let c = converse(db, startConversation(db, "u_amit"), "Monitor 27 inch");
    expect(c.draftConfirmed).not.toBe(true);
    c = converse(db, c, "c_mon");
    expect(c.request.items).toHaveLength(0);
    c = converse(db, c, "2");
    expect(c.draftConfirmed).toBe(true);
    expect(c.step).toBe("done");
    expect(c.request.requiredBy).toBeUndefined();
    expect(c.request.items[0]).toMatchObject({ catalogId: "c_mon", qty: 2 });
  });
  it("does not mistake 'need it next week' for the IT department", () => {
    const db = seedDB();
    db.departments.push({ ...db.departments[0], id: "dep_short", name: "IT" });
    let c = converse(db, startConversation(db, "u_amit"), "Monitor 27 inch");
    c = converse(db, c, "c_mon");
    c = converse(db, c, "2");
    c = converse(db, c, "Need it next week");
    expect(c.request.departmentId).toBe("dep_eng");
  });
  it("shows catalogue results immediately without adding anything", () => {
    const db = seedDB();
    const s = converse(db, startConversation(db, "u_amit"), "I want to buy a laptop");
    expect(s.step).toBe("pick");
    expect(s.messages.at(-1)?.widget).toBe("catalog");
    expect(s.request.items).toHaveLength(0);
  });
  it("matches MacBook Pro specifically rather than every pro product", () => {
    const db = seedDB();
    db.catalog.push({
      ...db.catalog[0],
      id: "other-pro",
      name: "Pro standing desk",
      keywords: ["pro", "desk"],
    });
    const s = converse(db, startConversation(db, "u_amit"), "I want to buy MacBook Pro");
    expect(s.step).toBe("pick");
    expect(matchCatalog(db, s.query).map((item) => item.id)).toEqual(["c_mbp"]);
  });
  it("adds only the item the user picked, after quantity is confirmed", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "u_amit"), "I want to buy a laptop");
    s = converse(db, s, "catalog");
    expect(s.step).toBe("pick");
    s = converse(db, s, "c_dell");
    expect(s.request.items).toHaveLength(0);
    s = converse(db, s, "3");
    expect(s.request.items).toHaveLength(1);
    expect(s.request.items[0]).toMatchObject({ catalogId: "c_dell", qty: 3, unitPrice: 1450 });
    expect(s.request.departmentId).toBe("dep_eng");
    expect(s.request.sources.department).toBe("suggested");
    expect(s.request.status).toBe("draft");
  });
  it("leaves manual items unpriced when the price is unknown", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "u_amit"), "a quantum widget");
    s = converse(db, s, "manual");
    s = confirmManual(db, s, { ...manualDefaults(db, "u_amit", "Quantum widget").details, qty: 2 });
    expect(s.request.items[0]).toMatchObject({ qty: 2, unitPrice: 0, vendorId: "" });
  });
  it("never offers unavailable catalog items", () => {
    const db = seedDB();
    db.catalog.forEach((c) => {
      c.available = false;
    });
    expect(matchCatalog(db, "laptop")).toEqual([]);
    let s = converse(db, startConversation(db, "u_amit"), "laptop");
    s = converse(db, s, "catalog");
    s = converse(db, s, "c_mbp");
    expect(s.request.items).toHaveLength(0);
    expect(s.line?.catalogId).toBeUndefined();
  });
  it("explains a missing catalog item, offers approved suppliers and never reuses unrelated history", () => {
    const db = seedDB();
    const s = converse(db, startConversation(db, "u_amit"), "Moniter 14 inch");
    const reply = s.messages.at(-1)!;
    expect(s.step).toBe("source");
    expect(reply.text).toContain("couldn’t find");
    expect(reply.text).not.toMatch(/REQ-/);
    expect(reply.suppliers?.length).toBeGreaterThan(0);
    const picked = converse(db, s, `vendor:${reply.suppliers![0].id}`);
    expect(picked.pending?.vendorId).toBe(reply.suppliers![0].id);
    expect(picked.pending?.unitPrice).toBe(0);
    expect(picked.pending?.description).toBe("");
    expect(picked.messages.at(-1)!.text).not.toMatch(/REQ-/);
  });
  it("does not mutate the workspace", () => {
    const db = seedDB();
    const before = JSON.stringify(db);
    converse(db, startConversation(db, "u_amit"), "4 laptops");
    expect(JSON.stringify(db)).toBe(before);
  });
  it("uses only this user's history, excluding inventory and rejected purchases", () => {
    const db = seedDB();
    const base = db.requests[0];
    db.requests = [
      {
        ...structuredClone(base),
        id: "mine",
        requesterId: "u_amit",
        items: [{ ...base.items[0], id: "mine-item", name: "Unique widget", unitPrice: 321 }],
      },
      {
        ...structuredClone(base),
        id: "other",
        requesterId: "someone-else",
        items: [{ ...base.items[0], name: "Private widget", unitPrice: 999 }],
      },
      {
        ...structuredClone(base),
        id: "stock",
        requesterId: "u_amit",
        items: [{ ...base.items[0], name: "Stock widget", fulfillment: "inventory" }],
      },
      {
        ...structuredClone(base),
        id: "rejected",
        requesterId: "u_amit",
        status: "rejected",
        items: [{ ...base.items[0], name: "Rejected widget" }],
      },
    ];
    const suggestions = purchaseSuggestions(db, "u_amit");
    expect(suggestions.map((s) => s.request.id)).toEqual(["mine"]);
    expect(manualDefaults(db, "u_amit", "widget").details.unitPrice).toBe(321);
  });
  it("does not add historical financial values until explicit confirmation", () => {
    const db = seedDB();
    const before = JSON.stringify(db);
    let s = converse(db, startConversation(db, "u_amit"), "laptop");
    s = converse(db, s, "manual");
    expect(s.request.items).toHaveLength(0);
    const details = { ...manualDefaults(db, "u_amit", "laptop").details, qty: 4, unitPrice: 850 };
    s = confirmManual(db, s, details);
    expect(s.request.items[0]).toMatchObject({ qty: 4, unitPrice: 850 });
    expect(JSON.stringify(db)).toBe(before);
  });
  it("preserves project scope and service units without fabricating project facts", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "infrastructure project");
    s = converse(db, s, "project");
    const details = manualDefaults(db, "new-user", "infrastructure project").details;
    expect(details.unitPrice).toBe(0);
    expect(details.description).toBe("");
    expect(details.project).toBe("");
    s = confirmManual(db, s, {
      ...details,
      description: "Network installation milestone 1",
      uom: "HOUR",
      qty: 20,
      project: db.org.projects[0],
    });
    expect(s.request.items[0]).toMatchObject({
      itemType: "Service",
      description: "Network installation milestone 1",
      uom: "HOUR",
      qty: 20,
    });
    expect(s.request.project).toBe(db.org.projects[0]);
  });
  it("does not invent a live punch-out cart or supplier price", () => {
    const db = seedDB();
    const s = converse(db, startConversation(db, "new-user"), "custom valve from supplier cart");
    expect(s.step).toBe("manual-review");
    expect(s.supplierShopping).toBe(true);
    expect(s.pending?.unitPrice).toBe(0);
    expect(s.request.items).toHaveLength(0);
  });
  it("guides a manual item linearly, one question at a time, then adds it without a review step", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "4 laptops");
    s = converse(db, s, "manual");
    expect(s.clarification).toBe("spec");
    expect(s.messages.at(-1)?.options?.map((o) => o.value)).not.toContain("change");
    s = converse(db, s, "MacBook Air 13 inch 16GB");
    expect(s.clarification).toBe("supplier");
    const vendor = db.vendors.find((v) => v.verified && v.contractActive)!;
    s = converse(db, s, `vendor:${vendor.id}`);
    expect(s.clarification).toBe("price");
    expect(s.request.items).toHaveLength(0);
    s = converse(db, s, "1200");
    expect(s.request.items).toHaveLength(1);
    expect(s.request.items[0]).toMatchObject({ qty: 4, unitPrice: 1200, vendorId: vendor.id });
  });
  it("does not prefill laptop accessories as the requested laptop", () => {
    const db = seedDB();
    const base = db.requests[0];
    db.requests = [
      {
        ...base,
        requesterId: "u_amit",
        items: [
          {
            ...base.items[0],
            catalogId: undefined,
            name: "USB dock",
            description: "Laptop charging accessory",
            category: "IT Equipment",
          },
        ],
      },
    ];
    expect(purchaseSuggestions(db, "u_amit", "laptop")).toHaveLength(0);
    expect(manualDefaults(db, "u_amit", "laptop").details.name).toBe("laptop");
  });
  it("rejects invalid quantities, prices and unsafe supplier links", () => {
    const db = seedDB();
    const s = converse(db, converse(db, startConversation(db, "new-user"), "widget"), "manual");
    const d = manualDefaults(db, "new-user", "widget").details;
    for (const invalid of [
      { qty: 0 },
      { unitPrice: -1 },
      { webLink: "javascript:alert(1)" },
      { vendorId: "unknown" },
    ]) {
      expect(confirmManual(db, s, { ...d, ...invalid }).request.items).toHaveLength(0);
    }
  });
  it("extracts a complete service brief without a field-by-field questionnaire", () => {
    const db = seedDB();
    const s = converse(
      db,
      startConversation(db, "new-user"),
      "20 hours of consulting at $125 per hour from Amazon for Platform migration, scope: configure the new network",
    );
    expect(s.step).toBe("manual-review");
    expect(s.pending).toMatchObject({
      qty: 20,
      unitPrice: 125,
      uom: "HOUR",
      description: "configure the new network",
      project: "Platform migration",
    });
    expect(s.request.items).toHaveLength(0);
    const confirmed = converse(db, s, "confirm");
    expect(confirmed.request.items[0]).toMatchObject({ qty: 20, unitPrice: 125, uom: "HOUR" });
    expect(confirmed.step).toBe("done");
    expect(confirmed.draftConfirmed).toBe(true);
  });
  it("asks one scope question and preserves an unknown price for projects", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "infrastructure project");
    expect(s.step).toBe("clarify");
    expect(s.clarification).toBe("scope");
    s = converse(db, s, "Install switches and certify cabling");
    expect(s.pending?.description).toBe("Install switches and certify cabling");
    expect(s.pending?.unitPrice).toBe(0);
    expect(s.step).toBe("manual-review");
  });
  it("stages conversational financial corrections until a confirmation click", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "I need 2 custom widgets at $450 each");
    s = converse(db, s, "confirm");
    const itemId = s.request.items[0].id;
    expect(s.request.items[0]).toMatchObject({ qty: 2, unitPrice: 450 });
    s = converse(db, s, "make that 6 at $400 each");
    expect(s.pending).toMatchObject({ qty: 6, unitPrice: 400 });
    expect(s.request.items[0]).toMatchObject({ qty: 2, unitPrice: 450 });
    s = converse(db, s, "confirm");
    expect(s.request.items).toHaveLength(1);
    expect(s.request.items[0]).toMatchObject({ id: itemId, qty: 6, unitPrice: 400 });
  });
  it("uses an explicit date and department without asking them again", () => {
    const db = seedDB();
    let s = converse(
      db,
      startConversation(db, "u_amit"),
      "I need 2 custom widgets at $450 each for Engineering by 2026-11-30",
    );
    s = converse(db, s, "confirm");
    expect(s.request.requiredBy).toBe("2026-11-30");
    expect(s.request.departmentId).toBe("dep_eng");
    expect(s.step).toBe("requirements");
  });
  it("accepts a named budget and department in chat for every selected line", () => {
    const db = seedDB();
    db.org.budgetLevel = "line";
    let s = converse(db, startConversation(db, "u_amit"), "MacBook Pro");
    s = converse(db, s, "c_mbp");
    s = converse(db, s, "1");
    s = converse(db, s, "Use Engineering Hiring budget for Engineering by 2026-11-30");
    expect(s.request.departmentId).toBe("dep_eng");
    expect(s.request.budgetId).toBe("bud_eng_hire");
    expect(s.request.items[0].budgetId).toBe("bud_eng_hire");
    expect(s.request.requiredBy).toBe("2026-11-30");
    expect(s.pending).toBeUndefined();
  });
});
