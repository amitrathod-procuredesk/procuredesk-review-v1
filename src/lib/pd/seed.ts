import { defaultAssetSettings } from "./assets";
import type { DB, LineItem, PRequest } from "./types";

const day = 86400000;
const iso = (offsetDays: number, h = 10) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setHours(h, 30, 0, 0);
  return d.toISOString();
};
const dateOnly = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

const emptyAi = () => ({ messages: [], pending: null, qty: 1, candidateIds: [], rawItem: "" });

function req(p: Partial<PRequest> & Pick<PRequest, "id" | "title" | "items" | "requesterId">): PRequest {
  return {
    status: "draft",
    departmentId: "dep_eng",
    businessUnit: "Edtech",
    requestType: "PO requisition",
    project: "Q4 hiring",
    shipTo: "US HQ · Agate, CO",
    paymentMethod: "Corporate card",
    shipmentType: "Standard ground",
    budgetId: "bud_it",
    urgent: false,
    delayed: false,
    blanket: false,
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
    createdAt: iso(-1),
    updatedAt: iso(-1),
    ai: emptyAi(),
    ...p,
  };
}

const li = (p: Partial<LineItem> & Pick<LineItem, "id" | "description" | "vendorId" | "qty" | "unitPrice">): LineItem => ({
  partNumber: "",
  account: "IT Equipment Expense",
  uom: "EACH",
  tax: 0,
  shipping: 0,
  category: "IT Equipment",
  ...p,
});

export function seedDB(): DB {
  return {
    org: {
      name: "Edtech Holdings",
      currency: "USD",
      fiscalYear: "FY26",
      businessUnits: ["Edtech", "Corporate", "Research"],
      shipTo: ["US HQ · Agate, CO", "Austin office · TX", "Remote employee"],
      projects: ["Q4 hiring", "Office refresh", "Platform migration", "General operations"],
      budgetLevel: "header",
    },
    users: [
      { id: "u_admin", name: "Alex Morgan", email: "admin@procuredesk.app", password: "admin123", role: "admin", title: "Procurement Admin", active: true },
      { id: "u_amit", name: "Amit Verma", email: "amit@procuredesk.app", password: "demo123", role: "requestor", title: "Engineering Lead", departmentId: "dep_eng", active: true },
      { id: "u_mark", name: "Mark Knue", email: "mark@procuredesk.app", password: "demo123", role: "approver", title: "Finance Analyst", departmentId: "dep_fin", active: true },
      { id: "u_priya", name: "Priya Shah", email: "priya@procuredesk.app", password: "demo123", role: "approver", title: "IT Security Lead", departmentId: "dep_it", active: true },
      { id: "u_daniel", name: "Daniel Ortiz", email: "daniel@procuredesk.app", password: "demo123", role: "approver", title: "Facilities Manager", departmentId: "dep_ops", active: true },
      { id: "u_lena", name: "Lena Walsh", email: "lena@procuredesk.app", password: "demo123", role: "approver", title: "EHS Compliance", departmentId: "dep_ops", active: true },
      { id: "u_rachel", name: "Rachel Kim", email: "rachel@procuredesk.app", password: "demo123", role: "approver", title: "VP Operations", departmentId: "dep_ops", active: true },
      { id: "u_jordan", name: "Jordan Lee", email: "jordan@procuredesk.app", password: "demo123", role: "approver", title: "Engineering Manager", departmentId: "dep_eng", active: true },
      { id: "u_sofia", name: "Sofia Ramos", email: "sofia@procuredesk.app", password: "demo123", role: "requestor", title: "Office Coordinator", departmentId: "dep_ops", active: true },
    ],
    departments: [
      { id: "dep_eng", name: "Engineering", businessUnit: "Edtech", managerId: "u_jordan" },
      { id: "dep_it", name: "IT", businessUnit: "Corporate", managerId: "u_priya" },
      { id: "dep_fin", name: "Finance", businessUnit: "Corporate", managerId: "u_mark" },
      { id: "dep_ops", name: "Operations", businessUnit: "Corporate", managerId: "u_rachel" },
    ],
    budgets: [
      { id: "bud_it", name: "IT Equipment · R&D FY26", departmentId: "dep_eng", category: "IT Equipment", total: 12000, committed: 11600, fiscalYear: "FY26" },
      { id: "bud_eng_hire", name: "Engineering Hiring · FY26", departmentId: "dep_eng", category: "IT Equipment", total: 40000, committed: 14200, fiscalYear: "FY26" },
      { id: "bud_office", name: "Office Supplies · FY26", departmentId: "dep_ops", category: "Office Supplies", total: 8000, committed: 3150, fiscalYear: "FY26" },
      { id: "bud_fac", name: "Facilities · FY26", departmentId: "dep_ops", category: "Furniture & Facilities", total: 30000, committed: 22800, fiscalYear: "FY26" },
    ],
    vendors: [
      { id: "v_amazon", name: "Amazon", preferred: true, verified: true, contractActive: true, categories: ["IT Equipment", "Office Supplies"] },
      { id: "v_phoenix", name: "Phoenix Supplier", preferred: true, verified: true, contractActive: true, categories: ["Office Supplies", "Furniture & Facilities"] },
      { id: "v_nova", name: "Nova Distributors", preferred: false, verified: true, contractActive: false, categories: ["IT Equipment"] },
      { id: "v_cdw", name: "CDW", preferred: true, verified: true, contractActive: true, categories: ["IT Equipment", "Software"] },
      { id: "v_local", name: "Peak Office Co.", preferred: false, verified: false, contractActive: false, categories: ["Furniture & Facilities"] },
    ],
    catalog: [
      { id: "c_mbp", name: "MacBook Pro 14-inch", description: "Apple M4 Pro chip, 24GB unified memory, 1TB SSD, Space Black — standard engineering build", partNumber: "100482", vendorId: "v_amazon", price: 1999, category: "IT Equipment", account: "IT Equipment Expense", keywords: ["macbook", "mac book", "laptop"], available: true },
      { id: "c_dell", name: "Dell Latitude 7450", description: "Intel Core Ultra 7, 32GB RAM, 512GB SSD, 14-inch FHD+ display — Windows 11 Pro corporate image", partNumber: "100517", vendorId: "v_cdw", price: 1450, category: "IT Equipment", account: "IT Equipment Expense", keywords: ["latitude", "dell laptop", "laptop", "windows"], available: true },
      { id: "c_mouse", name: "Logitech Lift ergonomic mouse", description: "Bluetooth + USB receiver, vertical grip to reduce wrist strain, silent clicks", partNumber: "200341", vendorId: "v_phoenix", price: 18.5, category: "Office Supplies", account: "Office Supplies Expense", keywords: ["mouse", "mice"], available: true },
      { id: "c_mon", name: "Dell UltraSharp 27\" 4K monitor", description: "3840×2160 IPS panel, USB-C 90W power delivery, height-adjustable stand", partNumber: "100736", vendorId: "v_nova", price: 310, category: "IT Equipment", account: "IT Equipment Expense", keywords: ["monitor", "display", "screen"], available: true },
      { id: "c_dock", name: "CalDigit TS4 dock", description: "Thunderbolt 4, dual 4K display support, 98W laptop charging, 2.5GbE port", partNumber: "100829", vendorId: "v_amazon", price: 189, category: "IT Equipment", account: "IT Equipment Expense", keywords: ["dock", "docking"], available: true },
      { id: "c_chair", name: "Herman Miller Aeron chair", description: "Mesh back with adjustable lumbar support, 4D armrests, 12-year warranty", partNumber: "300214", vendorId: "v_phoenix", price: 420, category: "Furniture & Facilities", account: "Facilities Expense", keywords: ["chair", "seating"], available: true },
      { id: "c_headset", name: "Jabra Evolve2 headset", description: "Active noise cancelling, Teams-certified, wireless with USB-C dongle", partNumber: "100953", vendorId: "v_amazon", price: 249, category: "IT Equipment", account: "IT Equipment Expense", keywords: ["headset", "headphone"], available: false },
    ],
    rules: [
      { id: "r_fin", name: "Finance review", order: 1, minAmount: 5000, approverIds: ["u_mark"], mode: "all", enabled: true },
      { id: "r_it", name: "IT Security review", order: 2, minAmount: 0, category: "IT Equipment", approverIds: ["u_priya"], mode: "all", enabled: true },
      { id: "r_fac", name: "Facilities & EHS review", order: 3, minAmount: 0, category: "Furniture & Facilities", approverIds: ["u_daniel", "u_lena"], mode: "all", enabled: true },
      { id: "r_exec", name: "Executive approval", order: 4, minAmount: 20000, approverIds: ["u_rachel"], mode: "all", enabled: true },
    ],
    policies: { quoteThreshold: 5000, duplicateWindowDays: 30, warnNonPreferredVendor: true },
    seq: 80000172,
    assets: defaultAssetSettings(),
    session: { userId: null },
    requests: [
      req({
        id: "REQ-80000166",
        title: "Laptop for new hire",
        requesterId: "u_amit",
        createdAt: iso(0, 9),
        updatedAt: iso(0, 9),
        requiredBy: dateOnly(24),
        sources: { title: "confirmed", department: "confirmed", budget: "suggested", project: "suggested", requiredBy: "needs" },
        items: [
          li({ id: "l1", name: "MacBook Pro 14-inch", description: "M3 Pro, 18GB RAM, 512GB SSD — setup for the new backend engineer starting Nov 3", partNumber: "", vendorId: "v_amazon", qty: 1, unitPrice: 1000 }),
          li({ id: "l2", name: "Logitech Lift ergonomic mouse", description: "Bluetooth + USB receiver, vertical grip — team-wide refresh for the engineering floor", partNumber: "200341", vendorId: "v_phoenix", qty: 25, unitPrice: 18.5, account: "Office Supplies Expense", category: "Office Supplies", catalogId: "c_mouse" }),
          li({ id: "l3", name: 'Dell UltraSharp 27" 4K monitor', description: "USB-C 90W, height-adjustable — dual-monitor setups for the new pod", partNumber: "100736", vendorId: "v_nova", qty: 4, unitPrice: 310, catalogId: "c_mon" }),
        ],
        activity: [{ id: "a1", at: iso(0, 9), actorId: "u_amit", text: "Request created", kind: "create" }],
      }),
      req({
        id: "REQ-80000161",
        title: "MacBook Pro laptops for platform team",
        requesterId: "u_amit",
        status: "pending",
        budgetId: "bud_eng_hire",
        project: "Platform migration",
        createdAt: iso(-4),
        submittedAt: iso(-4, 11),
        updatedAt: iso(-4, 11),
        requiredBy: dateOnly(10),
        items: [li({ id: "l1", name: "MacBook Pro 14-inch", description: "M4 Pro, 24GB memory, 1TB SSD — platform team upgrade from 2020 Intel models", partNumber: "100482", vendorId: "v_amazon", qty: 5, unitPrice: 1999, catalogId: "c_mbp" })],
        attachments: [{ id: "at1", name: "amazon-quote-5x-mbp.pdf", size: 184320, kind: "quote", uploadedAt: iso(-4) }],
        route: [
          { id: "r_fin", name: "Finance review", mode: "all", reason: "Total ≥ $5,000.00", approvals: [{ userId: "u_mark", status: "approved", at: iso(-3), comment: "Within hiring plan." }] },
          { id: "r_it", name: "IT Security review", mode: "all", reason: "Contains IT Equipment", approvals: [{ userId: "u_priya", status: "pending" }] },
        ],
        activity: [
          { id: "a1", at: iso(-4), actorId: "u_amit", text: "Request created", kind: "create" },
          { id: "a2", at: iso(-4, 11), actorId: "u_amit", text: "Request submitted for approval", kind: "submit" },
          { id: "a3", at: iso(-3), actorId: "u_mark", text: "Finance review approved", kind: "approve" },
        ],
      }),
      req({
        id: "REQ-80000158",
        title: "Ergonomic chairs for Austin office",
        requesterId: "u_sofia",
        status: "approved",
        departmentId: "dep_ops",
        businessUnit: "Corporate",
        budgetId: "bud_fac",
        project: "Office refresh",
        shipTo: "Austin office · TX",
        createdAt: iso(-12),
        submittedAt: iso(-12),
        updatedAt: iso(-9),
        requiredBy: dateOnly(-2),
        items: [li({ id: "l1", name: "Herman Miller Aeron chair", description: "Size B, adjustable lumbar — replacing worn chairs at Austin hot desks", partNumber: "300214", vendorId: "v_phoenix", qty: 6, unitPrice: 420, category: "Furniture & Facilities", account: "Facilities Expense", catalogId: "c_chair" })],
        route: [
          { id: "r_fac", name: "Facilities & EHS review", mode: "all", reason: "Contains Furniture & Facilities", approvals: [{ userId: "u_daniel", status: "approved", at: iso(-10) }, { userId: "u_lena", status: "approved", at: iso(-9) }] },
        ],
        activity: [
          { id: "a1", at: iso(-12), actorId: "u_sofia", text: "Request submitted for approval", kind: "submit" },
          { id: "a2", at: iso(-9), text: "Request approved", kind: "approve" },
        ],
      }),
      req({
        id: "REQ-80000163",
        title: "Monitors for design pod",
        requesterId: "u_amit",
        status: "changes",
        createdAt: iso(-6),
        submittedAt: iso(-6),
        updatedAt: iso(-5),
        requiredBy: dateOnly(14),
        decisionReason: "Please use the preferred supplier (CDW) instead of Nova.",
        items: [li({ id: "l1", name: 'Dell UltraSharp 27" 4K monitor', description: "Colour-accurate 4K panels for the product design pod", partNumber: "100736", vendorId: "v_nova", qty: 3, unitPrice: 310, catalogId: "c_mon" })],
        route: [{ id: "r_it", name: "IT Security review", mode: "all", reason: "Contains IT Equipment", approvals: [{ userId: "u_priya", status: "changes", at: iso(-5), comment: "Please use the preferred supplier (CDW) instead of Nova." }] }],
        activity: [
          { id: "a1", at: iso(-6), actorId: "u_amit", text: "Request submitted for approval", kind: "submit" },
          { id: "a2", at: iso(-5), actorId: "u_priya", text: "Changes requested: Please use the preferred supplier (CDW) instead of Nova.", kind: "changes" },
        ],
      }),
      req({
        id: "REQ-80000150",
        title: "Office supplies restock",
        requesterId: "u_sofia",
        status: "received",
        departmentId: "dep_ops",
        businessUnit: "Corporate",
        budgetId: "bud_office",
        project: "General operations",
        createdAt: iso(-28),
        submittedAt: iso(-28),
        updatedAt: iso(-20),
        requiredBy: dateOnly(-21),
        items: [li({ id: "l1", name: "Logitech Lift ergonomic mouse", description: "Quarterly restock for the shared supply cabinet", partNumber: "200341", vendorId: "v_phoenix", qty: 40, unitPrice: 18.5, category: "Office Supplies", account: "Office Supplies Expense", catalogId: "c_mouse" })],
        route: [{ id: "manager", name: "Manager approval", mode: "all", reason: "Default approver", approvals: [{ userId: "u_rachel", status: "approved", at: iso(-27) }] }],
        activity: [{ id: "a1", at: iso(-28), actorId: "u_sofia", text: "Request submitted for approval", kind: "submit" }],
      }),
    ],
  };
}
