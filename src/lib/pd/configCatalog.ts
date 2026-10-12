import { Bell, Boxes, Building2, DatabaseZap, FileCheck2, Landmark, Plug, ShieldCheck, Truck, type LucideIcon } from "lucide-react";
import type { AdminSection } from "./adminNav";

export type ConfigItem = {
  id: string;
  label: string;
  hint: string;
  /** Opens an existing admin section instead of a settings page. */
  section?: AdminSection;
};
export type ConfigGroup = { id: string; label: string; icon: LucideIcon; items: ConfigItem[]; kind?: "integrations" };

const i = (id: string, label: string, hint: string, section?: AdminSection): ConfigItem => ({ id, label, hint, section });

/** Every configuration setting, grouped by the job an admin is doing (not by system table). */
export const CONFIG_GROUPS: ConfigGroup[] = [
  { id: "company", label: "Company & access", icon: Building2, items: [
    i("company", "Company setting", "Name, currency, fiscal year and defaults"),
    i("billing", "Billing detail", "Billing address and invoicing contact"),
    i("remit", "Remit setting", "Where suppliers send payments and remittances"),
    i("roles", "Manage roles", "What each role can see and do", "roles"),
    i("privileges", "Manage privileges", "Fine-grained permissions per role"),
    i("password-policy", "Password policies", "Length, expiry and reuse rules"),
    i("idp", "Single sign-on (IdP)", "SAML / OIDC identity provider"),
    i("api-key", "API keys", "Keys for programmatic access"),
    i("account-owner", "Account owner", "Who owns this ProcureDesk account"),
  ] },
  { id: "requests", label: "Requests & policies", icon: FileCheck2, items: [
    i("requisition-type", "Requisition types", "PO, non-PO and check requests"),
    i("organize-fields", "Organize fields", "Order and visibility of request fields"),
    i("custom-fields", "Custom fields", "Extra fields captured on requests"),
    i("custom-slug", "Custom slug", "Prefix used in request numbers"),
    i("policy", "Policy configuration", "Quote thresholds and supplier checks", "policies"),
    i("policy-messages", "Policy messages", "Text shown when a policy applies"),
    i("ai-prompts", "AI prompts", "How the assistant drafts requests"),
    i("quote-status", "Quote status", "Statuses used for supplier quotes"),
    i("tags", "Tags", "Labels for organizing requests"),
    i("transactional-tags", "Transactional tags", "Tags applied to orders and invoices"),
  ] },
  { id: "finance", label: "Budgets & finance", icon: Landmark, items: [
    i("budget-setting", "Budget setting", "How budgets are checked and enforced", "budgets"),
    i("budget-notification", "Budget notifications", "Alerts as budgets are used up"),
    i("payment-method", "Payment methods", "Card, PO and ACH options"),
    i("payment-terms", "Payment terms", "Net 30, Net 60 and similar"),
    i("payment-integrations", "Payment integrations", "Providers used to pay suppliers"),
    i("card-programs", "Card programs", "Corporate card programs and limits"),
    i("expense-category", "Expense categories", "Categories for expense reports"),
    i("tracking-categories", "Tracking categories", "Extra dimensions for reporting"),
    i("class-master", "Classes", "Accounting classes"),
    i("tolerance", "Tolerance", "Allowed price and quantity variance"),
    i("invoice-type", "Invoice types", "Kinds of invoices you accept"),
    i("ocr-rules", "OCR exception rules", "When scanned invoices need review"),
    i("ocr-tester", "OCR tester", "Try invoice scanning on a sample"),
  ] },
  { id: "orders", label: "Orders & receiving", icon: Truck, items: [
    i("po-config", "PO configurations", "How purchase orders are created and sent"),
    i("po-ranges", "PO number ranges", "Numbering for purchase orders"),
    i("po-terms", "PO terms", "Terms printed on purchase orders"),
    i("terms", "Terms & conditions", "Legal terms shared with suppliers"),
    i("central-receiving", "Central receiving", "Receive goods at a central desk"),
    i("delivery-type", "Delivery types", "Standard, 2-day, overnight, pickup"),
    i("delivery-contact", "Delivery contacts", "Who receives deliveries"),
    i("carrier", "Carriers", "Shipping carriers you work with"),
  ] },
  { id: "structure", label: "Organization structure", icon: Boxes, items: [
    i("business-unit", "Business units", "Top-level units of the organization"),
    i("departments", "Departments", "Teams and their managers", "departments"),
    i("locations", "Locations", "Offices and ship-to addresses"),
    i("project-code", "Project codes", "Projects that spend is charged to"),
    i("categories", "Categories", "Purchase categories"),
    i("uom", "Units of measure", "EACH, BOX, PACK, HOUR and more"),
    i("item-attribute", "Item attributes", "Extra details on catalog items"),
    i("bundle", "Bundles", "Groups of items requested together"),
    i("inventory-location", "Inventory locations", "Where stock is kept"),
    i("inventory-location-type", "Inventory location types", "Warehouse, shelf, bin"),
  ] },
  { id: "comms", label: "Notifications", icon: Bell, items: [
    i("email-template", "Email templates", "Emails sent to people and suppliers"),
  ] },
  { id: "data", label: "Data & exports", icon: DatabaseZap, items: [
    i("data-sync", "Scheduled data sync", "When connected systems sync"),
    i("scheduler-export", "Scheduled exports", "Automatic exports to files or systems"),
    i("report-export", "Report export rules", "Which data reports include"),
    i("export-invoices", "Export invoice attachments", "Download all invoice files"),
    i("export-receipts", "Export expense receipts", "Download all receipt files"),
    i("savings-portal", "Savings portal", "ProcureDesk savings insights"),
  ] },
  { id: "integrations", label: "Integrations", icon: Plug, kind: "integrations", items: [
    i("quickbooks", "QuickBooks Online", "Accounting"),
    i("quickbooks-lines", "QuickBooks line items", "Accounting"),
    i("netsuite", "NetSuite", "ERP"),
    i("sage", "Sage Intacct", "Accounting"),
    i("sap", "SAP", "ERP"),
    i("xero", "Xero", "Accounting"),
    i("microsoft", "Microsoft", "Sign-in & email"),
    i("docusign", "DocuSign", "Contracts"),
    i("avalara", "Avalara", "Tax"),
    i("brex", "Brex", "Cards"),
    i("ramp", "Ramp", "Cards"),
    i("ramp-tx", "Ramp transactions", "Cards"),
    i("plaid", "Plaid", "Banking"),
    i("procore", "Procore", "Construction"),
    i("unanet", "Unanet", "Project ERP"),
    i("aspire", "Aspire", "Field service"),
    i("elation", "Elation", "Healthcare"),
    i("benchling", "Benchling", "Research"),
    i("system-integration", "Custom system", "API / SFTP"),
  ] },
];

export const CONFIG_ITEMS = CONFIG_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g })));
export const findConfig = (id?: string) => CONFIG_ITEMS.find((x) => x.id === id);
export const CONFIG_COUNT = CONFIG_ITEMS.length;
export const ShieldIcon = ShieldCheck;
