import type { ImgHTMLAttributes } from "react";
import procurementAiIcon from "@/assets/procurement-ai-icon.png";
import { cn } from "@/lib/utils";

/**
 * Connected choices: catalog and supplier paths resolve into an open P.
 * One shared transparent identity for the entry, header and conversation.
 */
export function PdAiIcon({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src={procurementAiIcon}
      alt=""
      width={877}
      height={877}
      loading="lazy"
      aria-hidden="true"
      className={cn("shrink-0 object-contain", className)}
      {...props}
    />
  );
}
