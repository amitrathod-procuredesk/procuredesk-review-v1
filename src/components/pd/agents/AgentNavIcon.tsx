import type { SVGProps } from "react";

/** A central intelligence node coordinating two task nodes. */
export function AgentNavIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m12 3 5 5-5 5-5-5 5-5Z" />
      <path d="M12 13v3M12 16H5v2M12 16h7v2" />
      <rect x="2.5" y="18" width="5" height="4" rx="1.2" />
      <rect x="16.5" y="18" width="5" height="4" rx="1.2" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}