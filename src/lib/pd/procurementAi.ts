import { money, nowISO } from "./engine";
import { procurementDraftBlockers } from "./procurementDraft";
import type { CatalogItem, DB, PRequest } from "./types";
import { dateFromText, extractPurchase, purchaseName } from "./procurementLanguage";
import {
  manualDefaults,
  purchaseSuggestions,
  validManualDetails,
  type ManualDetails,
} from "./procurementSuggestions";

/**
 * Deterministic, step-by-step procurement conversation.
 * Nothing is added to the proposal until the user explicitly picks it, and
 * selected items may be saved as a draft; submission always needs a user click.
 */

export type Step =
  "item" | "source" | "pick" | "manual-review" | "clarify" | "qty" | "requirements" | "done";
export type Option = { label: string; value: string; hint?: string };
export type Msg = {
  id: string;
  role: "ai" | "user";
  text: string;
  options?: Option[];
  widget?: "catalog" | "suppliers";
  suppliers?: { id: string; name: string; note: string }[];
  followUp?: string;
  query?: string;
  details?: ManualDetails;
  basedOn?: string;
  supplierShopping?: boolean;
  search?: { query: string; count: number };
};
export type PendingLine = {
  catalogId?: string;
  name: string;
  unitPrice?: number;
  vendorId?: string;
  qty?: number;
};

export type ProcurementConversation = {
  request: PRequest;
  messages: Msg[];
  step: Step;
  line: PendingLine | null;
  pending?: ManualDetails;
  basedOn?: string;
  supplierShopping?: boolean;
  clarification?: "name" | "scope" | "spec" | "qty" | "supplier" | "price";
  /** Guided manual questions already asked, so each is asked at most once. */
  asked?: string[];
  editingIndex?: number;
  /** Free-text product description the user started with. */
  query: string;
  draftConfirmed?: boolean;
  intent?: "draft" | "approval";
  /** Item id the current "Supplier needed" question is about. */
  supplierFor?: string;
};

let n = 0;
const id = (p: string) => `${p}_${Date.now().toString(36)}_${(n++).toString(36)}`;

export function procurementProposal(db: DB, userId: string): PRequest {
  const at = nowISO();
  return {
    id: "procurement-proposal",
    title: "",
    status: "draft",
    requesterId: userId,
    businessUnit: db.org.businessUnits[0] ?? "",
    requestType: "PO requisition",
    project: "",
    shipTo: db.org.shipTo[0] ?? "",
    paymentMethod: "Corporate card",
    shipmentType: "Standard ground",
    urgent: false,
    delayed: false,
    blanket: false,
    items: [],
    noteBuyer: "",
    noteSupplier: "",
    quoteNo: "",
    website: "",
    attachments: [],
    comments: [],
    activity: [],
    route: [],
    sources: {},
    exceptionRequested: false,
    createdAt: at,
    updatedAt: at,
    ai: { messages: [], pending: null, qty: 1, candidateIds: [], rawItem: "" },
  };
}

export function startConversation(db: DB, userId: string): ProcurementConversation {
  return {
    request: procurementProposal(db, userId),
    messages: [],
    step: "item",
    line: null,
    query: "",
  };
}

/* Conversation stays in memory; confirmed proposals use existing draft actions. */
const STOP = new Set([
  "i",
  "want",
  "to",
  "buy",
  "need",
  "a",
  "an",
  "some",
  "the",
  "please",
  "get",
  "order",
  "purchase",
  "would",
  "like",
  "we",
  "for",
  "new",
  "me",
  "our",
  "of",
  "x",
  "units",
  "pcs",
  "pieces",
]);
const singular = (w: string) =>
  w.endsWith("ies")
    ? `${w.slice(0, -3)}y`
    : w.endsWith("s") && !w.endsWith("ss")
      ? w.slice(0, -1)
      : w;
export function productTerms(text: string): string {
  return purchaseName(text)
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(?:[- ]?inch(?:es)?\b|["″])/g, "$1inch")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .map(singular)
    .join(" ");
}
export function parseQty(text: string): number | undefined {
  const match =
    text.match(/^\s*(\d+(?:\.\d+)?)\s*$/) ??
    text.match(/\b(\d+)\s+(?:laptops?|monitors?|units?|pieces?|desks?|widgets?)\b/i);
  const qty = match ? Number(match[1]) : undefined;
  return qty && qty > 0 ? qty : undefined;
}
export function matchCatalog(db: DB, text: string): CatalogItem[] {
  const terms = productTerms(text)
    .split(" ")
    .filter((t) => t.length > 1);
  if (!terms.length) return [];
  return db.catalog.filter(
    (c) =>
      c.available &&
      terms.every((t) =>
        `${c.name} ${c.category} ${c.keywords.join(" ")}`
          .toLowerCase()
          .replace(/(\d+(?:\.\d+)?)\s*(?:[- ]?inch(?:es)?\b|["″])/g, "$1inch")
          .includes(t),
      ),
  );
}
function ai(c: ProcurementConversation, text: string, extra: Partial<Msg> = {}) {
  c.messages.push({ id: id("m"), role: "ai", text, ...extra });
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A supplier the user named or picked, anywhere in their message. */
export function vendorIn(db: DB, text: string) {
  const t = text.trim().toLowerCase().replace(/^use supplier\s+/, "");
  if (t.startsWith("vendor:")) return db.vendors.find((v) => v.id === text.trim().slice(7));
  return (
    db.vendors.find((v) => new RegExp(`\\b${esc(v.name)}\\b`, "i").test(text)) ??
    // A short partial name such as "phoenix" for "Phoenix Supplier".
    (t.length >= 3 && t.split(/\s+/).length <= 3
      ? db.vendors.find((v) => v.name.toLowerCase().startsWith(t))
      : undefined)
  );
}
const stripVendor = (text: string, name: string) =>
  text
    .replace(new RegExp(`\\s*(?:,\\s*)?(?:from|via|at|through|with|use)?\\s*${esc(name)}\\b`, "i"), "")
    .trim();
/** Bare quantity answers like "4", "4 units", "4 please". */
const answerQty = (text: string) => {
  const m = text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:x|units?|pcs|pieces|please|of them|nos?)?\s*\.?\s*$/i);
  const q = m ? Number(m[1]) : undefined;
  return q && q > 0 ? q : undefined;
};
/** The user moved on to a different purchase instead of answering. */
function isNewPurchase(db: DB, raw: string, strict = false) {
  if (/^(?:(?:i|we)\s+)?(?:also\s+|and\s+)?(?:need|want|would like|buy|order|purchase|add|get)\b/i.test(raw))
    return !/^(?:add|get)\s+(?:it|that|them)\b/i.test(raw);
  if (/^(?:also|plus|and also)\s+\S/i.test(raw)) return true;
  return !strict && !vendorIn(db, raw) && !answerQty(raw) && matchCatalog(db, raw).length > 0;
}
function lineFrom(d: ManualDetails) {
  return {
    id: id("li"),
    name: d.name.trim(),
    description: d.description.trim(),
    partNumber: "",
    account: d.account,
    category: d.category,
    vendorId: d.vendorId,
    uom: d.uom,
    qty: d.qty > 0 ? d.qty : 1,
    unitPrice: d.unitPrice > 0 ? d.unitPrice : 0,
    tax: 0,
    shipping: 0,
    source: "ai" as const,
    itemType: d.itemType,
    projectCode: d.project,
    webLink: d.webLink,
  };
}
function retitle(c: ProcurementConversation) {
  c.request.title =
    c.request.items.length <= 1
      ? (c.request.items[0]?.name ?? "")
      : `${c.request.items[0].name} and ${c.request.items.length - 1} more`;
}
/**
 * Keep the item in progress on the request when the user moves on, so nothing
 * they said is lost; missing essentials are collected before the draft saves.
 */
function park(db: DB, c: ProcurementConversation): string | undefined {
  let name: string | undefined;
  if (c.pending && c.pending.name.trim() && c.editingIndex === undefined) {
    c.request.items.push(lineFrom(c.pending));
    name = c.pending.name;
  } else if (c.line?.catalogId) {
    const cat = db.catalog.find((x) => x.id === c.line?.catalogId && x.available);
    if (cat) {
      c.request.items.push({
        id: id("li"),
        name: cat.name,
        description: cat.description,
        partNumber: cat.partNumber,
        account: cat.account,
        vendorId: cat.vendorId,
        uom: "EACH",
        qty: c.line.qty ?? 1,
        unitPrice: cat.price,
        tax: 0,
        shipping: 0,
        category: cat.category,
        catalogId: cat.id,
        source: "ai",
      });
      name = cat.name;
    }
  }
  retitle(c);
  c.pending = undefined;
  c.line = null;
  c.asked = [];
  c.clarification = undefined;
  c.editingIndex = undefined;
  c.draftConfirmed = false;
  return name;
}
/** Start a new purchase mid-flow without losing the item in progress. */
function switchTo(db: DB, c: ProcurementConversation, raw: string) {
  const kept = park(db, c);
  begin(db, c, raw);
  if (kept) {
    const last = c.messages.at(-1);
    if (last?.role === "ai")
      last.text = `I’ve kept **${kept}** on your request.\n\n${last.text}`;
  }
}
const missingSupplier = (db: DB, c: ProcurementConversation) =>
  c.request.items.filter(
    (l) => l.fulfillment !== "inventory" && !db.vendors.some((v) => v.id === l.vendorId),
  );
/** Apply a named supplier straight to the item(s) it was meant for. */
function applySupplier(db: DB, c: ProcurementConversation, vendorId: string, raw: string) {
  const missing = missingSupplier(db, c);
  const named = c.request.items.filter(
    (l) => !!l.name && l.name.length > 2 && raw.toLowerCase().includes(l.name.toLowerCase()),
  );
  const targets = /\b(all|every|both|each|everything)\b/i.test(raw) || raw.startsWith("vendor-all:")
    ? missing.length
      ? missing
      : c.request.items
    : named.length
      ? named
      : [
          c.request.items.find((l) => l.id === c.supplierFor) ??
            missing[0] ??
            c.request.items.at(-1),
        ].filter((l): l is NonNullable<typeof l> => !!l);
  targets.forEach((l) => {
    l.vendorId = vendorId;
  });
  return targets;
}
function context(db: DB, c: ProcurementConversation, text: string) {
  const department = db.departments.find(
    (d) =>
      new RegExp(
        `(?:^|\\b)(?:for|department|team|use)\\s+${d.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      ).test(text) || text.trim().toLowerCase() === d.name.toLowerCase(),
  );
  const me = db.users.find((u) => u.id === c.request.requesterId);
  const dep =
    department ??
    (!c.request.departmentId ? db.departments.find((d) => d.id === me?.departmentId) : undefined);
  if (dep) {
    if (c.request.departmentId && c.request.departmentId !== dep.id) {
      c.request.budgetId = undefined;
      c.request.items.forEach((item) => {
        item.budgetId = undefined;
      });
    }
    c.request.departmentId = dep.id;
    c.request.businessUnit = dep.businessUnit;
    c.request.sources.department = department ? "confirmed" : "suggested";
  }
  const date = dateFromText(text);
  if (date) c.request.requiredBy = date;
  const project = db.org.projects.find((p) => text.toLowerCase().includes(p.toLowerCase()));
  if (project) c.request.project = project;
  const eligibleBudgets = db.budgets.filter(
    (b) => b.departmentId === c.request.departmentId && b.fiscalYear === db.org.fiscalYear,
  );
  const namedBudgets = eligibleBudgets.filter((b) =>
    text.toLowerCase().includes(b.name.toLowerCase().split("·")[0].trim()),
  );
  const budget = namedBudgets.length === 1 ? namedBudgets[0] : undefined;
  if (budget) {
    c.request.budgetId = budget.id;
    c.request.sources.budget = "confirmed";
    if (db.org.budgetLevel === "line")
      c.request.items.forEach((item) => {
        item.budgetId = budget.id;
      });
  }
}
/** Linear guided flow: ask one missing essential at a time, then add the item automatically. */
function review(db: DB, c: ProcurementConversation, lead = "") {
  const d = c.pending;
  if (!d) return;
  c.step = "manual-review";
  c.line = { name: d.name, qty: d.qty, unitPrice: d.unitPrice };
  const asked = (c.asked ??= []);
  const say = (field: NonNullable<ProcurementConversation["clarification"]>, text: string, options: Option[] = []) => {
    asked.push(field);
    c.clarification = field;
    ai(c, [lead, text].filter(Boolean).join("\n\n"), { options });
  };
  const label = `**${d.qty > 1 ? `${d.qty} × ` : ""}${d.name}**`;
  if (!d.description && d.itemType !== "Service" && !asked.includes("spec"))
    return say("spec", `Got it — ${label}. Any specific model or specs? _Optional_ — brand, size or configuration.`, [
      { label: "Any standard model", value: "skip" },
    ]);
  if (!parseQty(c.query) && !asked.includes("qty") && c.editingIndex === undefined)
    return say("qty", "**How many do you need?**", [1, 2, 5, 10].map((q) => ({ label: String(q), value: String(q) })));
  if (!d.vendorId) {
    const suppliers = approvedSuppliers(db, c.query);
    return say(
      "supplier",
      `**Supplier is required** — pick an approved supplier below or type a name.`,
      suppliers.map((v) => ({ label: v.name, value: `vendor:${v.id}`, hint: v.note })),
    );
  }
  if (d.unitPrice <= 0 && !asked.includes("price"))
    return say("price", "Roughly what does one cost? _Optional_ — an estimate is fine, procurement can confirm it later.", [
      { label: "Not sure yet", value: "skip" },
    ]);
  c.clarification = undefined;
  const added = confirmManual(db, c, d);
  Object.assign(c, added);
}
function showManual(
  db: DB,
  c: ProcurementConversation,
  kind?: string,
  historyKey?: string,
  overrides: Partial<ManualDetails> = {},
) {
  const initial = manualDefaults(db, c.request.requesterId, c.query, historyKey);
  c.pending = extractPurchase(db, c.query, initial.details);
  c.asked = [];
  if (!historyKey) {
    // A new product must not inherit an unrelated past item's specs, price or supplier.
    c.pending.name = purchaseName(c.query) || initial.details.name;
    c.basedOn = undefined;
    if (!c.pending.description || c.pending.description === initial.details.description)
      c.pending.description = "";
    if (c.pending.unitPrice === initial.details.unitPrice) c.pending.unitPrice = 0;
    // Quantity comes only from what the user said, never a past order.
    c.pending.qty =
      parseQty(c.query) || extractPurchase(db, c.query, { ...c.pending, qty: 0 }).qty || 1;
    if (c.pending.vendorId === initial.details.vendorId) c.pending.vendorId = "";
  }
  if (historyKey) c.basedOn = initial.basedOn;
  // A supplier named in the request text always wins.
  const named = vendorIn(db, c.query);
  if (named && !c.query.trim().toLowerCase().startsWith("vendor:")) c.pending.vendorId = named.id;
  Object.assign(c.pending, overrides);
  if (c.pending.vendorId) {
    const v = db.vendors.find((x) => x.id === c.pending?.vendorId);
    if (v) c.pending.name = stripVendor(c.pending.name, v.name) || c.pending.name;
  }
  c.supplierShopping = kind === "supplier";
  if (kind === "project") c.pending.itemType = "Service";
  c.line = { name: c.pending.name };
  const limitation =
    kind === "supplier"
      ? "Live supplier punch-out isn’t connected. I can prepare the request from the product or cart details you share, without placing an order."
      : "";
  if (c.pending.itemType === "Service" && !c.pending.description) {
    c.step = "clarify";
    c.clarification = "scope";
    ai(
      c,
      [
        limitation,
        "What should the supplier deliver? A short description is enough; share an estimate too if you have one.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      { options: [{ label: "Scope not decided yet", value: "skip" }] },
    );
  } else if (
    /^(service|project|item|supplier|consulting services|infrastructure project)$/i.test(
      c.pending.name,
    )
  ) {
    c.step = "clarify";
    c.clarification = "name";
    ai(
      c,
      [limitation, "What are you purchasing? Tell me the item or work you need."]
        .filter(Boolean)
        .join("\n\n"),
    );
  } else review(db, c, limitation);
}
function ready(db: DB, c: ProcurementConversation) {
  c.draftConfirmed = false;
  const item = c.request.items.at(-1);
  const prior = purchaseSuggestions(db, c.request.requesterId, c.query).find(
    (h) =>
      h.request.departmentId === c.request.departmentId &&
      db.budgets.some((b) => b.id === h.request.budgetId && b.fiscalYear === db.org.fiscalYear),
  );
  if (!c.request.budgetId && prior?.request.budgetId) {
    c.request.budgetId = prior.request.budgetId;
    c.request.sources.budget = "suggested";
  }
  if (db.org.budgetLevel === "line" && item && c.request.budgetId)
    item.budgetId = c.request.budgetId;
  askRequirements(db, c);
}
function askRequirements(db: DB, c: ProcurementConversation) {
  const missing = procurementDraftBlockers(c.request, db);
  c.step = "requirements";
  c.supplierFor = undefined;
  if (missing.length) {
    const noSupplier = missingSupplier(db, c);
    const target = noSupplier[0];
    if (target) {
      c.supplierFor = target.id;
      const options: Option[] = approvedSuppliers(db, target.name ?? c.query).map((v) => ({
        label: v.name,
        value: `vendor:${v.id}`,
        hint: v.note,
      }));
      ai(
        c,
        `**Supplier is required** for **${target.name}** before I can save the draft. Pick an approved supplier below or type a name.${noSupplier.length > 1 ? ` I’ll ask for the other ${noSupplier.length - 1} after this — or say “… for all”.` : ""}`,
        { options },
      );
      return;
    }
    ai(c, `I just need **${missing.join(", ")}** to save your draft.`);
    return;
  }
  c.draftConfirmed = true;
  c.step = "done";
  ai(
    c,
    `The item details are confirmed. I’m saving your draft now; you can review any remaining details there.\n\n${c.request.items.map((i) => `- **${i.qty} × ${i.name}** · ${i.unitPrice > 0 ? money(i.unitPrice * i.qty) : "Estimate pending"}`).join("\n")}`,
    {
      options: [
        { label: "Add another item", value: "more" },
      ],
    },
  );
}
/** The confirmation click is the boundary for suggested financial changes. */
export function confirmManual(
  db: DB,
  current: ProcurementConversation,
  details: ManualDetails,
): ProcurementConversation {
  const c = structuredClone(current);
  if (c.step !== "manual-review") return c;
  const error = validManualDetails(db, details);
  if (error) {
    ai(c, `${error} Tell me the correction in your own words.`);
    return c;
  }
  const item = {
    ...lineFrom(details),
    id: c.editingIndex === undefined ? id("li") : (c.request.items[c.editingIndex]?.id ?? id("li")),
  };
  if (c.editingIndex === undefined) c.request.items.push(item);
  else {
    const old = c.request.items[c.editingIndex];
    if (old) c.request.items[c.editingIndex] = { ...old, ...item };
  }
  if (details.project) c.request.project = details.project;
  if (details.quoteNo) c.request.quoteNo = details.quoteNo;
  retitle(c);
  c.pending = undefined;
  c.asked = [];
  c.clarification = undefined;
  c.line = null;
  c.editingIndex = undefined;
  c.basedOn = undefined;
  ready(db, c);
  return c;
}
export function approvedSuppliers(db: DB, query: string) {
  const words = productTerms(query).split(" ").filter(Boolean);
  const cats = new Set(
    db.catalog
      .filter((x) => words.some((w) => `${x.name} ${x.keywords.join(" ")}`.toLowerCase().includes(w)))
      .map((x) => x.category),
  );
  const ok = db.vendors.filter((v) => v.verified && v.contractActive);
  const ranked = [
    ...ok.filter((v) => v.categories.some((cat) => cats.has(cat))),
    ...ok.filter((v) => !v.categories.some((cat) => cats.has(cat)) && v.preferred),
  ];
  return ranked.slice(0, 3).map((v) => ({
    id: v.id,
    name: v.name,
    note: [v.preferred ? "Preferred" : "Approved", v.categories.slice(0, 2).join(", ")]
      .filter(Boolean)
      .join(" · "),
  }));
}
function notFound(db: DB, c: ProcurementConversation, query: string) {
  const name = purchaseName(query) || query;
  const suppliers = approvedSuppliers(db, query);
  c.step = "source";
  c.line = null;
  c.pending = undefined;
  ai(c, `I couldn’t find any **${name}** in our catalog.`, {
    search: { query: name, count: 0 },
    widget: suppliers.length ? "suppliers" : undefined,
    suppliers,
    followUp: `Tell me the exact model or specs${parseQty(query) ? "" : " and the quantity"}, and I’ll prepare the request${suppliers.length ? " — or pick a supplier above" : ""}. Nothing is created until you confirm.`,
    options: [
      ...suppliers.map((v) => ({ label: `Buy from ${v.name}`, value: `vendor:${v.id}` })),
      { label: "Describe it myself", value: "manual" },
    ],
  });
}
function showCatalog(db: DB, c: ProcurementConversation, query: string) {
  c.line = null;
  c.pending = undefined;
  c.step = "pick";
  const hits = matchCatalog(db, query);
  if (!hits.length) return notFound(db, c, query);
  ai(
    c,
    hits.length
      ? `I found ${hits.length} available catalog ${hits.length === 1 ? "match" : "matches"} for “${purchaseName(query)}”. ${purchaseSuggestions(db, c.request.requesterId, productTerms(query)).some((h) => hits.some((hit) => hit.id === h.item.catalogId)) ? "Items you’ve purchased before are shown first. " : ""}Choose the item that fits; I’ll use its current catalog price and supplier.`
      : `There’s no exact catalog match for “${purchaseName(query)}”. I won’t substitute a different product or size. I can prepare a custom purchase from your description, or you can refine the search.`,
    {
      widget: hits.length ? "catalog" : undefined,
      query: productTerms(query),
      search: { query: purchaseName(query), count: hits.length },
      options: [
        ...purchaseSuggestions(db, c.request.requesterId, productTerms(query))
          .slice(0, 1)
          .map((h) => ({
            label: "Start from my previous purchase",
            value: `repeat:${h.key}`,
            hint: h.request.id,
          })),
        { label: "Add through chat", value: "manual" },
        { label: "Supplier / punch-out", value: "supplier", hint: "Connection not available" },
      ],
    },
  );
}
function begin(db: DB, c: ProcurementConversation, text: string) {
  c.query = text;
  context(db, c, text);
  if (
    /\b(service|consulting|project|infrastructure|construction|renovation|migration|implementation|training)\b/i.test(
      text,
    )
  ) {
    showManual(db, c, "project");
    return;
  }
  if (/\b(punch.out|supplier cart)\b/i.test(text) || /https:\/\//i.test(text)) {
    showManual(db, c, "supplier");
    return;
  }
  const hits = matchCatalog(db, text);
  // A fully described custom purchase (with a price) goes straight to review.
  if (!hits.length && (/\$\s?\d/.test(text) || vendorIn(db, text))) {
    showManual(db, c);
    return;
  }
  if (!hits.length) return notFound(db, c, text);
  showCatalog(db, c, text);
}
export function converse(
  db: DB,
  current: ProcurementConversation,
  input: string,
  label?: string,
): ProcurementConversation {
  let c = structuredClone(current);
  const raw = input.trim();
  if (!raw) return c;
  const t = raw.toLowerCase();
  if (/\b(send|submit).*(approval|approve)\b/i.test(raw)) c.intent = "approval";
  c.messages.push({ id: id("m"), role: "user", text: label ?? raw });
  if (raw.startsWith("repeat:")) {
    showManual(db, c, undefined, raw.slice(7));
    return c;
  }
  if (raw === "edit-last" && c.request.items.length) {
    c.step = "done";
    ai(c, "What would you like to change?", {
      options: [{ label: "Keep it as is", value: "done" }],
    });
    return c;
  }
  switch (c.step) {
    case "item":
      begin(db, c, raw);
      break;
    case "source":
      const sourceVendor = vendorIn(db, raw);
      if (sourceVendor && (raw.startsWith("vendor:") || stripVendor(raw, sourceVendor.name).split(/\s+/).filter(Boolean).length <= 1)) {
        showManual(db, c, undefined, undefined, { vendorId: sourceVendor.id });
      } else if (isNewPurchase(db, raw, true)) {
        begin(db, c, raw);
      } else if (/^(catalog|catalogue|browse)$/.test(t)) showCatalog(db, c, c.query);
      else if (/^(manual|custom)$/.test(t)) showManual(db, c);
      else if (/^(supplier|punch.?out)$/.test(t)) showManual(db, c, "supplier");
      else {
        // Extra specs or quantity refine the same purchase instead of restarting.
        const base = purchaseName(c.query);
        const spec = sourceVendor ? stripVendor(raw, sourceVendor.name) : raw;
        const qty = answerQty(raw);
        c.query = `${c.query} ${raw}`;
        context(db, c, raw);
        showManual(db, c, undefined, undefined, {
          ...(sourceVendor ? { vendorId: sourceVendor.id } : {}),
          ...(qty ? { qty } : {}),
        });
        if (c.pending && base && !qty && spec && (c.step as Step) === "manual-review") {
          c.pending.name = base;
          if (!c.pending.description) c.pending.description = spec;
          c.messages.pop();
          c.asked = ["spec"];
          review(db, c);
        }
      }
      break;
    case "pick": {
      const chosen = db.catalog.find(
        (x) => x.available && (x.id === raw || x.name.toLowerCase() === t),
      );
      if (chosen) {
        const qty = parseQty(c.query);
        c.line = { catalogId: chosen.id, name: chosen.name, qty, unitPrice: chosen.price };
        c.step = "qty";
        ai(
          c,
          `${chosen.name} is ${money(chosen.price)} each. ${qty ? `Use ${qty} from your message?` : "How many do you need?"}`,
          {
            options: qty
              ? [{ label: `Use ${qty}`, value: String(qty) }]
              : [1, 2, 5].map((q) => ({ label: String(q), value: String(q) })),
          },
        );
      } else if (/^(supplier|punch.out)$/.test(t)) showManual(db, c, "supplier");
      else if (/manual|custom/.test(t)) showManual(db, c);
      else if (/^(catalog|catalogue)$/.test(t)) showCatalog(db, c, c.query);
      else if (vendorIn(db, raw) && !matchCatalog(db, raw).length) {
        // "Amazon" while browsing: buy the searched item from that supplier instead.
        showManual(db, c, undefined, undefined, { vendorId: vendorIn(db, raw)!.id });
      } else {
        c.query = raw;
        showCatalog(db, c, raw);
      }
      break;
    }
    case "qty": {
      const q = answerQty(raw) ?? parseQty(raw) ?? extractPurchase(db, raw, { qty: 0 } as ManualDetails).qty;
      const cat = db.catalog.find((x) => x.id === c.line?.catalogId && x.available);
      if (!q || !cat) {
        if (isNewPurchase(db, raw)) {
          switchTo(db, c, raw);
          break;
        }
        ai(c, "**How many do you need?** Type a number — or tell me what else you need.", {
          options: [1, 2, 5].map((n) => ({ label: String(n), value: String(n) })),
        });
        break;
      }
      c.request.items.push({
        id: id("li"),
        name: cat.name,
        description: cat.description,
        partNumber: cat.partNumber,
        account: cat.account,
        vendorId: cat.vendorId,
        uom: "EACH",
        qty: q,
        unitPrice: cat.price,
        tax: 0,
        shipping: 0,
        category: cat.category,
        catalogId: cat.id,
        source: "ai",
      });
      retitle(c);
      c.line = null;
      ready(db, c);
      break;
    }
    case "clarify": {
      if (!c.pending) break;
      if (raw !== "skip") {
        c.pending = extractPurchase(db, raw, c.pending);
        context(db, c, raw);
        if (c.clarification === "name") c.pending.name = purchaseName(raw);
        else c.pending.description = c.pending.description || raw;
      }
      c.clarification = undefined;
      review(db, c);
      break;
    }
    case "manual-review": {
      const field = c.clarification;
      if (c.pending && field && ["spec", "qty", "supplier", "price"].includes(field) && raw !== "confirm") {
        const d = c.pending;
        const v = raw === "skip" ? undefined : vendorIn(db, raw);
        // Answering a different question than asked (e.g. naming the supplier early) still counts.
        if (v) d.vendorId = v.id;
        const rest = v ? stripVendor(raw, v.name) : raw;
        if (field === "qty") {
          const q = answerQty(rest) ?? parseQty(rest) ?? (extractPurchase(db, rest, { ...d, qty: 0 }).qty || undefined);
          if (!q && !v) {
            if (isNewPurchase(db, raw)) {
              switchTo(db, c, raw);
              break;
            }
            ai(c, "**How many do you need?** Type a number like 2 or 10.", {
              options: [1, 2, 5, 10].map((n) => ({ label: String(n), value: String(n) })),
            });
            break;
          }
          if (q) {
            d.qty = q;
            c.query = `${c.query} ${q}`;
          } else c.asked = (c.asked ?? []).filter((a) => a !== "qty");
        } else if (field === "supplier") {
          if (!v) {
            if (raw !== "skip" && isNewPurchase(db, raw)) {
              switchTo(db, c, raw);
              break;
            }
            const q = answerQty(raw);
            if (q) d.qty = q;
            else {
              ai(
                c,
                `**${raw}** isn’t one of our approved suppliers. **Supplier is required** — pick one below, or tell me what else you need and we’ll come back to it.`,
                {
                  options: approvedSuppliers(db, c.query).map((x) => ({
                    label: x.name,
                    value: `vendor:${x.id}`,
                    hint: x.note,
                  })),
                },
              );
              break;
            }
          }
        } else if (field === "price") {
          const m = rest.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
          if (raw !== "skip" && m) d.unitPrice = Number(m[0]);
          else if (raw !== "skip" && !v && isNewPurchase(db, raw)) {
            switchTo(db, c, raw);
            break;
          }
        } else if (field === "spec" && raw !== "skip") {
          if (isNewPurchase(db, raw, true)) {
            switchTo(db, c, raw);
            break;
          }
          if (rest) {
            const next = extractPurchase(db, rest, d);
            next.name = d.name;
            next.description = rest;
            if (v) next.vendorId = v.id;
            c.pending = next;
          }
        }
        c.clarification = undefined;
        review(db, c);
        break;
      }
      if (raw === "confirm" && c.pending) {
        c = confirmManual(db, c, c.pending);
        break;
      }
      if (raw === "change") {
        ai(c, "What should I change? Tell me in your own words.");
        break;
      }
      if (/^(catalog|catalogue)$/.test(t)) {
        showCatalog(db, c, c.query);
        break;
      }
      if (!c.pending) break;
      const next = extractPurchase(db, raw, c.pending);
      context(db, c, raw);
      if (JSON.stringify(next) === JSON.stringify(c.pending)) {
        ai(
          c,
          "I couldn’t identify the change reliably. Tell me the quantity, price, supplier, or use “scope: …” or “call it …”. I’ll leave the current suggestion unchanged.",
          { options: [{ label: "Use this item", value: "confirm" }] },
        );
      } else {
        c.pending = next;
        review(db, c, "Updated the suggestion. Your proposal won’t change until you confirm.");
      }
      break;
    }
    case "requirements": {
      if (raw === "confirm-request") {
        if (procurementDraftBlockers(c.request, db).length) {
          askRequirements(db, c);
          break;
        }
        c.draftConfirmed = true;
        c.step = "done";
        ai(
          c,
          "Your details are confirmed. I’m creating your draft now; I’ll show the request number once it has saved.",
          { options: [{ label: "Add another item", value: "more" }] },
        );
        break;
      }
      if (raw === "more") {
        c.step = "item";
        ai(c, "What else do you need?");
        break;
      }
      const chosen = vendorIn(db, raw);
      if (chosen && !isNewPurchase(db, stripVendor(raw, chosen.name), true)) {
        const updated = applySupplier(db, c, chosen.id, raw);
        const lead = `**${chosen.name}** set as supplier for ${updated.map((l) => `**${l.name}**`).join(", ")}.`;
        askRequirements(db, c);
        const last = c.messages.at(-1);
        if (last?.role === "ai") last.text = `${lead}\n\n${last.text}`;
        break;
      }
      if (isNewPurchase(db, raw)) {
        begin(db, c, raw);
        break;
      }
      if (
        raw.split(/\s+/).length <= 3 &&
        !/\d|\b(change|make|set|call|rename|qty|quantity|price|scope|need it|tomorrow|next week|budget|done|review)\b/i.test(raw) &&
        c.supplierFor
      ) {
        const item = c.request.items.find((l) => l.id === c.supplierFor);
        ai(
          c,
          `**${raw}** isn’t one of our approved suppliers. **Supplier is required** for **${item?.name ?? "this item"}** — pick one below, or keep adding items and finish it in the draft.`,
          {
            options: approvedSuppliers(db, item?.name ?? c.query).map((v) => ({
              label: v.name,
              value: `vendor:${v.id}`,
              hint: v.note,
            })),
          },
        );
        break;
      }
      // Corrections use the same staged financial boundary as saved proposals.
      c.step = "done";
      const next = converse(db, c, raw, label);
      next.messages.splice(c.messages.length, 1);
      if (next.step === "done") {
        next.messages.pop();
        askRequirements(db, next);
      }
      return next;
    }
    case "done": {
      if (/\b(send|submit).*(approval|approve)\b/i.test(raw)) {
        ai(
          c,
          "Use Send for approval in the summary to confirm submission. I’ll check the remaining requirements before sending; nothing is ordered.",
        );
        break;
      }
      if (/^(more|add another item)$/.test(t)) {
        c.step = "item";
        ai(c, "What else do you need?");
        break;
      }
      if (/^(done|no|review|that's all)$/.test(t)) {
        if (!c.draftConfirmed) askRequirements(db, c);
        else
          ai(
            c,
            "Your draft is saved. Review request opens it for a final check. If you want approval next, tell me “send for approval”; you’ll still confirm with a button.",
          );
        break;
      }
      const doneVendor = vendorIn(db, raw);
      if (doneVendor && c.request.items.length && !isNewPurchase(db, stripVendor(raw, doneVendor.name), true)) {
        const updated = applySupplier(db, c, doneVendor.id, raw);
        const lead = `**${doneVendor.name}** set as supplier for ${updated.map((l) => `**${l.name}**`).join(", ")}.`;
        askRequirements(db, c);
        const last = c.messages.at(-1);
        if (last?.role === "ai") last.text = `${lead}\n\n${last.text}`;
        break;
      }
      const index = c.request.items.length - 1;
      const item = c.request.items[index];
      if (
        item &&
        /^(change|make|set|use|call|rename|quantity|qty|price|scope|supplier|need it|by |for )|\b(?:instead|each|per hour|budget|tomorrow|next week)\b|\d{4}-\d{2}-\d{2}/i.test(
          raw,
        )
      ) {
        const base: ManualDetails = {
          name: item.name ?? item.description,
          description: item.description,
          qty: item.qty,
          unitPrice: item.unitPrice,
          vendorId: item.vendorId,
          category: item.category,
          account: item.account,
          uom: item.uom,
          itemType: item.itemType ?? "Material",
          project: c.request.project,
          webLink: item.webLink ?? "",
          quoteNo: c.request.quoteNo,
        };
        const next = extractPurchase(db, raw, base);
        const previousContext = JSON.stringify([
          c.request.departmentId,
          c.request.requiredBy,
          c.request.project,
          c.request.budgetId,
        ]);
        context(db, c, raw);
        if (JSON.stringify(next) !== JSON.stringify(base)) {
          c.pending = next;
          c.editingIndex = index;
          review(db, c, "Here’s the proposed change.");
        } else if (
          previousContext !==
          JSON.stringify([
            c.request.departmentId,
            c.request.requiredBy,
            c.request.project,
            c.request.budgetId,
          ])
        )
          ai(c, "Updated the request details in your proposal.");
        else
          ai(
            c,
            "I couldn’t confidently identify that change. Specify a quantity, price, supplier, project, or delivery date.",
          );
      } else begin(db, c, raw);
      break;
    }
  }
  return c;
}
