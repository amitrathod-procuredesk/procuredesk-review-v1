import { useId, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A compact four-point sparkle signals AI without a surrounding badge.
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
        <path d="M16 2.5C17.9 11.3 20.7 14.1 29.5 16C20.7 17.9 17.9 20.7 16 29.5C14.1 20.7 11.3 17.9 2.5 16C11.3 14.1 14.1 11.3 16 2.5Z" fill={`url(#${gradientId})`} />
      </svg>
    </span>
  );
}
