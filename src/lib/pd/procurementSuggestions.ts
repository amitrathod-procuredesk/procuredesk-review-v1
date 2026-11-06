import type { DB, LineItem, PRequest } from "./types";

export type PurchaseSuggestion = { key: string; request: PRequest; item: LineItem };

/** Personal recommendations never read another requester's purchases. */
export function purchaseSuggestions(db: DB, userId: string, query = ""): PurchaseSuggestion[] {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 2 &&
        !["want", "buy", "need", "the", "for", "some", "purchase", "order"].includes(t),
    )
    .map((t) => t.replace(/s$/, ""));
  const seen = new Set<string>();
  return db.requests
    .filter(
      (r) =>
        r.requesterId === userId && !["rejected", "cancelled", "order_deleted"].includes(r.status),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .flatMap((request) =>
      request.items
        .filter((item) => !item.declined && item.fulfillment !== "inventory")
        .map((item) => ({ key: `${request.id}:${item.id}`, request, item })),
    )
    .filter(({ item }) => {
      const catalog = db.catalog.find((c) => c.id === item.catalogId);
      // Product mentions in accessory descriptions are not a recommendation match.
      const hay =
        `${item.name ?? ""} ${item.category} ${catalog?.keywords.join(" ") ?? ""}`.toLowerCase();
      const key = `${item.name ?? item.description}:${item.vendorId}`;
      if (seen.has(key) || (terms.length && !terms.some((t) => hay.includes(t)))) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

export type ManualDetails = {
  name: string;
  description: string;
  qty: number;
  unitPrice: number;
  vendorId: string;
  category: string;
  account: string;
  uom: string;
  itemType: string;
  project: string;
  webLink: string;
  quoteNo: string;
};

export function manualDefaults(
  db: DB,
  userId: string,
  query: string,
  historyKey?: string,
): { details: ManualDetails; basedOn?: string } {
  const history = purchaseSuggestions(db, userId, historyKey ? "" : query);
  const prior = historyKey ? history.find((h) => h.key === historyKey) : history[0];
  const item = prior?.item;
  const service = /\b(service|consulting|maintenance|subscription|training)\b/i.test(query);
  const project =
    /\b(project|infrastructure|construction|renovation|migration|implementation)\b/i.test(query);
  const knownProject = db.org.projects.find((p) => query.toLowerCase().includes(p.toLowerCase()));
  return {
    basedOn: prior?.request.id,
    details: {
      name:
        item?.name ??
        query.replace(/^(i\s+)?(want to buy|need|want|buy|purchase|order)\s+/i, "").trim(),
      description: item?.description ?? "",
      qty: item?.qty ?? 1,
      unitPrice: item?.unitPrice ?? 0,
      vendorId: db.vendors.some((v) => v.id === item?.vendorId) ? (item?.vendorId ?? "") : "",
      category:
        item?.category ??
        (service ? "Professional Services" : project ? "Furniture & Facilities" : ""),
      account: item?.account ?? "",
      uom: item?.uom ?? (service ? "HOUR" : "EACH"),
      itemType: item?.itemType ?? (project || service ? "Service" : "Material"),
      project:
        knownProject ??
        (prior?.request.project && db.org.projects.includes(prior.request.project)
          ? prior.request.project
          : ""),
      webLink: "",
      quoteNo: "",
    },
  };
}

export function validManualDetails(db: DB, d: ManualDetails): string | undefined {
  if (!d.name.trim()) return "Enter an item or service name.";
  if (!Number.isFinite(d.qty) || d.qty <= 0) return "Quantity must be greater than zero.";
  if (!Number.isFinite(d.unitPrice) || d.unitPrice < 0)
    return "Enter a non-negative estimate, or leave it at 0 if unknown.";
  if (d.vendorId && !db.vendors.some((v) => v.id === d.vendorId))
    return "Choose a supplier from your organization, or leave it unassigned.";
  if (d.webLink) {
    try {
      if (new URL(d.webLink).protocol !== "https:")
        return "Use a secure https supplier or product link.";
    } catch {
      return "Enter a valid https supplier or product link.";
    }
  }
  return undefined;
}
