import { BarChart3, Box, ClipboardList, Building2, FileText, Hammer, Inbox, LogOut, ShieldCheck, Store, Timer, TrendingDown, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { money } from "@/lib/pd/engine";
import type { ColKind } from "@/lib/pd/reports";

export const REPORT_ICONS: Record<string, LucideIcon> = { store: Store, building: Building2, file: FileText, timer: Timer, inbox: Inbox, wallet: Wallet, box: Box, trending: TrendingDown, wrench: Wrench, hammer: Hammer, logout: LogOut, shield: ShieldCheck, clipboard: ClipboardList, chart: BarChart3 };
export const reportIcon = (k: string) => REPORT_ICONS[k] ?? BarChart3;

export function fmtCell(v: unknown, kind: ColKind = "text") {
  if (v === undefined || v === null || v === "") return "—";
  if (kind === "money") return money(Number(v));
  if (kind === "pct") return `${Math.round(Number(v) * 100)}%`;
  if (kind === "date") return new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (kind === "num") return Number.isFinite(Number(v)) ? String(v) : "—";
  return String(v);
}
