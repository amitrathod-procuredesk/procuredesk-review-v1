import type { SVGProps } from "react";

/**
 * ProcureDesk AI mark: a four-point spark (intelligence) whose momentum
 * resolves into a checkmark (your confirmation) — AI prepares, you decide.
 */
export function PdAiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M10.6 2.8c.6 3.6 2.1 5.1 5.7 5.7-3.6.6-5.1 2.1-5.7 5.7-.6-3.6-2.1-5.1-5.7-5.7 3.6-.6 5.1-2.1 5.7-5.7Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="m13.2 17.2 2.3 2.3 4.7-5.2" />
    </svg>
  );
}
