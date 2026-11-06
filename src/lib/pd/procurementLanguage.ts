import type { DB } from "./types";
import type { ManualDetails } from "./procurementSuggestions";

/** Conservative extraction: only literal input or configured organization values. */
export function extractPurchase(db: DB, text: string, base: ManualDetails): ManualDetails {
  const d = { ...base };
  const numeric = "([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)";
  const price = text.match(
    new RegExp(
      `(?:\\$|USD\\s*|unit price\\s*(?:is|to|of)?\\s*|price\\s*(?:is|to|of)?\\s*)${numeric}`,
      "i",
    ),
  );
  const rate = text.match(new RegExp(`${numeric}\\s*(?:dollars?|USD)\\s*(?:each|per|a)?`, "i"));
  const qty =
    text.match(
      /(?:quantity|qty|make (?:it|that)|change (?:it|quantity) to)\s*(?:is|to|of)?\s*(\d+(?:\.\d+)?)/i,
    ) ??
    text.match(
      /\b(\d+(?:\.\d+)?)\s*(hours?|months?|licenses?|units?|pieces?|laptops?|monitors?|desks?|widgets?|valves?)\b/i,
    ) ??
    text.match(/^(?:i\s+)?(?:need|buy|order|purchase|want to buy)\s+(\d+(?:\.\d+)?)\s+/i);
  if (qty) d.qty = Number(qty[1]);
  if (price || rate) d.unitPrice = Number((price?.[1] ?? rate?.[1] ?? "0").replaceAll(",", ""));
  const total = text.match(
    new RegExp(`(?:total|budget|estimate)\\s*(?:is|of|to)?\\s*\\$?${numeric}`, "i"),
  );
  if (total && !price && !rate && d.qty > 0)
    d.unitPrice = Number(total[1].replaceAll(",", "")) / d.qty;
  if (/\bhours?\b|per hour|\/hour/i.test(text)) d.uom = "HOUR";
  else if (/\bmonths?\b|per month|\/month/i.test(text)) d.uom = "MONTH";
  else if (/\blicenses?\b/i.test(text)) {
    d.uom = "LICENSE";
    d.itemType = "Software";
  }
  const vendor = db.vendors.find((v) =>
    new RegExp(`\\b${v.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text),
  );
  if (vendor) d.vendorId = vendor.id;
  if (/\b(no supplier|supplier unknown|source later)\b/i.test(text)) d.vendorId = "";
  if (/\b(price unknown|no price|estimate pending)\b/i.test(text)) d.unitPrice = 0;
  const project = db.org.projects.find((p) => text.toLowerCase().includes(p.toLowerCase()));
  if (project) d.project = project;
  const category = db.catalog
    .map((i) => i.category)
    .find((v) => text.toLowerCase().includes(v.toLowerCase()));
  if (category) d.category = category;
  const account = db.catalog
    .map((i) => i.account)
    .filter(Boolean)
    .find((v) => text.toLowerCase().includes(v.toLowerCase()));
  if (account) d.account = account;
  const url = text.match(/https:\/\/[^\s<>]+/i)?.[0];
  if (url) d.webLink = url.replace(/[.,;]$/, "");
  const quote = text.match(/quote\s*(?:#|reference|number)?\s*[:=]?\s*([A-Z0-9][A-Z0-9-]*)/i);
  if (quote) d.quoteNo = quote[1];
  const scope = text.match(/(?:scope|deliverables?|description)\s*[:=]\s*(.+)/i);
  if (scope) d.description = scope[1];
  const name = text.match(/(?:call it|rename (?:it )?to|item name\s*:)\s*(.+?)(?:[,;]|$)/i);
  if (name) d.name = name[1].trim();
  return d;
}

export function purchaseName(text: string): string {
  return text
    .replace(
      /^(?:(?:i|we)\s+)?(?:also\s+|and\s+|plus\s+)?(?:(?:would like|want to buy|need|want|buy|purchase|order|add|get)\b)?\s*/i,
      "",
    )
    .replace(/^\d+\s+/, "")
    .split(/[,;]|\s+(?:from|at|for|by|with|scope:)\s+|\s+\$/i)[0]
    .trim();
}

export function dateFromText(text: string): string | undefined {
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso && !Number.isNaN(new Date(iso).getTime())) return iso;
  const d = new Date();
  const weeks = text.match(/(?:in|within)\s+(\d+|one|two)\s+weeks?/i);
  if (weeks)
    d.setDate(
      d.getDate() +
        (weeks[1].toLowerCase() === "one"
          ? 1
          : weeks[1].toLowerCase() === "two"
            ? 2
            : Number(weeks[1])) *
          7,
    );
  else if (/\bnext week\b/i.test(text)) d.setDate(d.getDate() + 7);
  else if (/\btomorrow\b/i.test(text)) d.setDate(d.getDate() + 1);
  else return undefined;
  return d.toISOString().slice(0, 10);
}
