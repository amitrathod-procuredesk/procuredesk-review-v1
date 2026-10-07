/**
 * Procurement copilot: deterministic intent parser grounded only in org data
 * (catalog, departments, budgets). It prepares a draft; it never submits.
 */
import type { CatalogItem, DB, PRequest } from "./types";
import { budgetStatus, money, runChecks, totals, uid } from "./engine";
import { log } from "./store";

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };
const GENERIC = new Set(["laptop", "monitor", "display", "screen"]);

export function parseQty(t: string): number | null {
  const m = t.match(/\b(\d{1,4})\s*(?:x\s*)?(?=[a-z"])/i) ?? t.match(/\b(\d{1,4})\b/);
  if (m) return Number(m[1]);
  for (const w of t.toLowerCase().split(/\s+/)) if (NUM[w] && w !== "a" && w !== "an") return NUM[w];
  return null;
}

export function searchCatalog(db: DB, t: string): CatalogItem[] {
  const lower = t.toLowerCase();
  const specific = db.catalog.filter((c) => c.keywords.some((k) => !GENERIC.has(k) && lower.includes(k)));
  if (specific.length) return specific;
  return db.catalog.filter((c) => c.keywords.some((k) => lower.includes(k)));
}

const findDept = (db: DB, t: string) => {
  const l = t.toLowerCase();
  return db.departments.find((d) => l.includes(d.name.toLowerCase()) || l.includes(d.name.toLowerCase().slice(0, 6)));
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
export function parseDate(t: string): string | null {
  const l = t.toLowerCase();
  const now = new Date();
  const m = l.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  if (l.includes("next month")) return iso(new Date(now.getFullYear(), now.getMonth() + 1, 1, 12));
  if (l.includes("tomorrow")) return iso(new Date(now.getTime() + 86400000));
  if (/2 weeks|two weeks/.test(l)) return iso(new Date(now.getTime() + 14 * 86400000));
  if (l.includes("next week")) return iso(new Date(now.getTime() + 7 * 86400000));
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mm = l.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
  if (mm) {
    const mi = months.indexOf(mm[1]);
    let y = now.getFullYear();
    if (mi < now.getMonth()) y += 1;
    return iso(new Date(y, mi, Number(mm[2]), 12));
  }
  return null;
}

export function smartTitle(text: string) {
  let t = text.trim().replace(/[.!?]+$/, "");
  t = t.replace(/^(hi|hello|hey)[,\s]+/i, "").replace(/^(i|we)\s+(need|want|would like)\s+(to\s+(buy|order|get)\s+)?/i, "").replace(/^(please\s+)?(buy|order|get me|get)\s+/i, "");
  t = t.replace(/^(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+/i, "");
  t = t.replace(/\b(our|my|the)\s+/gi, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const nextMonthLabel = () => {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() + 1, 1);
  return `Next month (${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
};

function say(r: PRequest, text: string, extra: Partial<PRequest["ai"]["messages"][number]> = {}) {
  r.ai.messages.push({ id: uid("m"), role: "ai", text, ...extra });
}

function addCatalogLine(db: DB, r: PRequest, c: CatalogItem) {
  r.items.push({
    id: uid("li"),
    description: c.name,
    partNumber: c.partNumber,
    account: c.account,
    vendorId: c.vendorId,
    uom: "EACH",
    qty: r.ai.qty || 1,
    unitPrice: c.price,
    tax: 0,
    shipping: 0,
    category: c.category,
    catalogId: c.id,
    source: "ai",
  });
  log(r, `AI added catalog item: ${r.ai.qty} × ${c.name} (${db.vendors.find((v) => v.id === c.vendorId)?.name})`, "ai");
}

function addFreeLine(r: PRequest) {
  r.items.push({
    id: uid("li"),
    description: smartTitle(r.ai.rawItem) || "New item",
    partNumber: "",
    account: "",
    vendorId: "",
    uom: "EACH",
    qty: r.ai.qty || 1,
    unitPrice: 0,
    tax: 0,
    shipping: 0,
    category: "",
    source: "ai",
  });
  log(r, "AI created a non-catalog line item", "ai");
}

function continueFlow(db: DB, r: PRequest) {
  r.ai.pending = null;
  if (r.items.length === 0) {
    say(r, "What do you need to buy?");
    return;
  }
  if (!r.departmentId) {
    const me = db.users.find((u) => u.id === r.requesterId);
    const mine = db.departments.find((d) => d.id === me?.departmentId);
    const opts = [mine, ...db.departments.filter((d) => d.id !== mine?.id)].filter(Boolean).map((d) => d!.name);
    say(r, "Which team is this for?", { kind: "choice", options: opts });
    r.ai.pending = "department";
    return;
  }
  if (!r.requiredBy) {
    say(r, "When do you need it by?", { kind: "choice", options: [nextMonthLabel(), "In 2 weeks", "Next week", "I'll pick a date"] });
    r.ai.pending = "date";
    return;
  }
  finalize(db, r);
}

function finalize(db: DB, r: PRequest) {
  const cat = r.items.find((i) => i.category)?.category;
  if (!r.budgetId) {
    const candidates = db.budgets.filter((b) => b.departmentId === r.departmentId && (!cat || b.category === cat));
    const pick = candidates[0] ?? db.budgets.find((b) => b.departmentId === r.departmentId);
    if (pick) {
      r.budgetId = pick.id;
      r.sources.budget = "suggested";
      log(r, `AI suggested budget ${pick.name}`, "ai");
    }
  }
  const t = totals(r).total;
  const b = budgetStatus(r, db);
  const checks = runChecks(r, db).filter((c) => c.level !== "ok");
  const vendors = [...new Set(r.items.map((i) => db.vendors.find((v) => v.id === i.vendorId)?.name).filter(Boolean))];
  let text = `Your request is ready to review: ${r.items.length} item${r.items.length > 1 ? "s" : ""}${vendors.length ? ` from ${vendors.join(", ")}` : ""}, total ${money(t)}.`;
  if (b) text += b.over ? ` This exceeds ${b.budget.name} by ${money(-b.remaining)} — you can choose another budget or request an exception.` : ` It fits within ${b.budget.name}.`;
  if (checks.length) text += ` ${checks.length} check${checks.length > 1 ? "s need" : " needs"} attention on the right.`;
  say(r, text, { kind: "done" });
  log(r, "AI completed structured request", "ai");
}

export function respond(db: DB, r: PRequest, text: string) {
  const ai = r.ai;
  const lower = text.toLowerCase().trim();
  ai.messages.push({ id: uid("m"), role: "user", text });

  switch (ai.pending) {
    case "item": {
      if (/something else|other|none/.test(lower)) {
        ai.pending = "nomatch";
        say(r, "No problem. Should I create a non-catalog item, or will you describe it differently?", { kind: "nomatch", options: ["Create non-catalog item", "Try another description"] });
        return;
      }
      const pick = db.catalog.find((c) => ai.candidateIds.includes(c.id) && lower.includes(c.name.toLowerCase().slice(0, 10)));
      if (!pick) {
        say(r, "I didn't catch which one. Please pick an option.", { kind: "choice", options: ai.candidateIds.map((id) => db.catalog.find((c) => c.id === id)!.name).concat("Something else") });
        return;
      }
      addCatalogLine(db, r, pick);
      return continueFlow(db, r);
    }
    case "catalog": {
      const c = db.catalog.find((x) => x.id === ai.candidateIds[0]);
      if (lower.startsWith("use") && c) {
        addCatalogLine(db, r, c);
        return continueFlow(db, r);
      }
      if (lower.startsWith("compare") && c) {
        const alts = db.catalog.filter((x) => x.category === c.category && x.keywords.some((k) => c.keywords.includes(k)));
        ai.candidateIds = alts.map((a) => a.id);
        ai.pending = "item";
        say(r, `Here are ${alts.length} comparable catalog options.`, { kind: "catalog", catalogIds: ai.candidateIds, options: alts.map((a) => a.name).concat("Something else") });
        return;
      }
      addFreeLine(r);
      return continueFlow(db, r);
    }
    case "nomatch": {
      if (lower.includes("try another")) {
        ai.pending = null;
        say(r, "Describe the item differently — a brand, model, or what it's used for helps.");
        return;
      }
      if (lower.includes("search supplier")) {
        const list = db.vendors.filter((v) => v.verified).map((v) => v.name).join(", ");
        say(r, `Verified suppliers you can use: ${list}. I've added a non-catalog line — pick the supplier in the table.`);
      }
      addFreeLine(r);
      return continueFlow(db, r);
    }
    case "department": {
      const d = findDept(db, text);
      if (!d) {
        say(r, "I couldn't match that to a department. Please pick one.", { kind: "choice", options: db.departments.map((x) => x.name) });
        return;
      }
      r.departmentId = d.id;
      r.businessUnit = d.businessUnit;
      r.sources.department = "confirmed";
      return continueFlow(db, r);
    }
    case "date": {
      if (lower.includes("pick")) {
        r.sources.requiredBy = "needs";
        say(r, "Set the date in the “Required by” field when you're ready.");
        ai.pending = null;
        finalize(db, r);
        return;
      }
      const dt = parseDate(text);
      if (!dt) {
        say(r, "I couldn't read that date. Try “Nov 1” or “next month”.", { kind: "choice", options: [nextMonthLabel(), "In 2 weeks", "I'll pick a date"] });
        return;
      }
      r.requiredBy = dt;
      r.sources.requiredBy = "confirmed";
      return continueFlow(db, r);
    }
  }

  // Fresh intent
  const qty = parseQty(text) ?? 1;
  ai.qty = qty;
  ai.rawItem = text;
  if (!r.title) {
    r.title = smartTitle(text);
    r.sources.title = "suggested";
  }
  const d = findDept(db, text);
  if (d) {
    r.departmentId = d.id;
    r.businessUnit = d.businessUnit;
    r.sources.department = "confirmed";
  }
  const dt = parseDate(text);
  if (dt) {
    r.requiredBy = dt;
    r.sources.requiredBy = "confirmed";
  }
  if (!r.project && /new hire|onboard|hiring|starting/.test(lower)) {
    r.project = db.org.projects.find((p) => /hiring/i.test(p)) ?? "";
    if (r.project) r.sources.project = "suggested";
  }
  log(r, `AI interpreted request: “${text}”`, "ai");

  const matches = searchCatalog(db, text);
  if (matches.length === 1) {
    ai.candidateIds = [matches[0].id];
    ai.pending = "catalog";
    say(r, "I found a matching item in your company catalog.", { kind: "catalog", catalogIds: [matches[0].id], options: ["Use catalog item", "Compare options", "Enter manually"] });
  } else if (matches.length > 1) {
    ai.candidateIds = matches.map((m) => m.id);
    ai.pending = "item";
    const noun = GENERIC.has("laptop") && lower.includes("laptop") ? "laptop configuration" : "item";
    say(r, `I'm not sure which ${noun} you need. These match your catalog:`, { kind: "unsure", catalogIds: ai.candidateIds, options: matches.map((m) => m.name).concat("Something else") });
  } else {
    ai.pending = "nomatch";
    say(r, "I couldn't find an exact match in your catalog.", { kind: "nomatch", options: ["Create non-catalog item", "Search suppliers", "Try another description"] });
  }
}

export function thinkingSteps(r: PRequest): string[] {
  switch (r.ai.pending) {
    case null:
      return ["Analyzing your request…", "Checking your catalog…", "Checking budget and policy…"];
    case "date":
    case "department":
      return ["Updating request…", "Checking budget and policy…"];
    default:
      return ["Updating request…"];
  }
}
