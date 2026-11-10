import { useId, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A neural aperture: three reasoning loops surround one focused core.
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
        <g stroke={`url(#${gradientId})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          {[0, 120, 240].map((rotation) => (
            <path key={rotation} transform={`rotate(${rotation} 16 16)`}
              d="M12 13.5V7.8a4 4 0 0 1 8 0v5.7l-4 2.3" />
          ))}
        </g>
        <path d="m16 12.8 2.8 1.6v3.2L16 19.2l-2.8-1.6v-3.2Z" fill={`url(#${gradientId})`} />
      </svg>
    </span>
  );
}
