import { nowISO } from "./engine";
import type { CatalogItem, DB, PRequest } from "./types";

/**
 * Deterministic, step-by-step procurement conversation.
 * Nothing is added to the proposal until the user explicitly picks it, and
 * the proposal itself is never persisted until "Create draft & review".
 */

export type Step = "item" | "source" | "pick" | "manual-name" | "manual-price" | "manual-vendor" | "qty" | "department" | "date" | "more" | "done";
export type Option = { label: string; value: string; hint?: string };
export type Msg = { id: string; role: "ai" | "user"; text: string; options?: Option[]; widget?: "catalog" | "date"; query?: string };
export type PendingLine = { catalogId?: string; name: string; unitPrice?: number; vendorId?: string; qty?: number };

export type ProcurementConversation = {
  request: PRequest;
  messages: Msg[];
  step: Step;
  line: PendingLine | null;
  /** Free-text product description the user started with. */
  query: string;
};

let n = 0;
const id = (p: string) => `${p}_${Date.now().toString(36)}_${(n++).toString(36)}`;

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

export function startConversation(db: DB, userId: string): ProcurementConversation {
  return { request: procurementProposal(db, userId), messages: [], step: "item", line: null, query: "" };
}

/* ---------- parsing helpers ---------- */

const STOP = new Set(["i", "want", "to", "buy", "need", "a", "an", "some", "the", "please", "get", "order", "purchase", "would", "like", "we", "for", "new", "me", "our", "of", "x", "units", "pcs", "pieces"]);
const singular = (w: string) => (w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

export function parseQty(text: string): number | undefined {
  const m = text.match(/\b(\d{1,5})\b/);
  const q = m ? Number(m[1]) : undefined;
  return q && q > 0 ? q : undefined;
}

/** The product words from a natural sentence, e.g. "I want to buy 4 laptops for Eng" → "laptop". */
export function productTerms(text: string): string {
  const head = text.toLowerCase().split(/\s+for\s+|\s+by\s+|[,.]/)[0] ?? "";
  return head.replace(/[^a-z0-9"\s-]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w)).map(singular).join(" ").trim();
}

export function matchCatalog(db: DB, text: string): CatalogItem[] {
  const terms = productTerms(text).split(" ").filter((t) => t.length > 1);
  if (!terms.length) return [];
  return db.catalog.filter((c) => c.available).filter((c) => {
    const hay = `${c.name} ${c.category} ${c.keywords.join(" ")} ${c.description}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const addDays = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const endOfMonth = () => { const x = new Date(); return new Date(x.getFullYear(), x.getMonth() + 1, 0, 12).toISOString().slice(0, 10); };

/* ---------- conversation ---------- */

function ai(c: ProcurementConversation, text: string, extra: Partial<Msg> = {}) {
  c.messages.push({ id: id("m"), role: "ai", text, ...extra });
}

function askSource(db: DB, c: ProcurementConversation) {
  const matches = matchCatalog(db, c.query);
  const thing = productTerms(c.query) || "that";
  c.step = "source";
  if (matches.length) {
    ai(c, `I found ${matches.length} ${matches.length === 1 ? "match" : "matches"} for “${thing}” in your catalog. Catalog items have negotiated prices and approved suppliers. How would you like to add it?`, {
      options: [{ label: `Browse catalog (${matches.length})`, value: "catalog", hint: "Recommended" }, { label: "Add manually", value: "manual" }],
    });
  } else {
    ai(c, `I couldn’t find “${thing}” in your catalog. You can describe it manually, or browse the full catalog in case it’s listed under another name.`, {
      options: [{ label: "Add manually", value: "manual" }, { label: "Browse full catalog", value: "catalog" }],
    });
  }
}

function showCatalog(db: DB, c: ProcurementConversation, query: string) {
  c.step = "pick";
  const hits = matchCatalog(db, query);
  ai(c, hits.length ? "Here’s what’s available. Pick the one that fits — you can search or filter." : "Here’s the full catalog. Search or filter to find what you need.", { widget: "catalog", query: hits.length ? productTerms(query) : "" });
}

function askQty(c: ProcurementConversation) {
  c.step = "qty";
  const mentioned = parseQty(c.query);
  const opts = [1, 2, 5, 10].map((q) => ({ label: String(q), value: String(q) }));
  if (mentioned && ![1, 2, 5, 10].includes(mentioned)) opts.unshift({ label: String(mentioned), value: String(mentioned) });
  ai(c, mentioned ? `How many do you need? You mentioned ${mentioned}.` : "How many do you need?", { options: opts.map((o) => (Number(o.value) === mentioned ? { ...o, hint: "Mentioned" } : o)) });
}

function commitLine(db: DB, c: ProcurementConversation) {
  const l = c.line;
  if (!l || !l.qty) return;
  const cat = l.catalogId ? db.catalog.find((x) => x.id === l.catalogId) : undefined;
  c.request.items.push({
    id: id("li"), name: cat?.name ?? l.name, description: cat?.description ?? "", partNumber: cat?.partNumber ?? "",
    account: cat?.account ?? "", vendorId: cat?.vendorId ?? l.vendorId ?? "", uom: "EACH", qty: l.qty,
    unitPrice: cat?.price ?? l.unitPrice ?? 0, tax: 0, shipping: 0, category: cat?.category ?? "",
    catalogId: cat?.id, source: "ai",
  });
  const items = c.request.items;
  c.request.title = items.length === 1 ? (items[0].name ?? "") : `${items[0].name} and ${items.length - 1} more`;
  c.line = null;
}

function afterLine(db: DB, c: ProcurementConversation) {
  const added = c.request.items.at(-1);
  const lead = added ? `Added ${added.qty} × ${added.name} to the proposal.` : "";
  if (!c.request.departmentId) {
    c.step = "department";
    const me = db.users.find((u) => u.id === c.request.requesterId);
    const deps = [...db.departments].sort((a, b) => (a.id === me?.departmentId ? -1 : b.id === me?.departmentId ? 1 : 0));
    ai(c, `${lead} Which department is this for?`, { options: deps.map((d) => ({ label: d.name, value: d.id, hint: d.id === me?.departmentId ? "Your department" : undefined })) });
  } else askMore(c, lead);
}

function askDate(c: ProcurementConversation) {
  c.step = "date";
  ai(c, "When do you need it by?", { widget: "date", options: [
    { label: "In 1 week", value: addDays(7) }, { label: "In 2 weeks", value: addDays(14) },
    { label: "End of month", value: endOfMonth() }, { label: "Not sure yet", value: "skip" },
  ] });
}

function askMore(c: ProcurementConversation, lead = "") {
  c.step = "more";
  ai(c, `${lead ? `${lead} ` : ""}Anything else to add to this request?`.trim(), { options: [{ label: "Add another item", value: "more" }, { label: "No, I’m done", value: "done" }] });
}

const is = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

/** Advance the conversation with a typed message or a clicked option value. Pure: returns a new state. */
export function converse(db: DB, current: ProcurementConversation, input: string, label?: string): ProcurementConversation {
  const c = structuredClone(current);
  const raw = input.trim();
  if (!raw) return c;
  const t = raw.toLowerCase();
  c.messages.push({ id: id("m"), role: "user", text: label ?? raw });

  switch (c.step) {
    case "item":
    case "done": {
      if (!productTerms(raw)) { c.step = "item"; ai(c, "Sure — what would you like to buy? A product name is enough, e.g. “a laptop” or “10 monitors”."); break; }
      c.query = raw;
      askSource(db, c);
      break;
    }
    case "source": {
      if (is(t, "catalog", "catalogue", "browse", "list", "show")) showCatalog(db, c, c.query);
      else if (is(t, "manual", "myself", "own", "custom", "other")) {
        c.step = "manual-name";
        const guess = cap(productTerms(c.query));
        ai(c, "What should I call this item? Include brand or model if you know it.", { options: guess ? [{ label: guess, value: guess }] : undefined });
      } else ai(c, "Would you like to browse the catalog or add it manually?", { options: [{ label: "Browse catalog", value: "catalog" }, { label: "Add manually", value: "manual" }] });
      break;
    }
    case "pick": {
      const chosen = db.catalog.find((x) => x.available && x.id === raw);
      if (chosen) { c.line = { catalogId: chosen.id, name: chosen.name }; askQty(c); break; }
      if (is(t, "manual")) { c.step = "manual-name"; ai(c, "What should I call this item?"); break; }
      // Typed text refines the search instead of guessing a selection.
      c.query = raw;
      showCatalog(db, c, raw);
      break;
    }
    case "manual-name": {
      c.line = { name: cap(raw) };
      c.step = "manual-price";
      ai(c, "Do you know the estimated unit price? It helps check budget and approvals.", { options: [{ label: "I don’t know", value: "skip" }] });
      break;
    }
    case "manual-price": {
      const price = Number(raw.replace(/[^0-9.]/g, ""));
      if (c.line) c.line.unitPrice = t === "skip" || !price ? 0 : price;
      if (t !== "skip" && !price && !is(t, "know", "no", "not")) { ai(c, "Please enter a number like 450, or choose “I don’t know”.", { options: [{ label: "I don’t know", value: "skip" }] }); break; }
      c.step = "manual-vendor";
      const vendors = [...db.vendors].sort((a, b) => Number(b.preferred) - Number(a.preferred)).slice(0, 5);
      ai(c, "Do you have a preferred supplier?", { options: [...vendors.map((v) => ({ label: v.name, value: v.id, hint: v.preferred ? "Preferred" : undefined })), { label: "Not sure", value: "skip" }] });
      break;
    }
    case "manual-vendor": {
      const v = db.vendors.find((x) => x.id === raw || x.name.toLowerCase() === t);
      if (c.line) c.line.vendorId = v?.id ?? "";
      askQty(c);
      break;
    }
    case "qty": {
      const q = parseQty(raw);
      if (!q) { ai(c, "Please enter a quantity, e.g. 4.", { options: current.messages.at(-1)?.options }); break; }
      if (c.line) c.line.qty = q;
      commitLine(db, c);
      afterLine(db, c);
      break;
    }
    case "department": {
      const d = db.departments.find((x) => x.id === raw || t.includes(x.name.toLowerCase()));
      if (!d) { ai(c, "Which department? Choose one below.", { options: current.messages.at(-1)?.options }); break; }
      c.request.departmentId = d.id;
      c.request.businessUnit = d.businessUnit || c.request.businessUnit;
      askDate(c);
      break;
    }
    case "date": {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) c.request.requiredBy = raw;
      else if (t !== "skip" && !is(t, "not sure", "later", "don")) { ai(c, "Pick an option below or choose a date.", { widget: "date", options: current.messages.at(-1)?.options }); break; }
      askMore(c);
      break;
    }
    case "more": {
      if (is(t, "done", "no", "that's all", "finish", "review")) {
        c.step = "done";
        ai(c, "Your proposal is ready. Review it on the right — you can still edit everything in the draft before submitting.");
      } else if (is(t, "more", "another", "yes", "add")) {
        c.step = "item";
        ai(c, "What else do you need?");
      } else { c.query = raw; askSource(db, c); }
      break;
    }
  }
  return c;
}
