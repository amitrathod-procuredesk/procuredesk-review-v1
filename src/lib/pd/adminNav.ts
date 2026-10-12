import { ClipboardList, Settings, Stamp, UserCog, type LucideIcon } from "lucide-react";

export type AdminSection = "users" | "roles" | "departments" | "rules" | "policies" | "vendors" | "budgets" | "config" | "logs" | "password";

export const ADMIN_NAV: { label: string; icon: LucideIcon; items: { id: AdminSection; label: string; desc: string }[] }[] = [
  { label: "Manage user", icon: UserCog, items: [
    { id: "users", label: "Users", desc: "Invite people and control who can request, approve or administer." },
    { id: "roles", label: "Roles & permissions", desc: "What each role can see and do across ProcureDesk." },
    { id: "departments", label: "Departments", desc: "Teams, their managers and fallback approvers." },
  ] },
  { label: "Approvals", icon: Stamp, items: [
    { id: "rules", label: "Approval rules", desc: "Conditions that build each request's approval route." },
    { id: "policies", label: "Policies", desc: "Checks applied before submission and shown to approvers." },
  ] },
  { label: "Reference data", icon: ClipboardList, items: [
    { id: "vendors", label: "Vendors & catalog", desc: "Approved suppliers and the items requesters can pick." },
    { id: "budgets", label: "Budgets", desc: "Spending limits per department and period." },
  ] },
  { label: "General settings", icon: Settings, items: [
    { id: "config", label: "Configurations", desc: "Organization defaults used on every request." },
    { id: "logs", label: "Logs", desc: "Every recorded action across all requests." },
    { id: "password", label: "Reset the password", desc: "Send a password reset to any active user." },
  ] },
];

export const ADMIN_SECTIONS = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
export const isAdminSection = (s: unknown): s is AdminSection => ADMIN_SECTIONS.some((i) => i.id === s);
