import { useId, type SVGProps } from "react";

/**
 * ProcureDesk AI mark: a four-point spark (intelligence) whose momentum
 * resolves into a checkmark (your confirmation) — AI prepares, you decide.
 * Rendered as a cyan-to-violet gradient glyph on a dark ink squircle.
 */
export function PdAiIcon(props: SVGProps<SVGSVGElement>) {
  const gradientId = useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke={`url(#${gradientId})`}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="5"
          y1="3"
          x2="20"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="oklch(0.82 0.13 195)" />
          <stop offset="1" stopColor="oklch(0.68 0.2 305)" />
        </linearGradient>
      </defs>
      <path
        d="M10.6 2.8c.6 3.6 2.1 5.1 5.7 5.7-3.6.6-5.1 2.1-5.7 5.7-.6-3.6-2.1-5.1-5.7-5.7 3.6-.6 5.1-2.1 5.7-5.7Z"
        fill={`url(#${gradientId})`}
        stroke="none"
      />
      <path d="m13.2 17.2 2.3 2.3 4.7-5.2" />
    </svg>
  );
}
