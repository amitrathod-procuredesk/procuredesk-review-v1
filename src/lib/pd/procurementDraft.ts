import { lineBudgetId, budgetLevelOf, nowISO, runChecks } from "./engine";
import type { DB, PRequest } from "./types";

/** One replay-safe draft per conversation, including optimistic-version conflicts. */
export function applyProcurementDraft(db: DB, proposal: PRequest, userId: string, key: string) {
  if (!db.users.some((u) => u.id === userId && u.active))
    throw new Error("Sign in again before saving this request.");
  if (!proposal.items.length)
    throw new Error("Tell me at least one item to purchase before I create a draft.");
  const missing = procurementDraftBlockers(proposal, db);
  if (missing.length) throw new Error(`Before creating a draft, provide ${missing.join(", ")}.`);
  const existing = db.requests.find((r) => r.activity.some((a) => a.id === key));
  if (existing && (existing.requesterId !== userId || existing.status !== "draft"))
    throw new Error(
      "This request is no longer editable here. Open it to check its current status.",
    );
  const at = nowISO();
  const copy = structuredClone(proposal);
  if (existing) {
    Object.assign(existing, copy, {
      id: existing.id,
      activity: existing.activity,
      createdAt: existing.createdAt,
      updatedAt: at,
      status: "draft",
      route: [],
    });
  } else {
    do {
      db.seq += 1;
    } while (db.requests.some((r) => r.id === `REQ-${db.seq}`));
    db.requests.unshift({
      ...copy,
      id: `REQ-${db.seq}`,
      requesterId: userId,
      status: "draft",
      route: [],
      createdAt: at,
      updatedAt: at,
      activity: [
        { id: key, at, text: "Draft created with Procurement AI", kind: "create", actorId: userId },
      ],
      ai: { ...copy.ai, messages: [], pending: null },
    });
  }
}

/** Only item essentials gate a draft; administrative and pricing checks gate approval. */
export function procurementDraftBlockers(r: PRequest, db: DB): string[] {
  const missing: string[] = [];
  if (!r.items.length) missing.push("at least one item");
  for (const l of r.items) {
    if (!l.name?.trim()) missing.push("an item name");
    if (!Number.isFinite(l.qty) || l.qty <= 0) missing.push(`${l.name || "Item"}: quantity`);
    if (l.fulfillment !== "inventory" && !db.vendors.some((v) => v.id === l.vendorId))
      missing.push(`${l.name || "Item"}: supplier`);
  }
  return missing;
}

export function procurementBlockers(r: PRequest, db: DB): string[] {
  const missing: string[] = [];
  if (!r.title.trim()) missing.push("a request title");
  if (!r.departmentId) missing.push("your department");
  if (!r.requiredBy) missing.push("a delivery date");
  if (budgetLevelOf(r, db) === "header" && !r.budgetId) missing.push("a budget");
  if (!r.items.length) missing.push("at least one item");
  r.items.forEach((l, i) => {
    const label = l.name || `Item ${i + 1}`;
    if (
      budgetLevelOf(r, db) === "line" &&
      !l.declined &&
      l.fulfillment !== "inventory" &&
      !lineBudgetId(l, r, db)
    )
      missing.push(`${label}: budget`);
    if (!l.description.trim()) missing.push(`${label}: description or scope`);
    if (!l.vendorId) missing.push(`${label}: supplier`);
    if (!(l.unitPrice > 0)) missing.push(`${label}: price`);
    if (!(l.qty > 0)) missing.push(`${label}: quantity`);
  });
  return [
    ...missing,
    ...runChecks(r, db)
      .filter((c) => c.level === "error" && c.id !== "req")
      .map((c) => c.detail || c.title),
  ];
}
