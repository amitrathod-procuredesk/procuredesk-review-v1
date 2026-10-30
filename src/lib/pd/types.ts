export type BudgetLevel = "header" | "line";
export type Role = "admin" | "requestor" | "approver";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  title: string;
  departmentId?: string;
  active: boolean;
}

export interface Department {
  id: string;
  name: string;
  businessUnit: string;
  managerId?: string;
}

export interface Budget {
  id: string;
  name: string;
  departmentId: string;
  category: string;
  total: number;
  committed: number;
  fiscalYear: string;
}

export interface Vendor {
  id: string;
  name: string;
  preferred: boolean;
  verified: boolean;
  contractActive: boolean;
  categories: string[];
}

export interface CatalogItem {
  id: string;
  /** Short product name (e.g. "MacBook Pro 14-inch"). */
  name: string;
  /** Spec/purpose detail shown as the line-item description; must not repeat the name. */
  description: string;
  partNumber: string;
  vendorId: string;
  price: number;
  category: string;
  account: string;
  keywords: string[];
  available: boolean;
}

export interface ApprovalRule {
  id: string;
  name: string;
  order: number;
  minAmount: number;
  category?: string;
  approverIds: string[];
  mode: "all" | "any";
  enabled: boolean;
}

export interface Policies {
  quoteThreshold: number;
  duplicateWindowDays: number;
  warnNonPreferredVendor: boolean;
}

export type Source = "confirmed" | "suggested" | "needs";

export interface LineItem {
  id: string;
  /** Set when an approver excluded this line during partial approval; excluded from totals. */
  declined?: { by: string; at: string; reason?: string };
  /** Set when an approver approved just this line; the rest of the request stays pending ("Partially approved"). */
  approved?: { by: string; at: string };
  /** Short item name shown as the card title; description gives the detail. */
  name?: string;
  description: string;
  partNumber: string;
  account: string;
  /** Optional cost split across GL accounts (percent shares totalling 100); `account` mirrors the first row. */
  accountSplits?: { account: string; percent: number }[];
  vendorId: string;
  uom: string;
  qty: number;
  unitPrice: number;
  tax: number;
  shipping: number;
  category: string;
  deliveryDate?: string;
  notes?: string;
  /** Line-level budget (used when budget control is "line"); falls back to the request budget. */
  budgetId?: string;
  catalogId?: string;
  /** "inventory" = issued from internal stock (no purchase, excluded from spend); default purchase from supplier. */
  fulfillment?: "purchase" | "inventory";
  source?: "ai" | "quote" | "manual";
  itemType?: string;
  itemClass?: string;
  projectCode?: string;
  webLink?: string;
  imageUrl?: string;
}

export type Status =
  | "draft"
  | "pending"
  | "changes"
  | "approved"
  | "rejected"
  | "cancelled"
  | "ordered"
  | "part_ordered"
  | "order_deleted"
  | "partial"
  | "received"
  | "closed";

export interface Approval {
  userId: string;
  status: "waiting" | "pending" | "approved" | "rejected" | "changes";
  at?: string;
  comment?: string;
  delegatedFrom?: string;
}

export interface Stage {
  id: string;
  name: string;
  reason: string;
  mode: "all" | "any";
  approvals: Approval[];
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  kind: "quote" | "spec" | "business" | "other";
  uploadedAt: string;
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  at: string;
}

export interface Activity {
  id: string;
  at: string;
  actorId?: string;
  text: string;
  kind: "create" | "ai" | "edit" | "submit" | "approve" | "reject" | "changes" | "system";
}

export interface AiMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  kind?: "choice" | "catalog" | "nomatch" | "done" | "unsure";
  options?: string[];
  catalogIds?: string[];
}

export interface AiState {
  messages: AiMessage[];
  pending: null | "item" | "catalog" | "department" | "date" | "nomatch";
  qty: number;
  candidateIds: string[];
  rawItem: string;
}

export interface PRequest {
  id: string;
  title: string;
  status: Status;
  requesterId: string;
  departmentId?: string;
  businessUnit: string;
  requestType: string;
  project: string;
  shipTo: string;
  paymentMethod: string;
  shipmentType: string;
  requiredBy?: string;
  budgetId?: string;
  /** Budget control captured at submission; drafts follow the org setting. */
  budgetLevel?: BudgetLevel;
  urgent: boolean;
  delayed: boolean;
  blanket: boolean;
  items: LineItem[];
  noteBuyer: string;
  noteSupplier: string;
  attentionId?: string;
  quoteNo: string;
  website: string;
  attachments: Attachment[];
  comments: Comment[];
  activity: Activity[];
  route: Stage[];
  sources: Record<string, Source>;
  exceptionRequested: boolean;
  exceptionReason?: string;
  duplicateAcknowledged?: boolean;
  tags?: string[];
  rfqs?: { id: string; at: string; vendorIds: string[] }[];
  reminders?: { userId: string; at: string; by: string }[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  decisionReason?: string;
  ai: AiState;
}

export interface Org {
  adoptionBenchmarks?: Partial<Record<import("./adoption").MetricId, number>>;
  name: string;
  currency: string;
  fiscalYear: string;
  businessUnits: string[];
  shipTo: string[];
  projects: string[];
  /** "header": one budget per request; "line": each line item picks its own budget. */
  budgetLevel: BudgetLevel;
}

export interface DB {
  org: Org;
  users: User[];
  departments: Department[];
  budgets: Budget[];
  vendors: Vendor[];
  catalog: CatalogItem[];
  rules: ApprovalRule[];
  policies: Policies;
  requests: PRequest[];
  session: { userId: string | null };
  seq: number;
  assets?: import("./assets").AssetSettings;
  assetItems?: import("./assetRegister").Asset[];
}

export const CATEGORIES = [
  "IT Equipment",
  "Office Supplies",
  "Software",
  "Furniture & Facilities",
  "Professional Services",
];
export const ACCOUNTS = [
  "IT Equipment Expense",
  "Office Supplies Expense",
  "Software Subscriptions",
  "Facilities Expense",
  "Consulting Expense",
];
export const UOMS = ["EACH", "BOX", "PACK", "HOUR", "MONTH", "LICENSE"];
export const PAYMENT_METHODS = ["Corporate card", "Purchase order", "ACH transfer"];
export const SHIPMENT_TYPES = ["Standard ground", "2-day", "Overnight", "Pickup"];
export const REQUEST_TYPES = ["PO requisition", "Non-PO requisition", "Check request"];
