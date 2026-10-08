import { AlertTriangle, Check, CircleAlert, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { Source, Status, User } from "@/lib/pd/types";
import { money, STATUS_LABEL, type Check as CheckT } from "@/lib/pd/engine";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: Status }) {
  return <span className={cn("pd-badge", `st-${status}`)}>{STATUS_LABEL[status]}</span>;
}

export function Money({ v, className }: { v: number; className?: string }) {
  return <span className={cn("num", className)}>{money(v)}</span>;
}

/** Subtle provenance marker: confirmed by user / suggested by AI / needs confirmation. */
export function SourceMark({ s }: { s?: Source }) {
  if (!s) return null;
  if (s === "confirmed")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Confirmed by you">
        <Check className="size-3" /> Confirmed
      </span>
    );
  if (s === "suggested")
    return (
      <span className="ai-mark" title="Suggested by AI — edit to confirm">
        <span className="size-1.5 rounded-full bg-ai" /> AI suggested
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-warning" title="Needs your confirmation">
      <span className="size-1.5 rounded-full border border-warning" /> Needs confirmation
    </span>
  );
}

export function AiGlyph({ className }: { className?: string }) {
  // Domain mark: a ledger tick inside a soft square — used for the copilot identity.
  return (
    <span className={cn("inline-flex size-5 items-center justify-center rounded-[5px] bg-ai-soft text-ai ring-1 ring-ai/30", className)}>
      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 5h6M3 8h4M3 11h3" />
        <path d="M9.5 10.5l1.6 1.6 2.9-3.6" />
      </svg>
    </span>
  );
}

export function UserAvatar({ user, size = "sm" }: { user?: User; size?: "sm" | "md" }) {
  const initials = (user?.name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-medium text-secondary-foreground ring-1 ring-border", size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs")}>
      {initials}
    </span>
  );
}

export function CheckIcon({ level }: { level: CheckT["level"] }) {
  if (level === "ok") return <CircleCheck className="size-4 shrink-0 check-ok" />;
  if (level === "warn") return <AlertTriangle className="size-4 shrink-0 check-warn" />;
  return <CircleAlert className="size-4 shrink-0 check-error" />;
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("pd-panel", className)}>
      <header className="flex items-center justify-between px-5 pt-4">
        <h2 className="pd-section-title">{title}</h2>
        {action}
      </header>
      <div className="px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({ label, source, children, className }: { label: string; source?: Source; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground/80">{label}</span>
        <SourceMark s={source} />
      </span>
      {children}
    </label>
  );
}
