import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { converse, matchCatalog, startConversation } from "../procurementAi";

describe("Procurement AI conversation", () => {
  it("asks catalog vs manual before adding anything", () => {
    const db = seedDB();
    const s = converse(db, startConversation(db, "u_amit"), "I want to buy a laptop");
    expect(s.step).toBe("source");
    expect(s.request.items).toHaveLength(0);
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
    expect(s.request.departmentId).toBeUndefined();
    expect(s.request.status).toBe("draft");
  });
  it("leaves manual items unpriced when the price is unknown", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "u_amit"), "a quantum widget");
    s = converse(db, s, "manual");
    s = converse(db, s, "Quantum widget");
    s = converse(db, s, "skip");
    s = converse(db, s, "skip");
    s = converse(db, s, "2");
    expect(s.request.items[0]).toMatchObject({ qty: 2, unitPrice: 0, vendorId: "" });
  });
  it("never offers unavailable catalog items", () => {
    const db = seedDB();
    db.catalog.forEach((c) => { c.available = false; });
    expect(matchCatalog(db, "laptop")).toEqual([]);
    let s = converse(db, startConversation(db, "u_amit"), "laptop");
    s = converse(db, s, "catalog");
    s = converse(db, s, "c_mbp");
    expect(s.step).toBe("pick");
  });
  it("does not mutate the workspace", () => {
    const db = seedDB();
    const before = JSON.stringify(db);
    converse(db, startConversation(db, "u_amit"), "4 laptops");
    expect(JSON.stringify(db)).toBe(before);
  });
});
