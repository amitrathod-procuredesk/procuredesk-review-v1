import { respond } from "./copilot";
import { nowISO } from "./engine";
import type { DB, PRequest } from "./types";

/** An unsaved proposal; conversation never writes to the shared workspace. */
export function procurementProposal(db: DB, userId: string): PRequest {
  const at = nowISO();
  return {
    id: "procurement-proposal", title: "", status: "draft", requesterId: userId,
    businessUnit: db.org.businessUnits[0] ?? "", requestType: "PO requisition",
    project: "", shipTo: db.org.shipTo[0] ?? "", paymentMethod: "Corporate card",
    shipmentType: "Standard ground", urgent: false, delayed: false, blanket: false,
    items: [], noteBuyer: "", noteSupplier: "", quoteNo: "", website: "",
    attachments: [], comments: [], activity: [], route: [], sources: {},
    exceptionRequested: false, createdAt: at, updatedAt: at,
    ai: { messages: [], pending: null, qty: 1, candidateIds: [], rawItem: "" },
  };
}

export type ProcurementConversation = { request: PRequest; queue: string[] };

export function converse(db: DB, current: ProcurementConversation, text: string): ProcurementConversation {
  const next = structuredClone(current);
  const r = next.request;
  const input = text.trim();
  if (!input) return next;
  const availableDB = { ...db, catalog: db.catalog.filter((c) => c.available) };
  const pending = r.ai.pending;
  const last = r.ai.messages.at(-1);
  // Catalog confirmation is explicit; arbitrary text must not silently add a priced line.
  if ((pending === "catalog" || pending === "item" || pending === "nomatch") && !last?.options?.includes(input)) {
    r.ai.messages.push({ id: `clarify-${r.ai.messages.length}`, role: "ai", text: "Choose an option below to confirm the item, or undo to change your description.", options: last?.options, catalogIds: last?.catalogIds });
    return next;
  }
  if (!pending) {
    const parts = input.split(/\n+|\s+and\s+(?=\d+\s)/i).map((p) => p.trim()).filter(Boolean);
    next.queue.push(...parts.slice(1));
    respond(availableDB, r, parts[0] ?? input);
  } else {
    const count = r.items.length;
    respond(availableDB, r, input);
    if (r.items.length > count && next.queue.length) {
      const following = next.queue.shift();
      if (following) { r.ai.pending = null; respond(availableDB, r, following); }
    }
  }
  return next;
}