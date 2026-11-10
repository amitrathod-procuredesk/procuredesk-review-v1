import { useId, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * "Spark & Signal": an asymmetric three-arm spark (request → approve → purchase)
 * with a detached signal dot — the next step the AI proposes and the user confirms.
 * Vector geometry and semantic colors keep the identity crisp and theme-aware.
 */
export function PdAiIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  const gradientId = `pd-ai-${useId().replace(/:/g, "")}`;
  return (
    <span className={cn("inline-flex shrink-0", className)} aria-hidden="true" {...props}>
      <svg viewBox="0 0 32 32" fill="none" className="!size-full" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop className="pd-ai-icon-start" />
            <stop offset="1" className="pd-ai-icon-end" />
          </linearGradient>
        </defs>
        <path d="M14.5 4.5C15.4 15.1 15.6 15.7 26.2 21.1C16 18.9 15.6 19.3 5.6 26.3C13.4 17.7 13.4 16.9 14.5 4.5Z" fill={`url(#${gradientId})`} />
        <circle cx="24.4" cy="9.4" r="2.5" fill={`url(#${gradientId})`} />
      </svg>
    </span>
  );
}
