import { z } from "zod";
import { computeRoute, totals } from "./engine";
import { procurementProposal } from "./procurementAi";
import {
  procurementBlockers,
  procurementDraftBlockers,
  applyProcurementDraft,
} from "./procurementDraft";
import { ACCOUNTS, CATEGORIES, type DB, type PRequest } from "./types";

const nullableText = z.string().trim().max(2000).nullable();
export const agentItemSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  catalogId: nullableText,
  supplierId: nullableText,
  quantity: z.number().positive().max(1000000).nullable(),
  unit: z.string().max(50).nullable(),
  unitPrice: z.number().nonnegative().max(100000000).nullable(),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  budgetId: nullableText,
  productLink: z.string().max(2000).nullable(),
});
export const agentProposalSchema = z.object({
  items: z.array(agentItemSchema).max(40),
  title: z.string().max(200),
  departmentId: nullableText,
  budgetId: nullableText,
  requiredBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  shipTo: nullableText,
  project: nullableText,
});
export type AgentProposal = z.infer<typeof agentProposalSchema>;
export type AgentItem = z.infer<typeof agentItemSchema>;
export type AgentChoice = { label: string; message: string };
export type AgentPart =
  | { type: "text"; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      status: "running" | "done" | "error";
      summary: string;
    }
  | {
      type: "catalog";
      items: { id: string; name: string; description: string; supplier: string; price: number }[];
    }
  | {
      type: "suppliers";
      items: { id: string; name: string; categories: string[]; preferred: boolean }[];
    }
  | { type: "choices"; choices: AgentChoice[] }
  | { type: "proposal"; proposal: AgentProposal; preview: AgentPreview };
export type AgentMessage = { id: string; role: "user" | "assistant"; parts: AgentPart[] };
export type AgentPreview = {
  draftMissing: string[];
  approvalMissing: string[];
  total: number;
  approvers: string[];
  fingerprint: string;
};
export const emptyAgentProposal = (): AgentProposal => ({
  items: [],
  title: "",
  departmentId: null,
  budgetId: null,
  requiredBy: null,
  shipTo: null,
  project: null,
});

/** Model suggestions cannot supply catalog prices, unavailable products or invented record IDs. */
export function normalizeAgentProposal(db: DB, input: AgentProposal): AgentProposal {
  const proposal = agentProposalSchema.parse(input);
  const ids = new Set<string>();
  for (const item of proposal.items) {
    if (ids.has(item.id)) throw new Error("Each item needs its own identifier.");
    ids.add(item.id);
    if (item.catalogId) {
      const c = db.catalog.find((x) => x.id === item.catalogId && x.available);
      if (!c) throw new Error(`${item.name} is no longer available in the catalog.`);
      Object.assign(item, {
        name: c.name,
        description: c.description,
        supplierId: c.vendorId,
        unitPrice: c.price,
        category: c.category,
        unit: "EACH",
      });
    }
    if (
      item.supplierId &&
      !db.vendors.some((v) => v.id === item.supplierId && v.verified && v.contractActive)
    )
      throw new Error(`${item.name}: choose an eligible organization supplier.`);
    if (
      item.budgetId &&
      !db.budgets.some((b) => b.id === item.budgetId && b.departmentId === proposal.departmentId)
    )
      throw new Error(`${item.name}: choose a budget for the selected department.`);
    if (item.productLink && !/^https:\/\//i.test(item.productLink))
      throw new Error("Product links must start with https://.");
  }
  if (proposal.departmentId && !db.departments.some((d) => d.id === proposal.departmentId))
    throw new Error("Choose an existing department.");
  if (
    proposal.budgetId &&
    !db.budgets.some((b) => b.id === proposal.budgetId && b.departmentId === proposal.departmentId)
  )
    throw new Error("Choose a budget for the selected department.");
  if (proposal.shipTo && !db.org.shipTo.includes(proposal.shipTo))
    throw new Error("Choose an organization delivery location.");
  if (
    proposal.requiredBy &&
    (!Number.isFinite(Date.parse(proposal.requiredBy)) ||
      new Date(proposal.requiredBy).toISOString().slice(0, 10) !== proposal.requiredBy)
  )
    throw new Error("Choose a valid delivery date.");
  return proposal;
}

export function agentRequest(db: DB, input: AgentProposal, userId: string): PRequest {
  const p = normalizeAgentProposal(db, input);
  const r = procurementProposal(db, userId);
  Object.assign(r, {
    title:
      p.title ||
      p.items
        .map((i) => i.name)
        .join(" and ")
        .slice(0, 200),
    departmentId: p.departmentId ?? undefined,
    budgetId: p.budgetId ?? undefined,
    requiredBy: p.requiredBy ?? undefined,
    shipTo: p.shipTo ?? "",
    project: p.project ?? "",
    businessUnit: db.departments.find((d) => d.id === p.departmentId)?.businessUnit ?? "",
  });
  r.items = p.items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    catalogId: i.catalogId ?? undefined,
    partNumber: db.catalog.find((c) => c.id === i.catalogId)?.partNumber ?? "",
    vendorId: i.supplierId ?? "",
    qty: i.quantity ?? 0,
    uom: i.unit ?? "",
    unitPrice: i.unitPrice ?? 0,
    category: i.category,
    account: ACCOUNTS[CATEGORIES.indexOf(i.category)] ?? "",
    tax: 0,
    shipping: 0,
    source: "ai",
    budgetId: i.budgetId ?? undefined,
    webLink: i.productLink ?? undefined,
  }));
  return r;
}

/** Exact normalized content + routing binds the user's confirmation to what was previewed. */
export function previewAgentProposal(db: DB, input: AgentProposal, userId: string): AgentPreview {
  const p = normalizeAgentProposal(db, input);
  const r = agentRequest(db, p, userId);
  const unitMissing = p.items
    .filter((i) => !i.unit)
    .map((i) => `${i.name}: unit (each, pack, ream…)`);
  const route = computeRoute(r, db);
  const approvers = route.flatMap((s) =>
    s.approvals.map((a) => db.users.find((u) => u.id === a.userId)?.name ?? "Unavailable approver"),
  );
  const draftMissing = [...new Set([...procurementDraftBlockers(r, db), ...unitMissing])];
  const approvalMissing = [
    ...new Set([
      ...procurementBlockers(r, db),
      ...unitMissing,
      ...(!p.shipTo ? ["a delivery location"] : []),
      ...(!route.length ? ["an approval route"] : []),
      ...(route.some((s) =>
        s.approvals.some((a) => !db.users.some((u) => u.id === a.userId && u.active)),
      )
        ? ["an active approver"]
        : []),
    ]),
  ];
  const fingerprint = JSON.stringify({
    proposal: p,
    route,
    draftMissing,
    approvalMissing,
    policy: db.policies,
    level: db.org.budgetLevel,
  });
  return { draftMissing, approvalMissing, approvers, total: totals(r).total, fingerprint };
}

export function applyAgentConfirmation(
  db: DB,
  proposal: AgentProposal,
  userId: string,
  key: string,
  action: "draft" | "approval",
  fingerprint: string,
) {
  const user = db.users.find((u) => u.id === userId && u.active && u.role !== "approver");
  if (!user) throw new Error("This account cannot create purchase requests.");
  const existing = db.requests.find((r) => r.activity.some((a) => a.id === key));
  if (existing && existing.requesterId !== userId)
    throw new Error("This request belongs to another account.");
  if (existing && existing.status !== "draft") {
    if (action === "approval" && existing.activity.some((a) => a.id === `${key}:submit`))
      return existing;
    throw new Error("This request is no longer editable.");
  }
  const preview = previewAgentProposal(db, proposal, userId);
  if (preview.fingerprint !== fingerprint)
    throw new Error(
      "Prices, requirements or approvers changed. Refresh the summary and confirm again.",
    );
  const missing = action === "approval" ? preview.approvalMissing : preview.draftMissing;
  if (missing.length)
    throw new Error(
      `Before ${action === "approval" ? "sending for approval" : "creating a draft"}, provide ${missing.join("; ")}.`,
    );
  const r = agentRequest(db, proposal, userId);
  applyProcurementDraft(db, r, userId, key);
  const saved = db.requests.find((x) => x.activity.some((a) => a.id === key));
  if (!saved) throw new Error("Could not create the request.");
  if (action === "approval") {
    saved.route = computeRoute(saved, db);
    saved.route.forEach((s, index) =>
      s.approvals.forEach((a) => {
        a.status = index === 0 ? "pending" : "waiting";
      }),
    );
    saved.status = "pending";
    saved.budgetLevel = db.org.budgetLevel;
    saved.submittedAt = new Date().toISOString();
    saved.activity.push({
      id: `${key}:submit`,
      kind: "submit",
      actorId: userId,
      at: saved.submittedAt,
      text: "Request submitted for approval with Procurement AI",
    });
  }
  return saved;
}

export function searchAgentCatalog(db: DB, queries: string[], category?: string | null) {
  const stop = new Set(["i", "need", "want", "for", "and", "the", "a", "office", "some", "please"]);
  const terms = queries.map((q) =>
    q
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !stop.has(t))
      .map((t) => t.replace(/s$/, "")),
  );
  return db.catalog.filter(
    (c) =>
      c.available &&
      (!category || c.category === category) &&
      db.vendors.some((v) => v.id === c.vendorId && v.verified && v.contractActive) &&
      terms.some(
        (ts) =>
          ts.length &&
          ts.every((t) => `${c.name} ${c.keywords.join(" ")}`.toLowerCase().includes(t)),
      ),
  );
}
export function relevantAgentSuppliers(db: DB, categories: string[]) {
  return db.vendors
    .filter(
      (v) => v.verified && v.contractActive && categories.some((c) => v.categories.includes(c)),
    )
    .sort((a, b) => Number(b.preferred) - Number(a.preferred));
}
