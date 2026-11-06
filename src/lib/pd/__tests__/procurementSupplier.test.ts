import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { converse, startConversation } from "../procurementAi";

const supplierQuestions = (s: ReturnType<typeof startConversation>) =>
  s.messages.filter((m) => m.role === "ai" && /Supplier is required/.test(m.text)).length;

describe("Procurement AI supplier answers", () => {
  it("never asks for the supplier again after the user typed it", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "Monitor 14 inch");
    s = converse(db, s, "manual");
    s = converse(db, s, "skip"); // specs
    s = converse(db, s, "2"); // qty
    expect(s.clarification).toBe("supplier");
    s = converse(db, s, "Amazon");
    expect(s.clarification).toBe("price");
    s = converse(db, s, "skip");
    expect(s.request.items[0]).toMatchObject({ vendorId: "v_amazon", qty: 2 });
    expect(supplierQuestions(s)).toBe(1);
    expect(s.draftConfirmed).toBe(true);
  });
  it("accepts a partial supplier name", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "Monitor 14 inch");
    s = converse(db, s, "manual");
    s = converse(db, s, "skip");
    s = converse(db, s, "1");
    s = converse(db, s, "phoenix");
    expect(s.pending?.vendorId ?? s.request.items[0]?.vendorId).toBe("v_phoenix");
  });
  it("uses a supplier named up front and skips the supplier question", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "3 standing desks from Phoenix Supplier");
    while (s.clarification && s.clarification !== "supplier" && s.step === "manual-review")
      s = converse(db, s, s.clarification === "qty" ? "3" : "skip");
    expect(supplierQuestions(s)).toBe(0);
    expect(s.request.items[0]?.vendorId ?? s.pending?.vendorId).toBe("v_phoenix");
  });
  it("takes a supplier given early, while answering the specs", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "4 laptops");
    s = converse(db, s, "manual");
    s = converse(db, s, "MacBook Air 13 inch from Amazon");
    expect(s.clarification).toBe("price");
    expect(s.pending).toMatchObject({ vendorId: "v_amazon", description: "MacBook Air 13 inch" });
  });
  it("lets the user move on to another item without losing the first one", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "Monitor 14 inch");
    s = converse(db, s, "manual");
    s = converse(db, s, "skip");
    s = converse(db, s, "2");
    expect(s.clarification).toBe("supplier");
    s = converse(db, s, "I also need a mouse");
    expect(s.step).toBe("pick");
    expect(s.request.items.map((i) => i.name)).toEqual(["Monitor 14 inch"]);
    s = converse(db, s, "c_mouse");
    s = converse(db, s, "1");
    // The parked monitor's supplier is asked once, by item name, and applied directly.
    expect(s.messages.at(-1)?.text).toContain("**Monitor 14 inch**");
    s = converse(db, s, "vendor:v_amazon");
    expect(s.request.items[0].vendorId).toBe("v_amazon");
    expect(s.draftConfirmed).toBe(true);
  });
  it("applies a supplier to every item missing one with “for all”", () => {
    const db = seedDB();
    let s = converse(db, startConversation(db, "new-user"), "Monitor 14 inch");
    s = converse(db, s, "manual");
    s = converse(db, s, "skip");
    s = converse(db, s, "2");
    s = converse(db, s, "I need staples");
    s = converse(db, s, "I need a mouse");
    s = converse(db, s, "c_mouse");
    s = converse(db, s, "1");
    s = converse(db, s, "Amazon for all");
    expect(s.request.items.every((i) => i.vendorId)).toBe(true);
    expect(s.draftConfirmed).toBe(true);
  });
});
