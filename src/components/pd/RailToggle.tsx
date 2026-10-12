import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "pd.rail.hidden";

/** Shared, remembered show/hide state for the request side panel (desktop only). */
export function useRailHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(KEY) === "1"); } catch { /* ignore */ } }, []);
  const toggle = () => setHidden((h) => { try { localStorage.setItem(KEY, h ? "0" : "1"); } catch { /* ignore */ } return !h; });
  return [hidden, toggle] as const;
}

export function RailToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const label = hidden ? "Show side panel" : "Hide side panel";
  return (
    <Button variant="ghost" size="sm" className="hidden size-8 p-0 text-muted-foreground hover:text-foreground lg:inline-flex" aria-label={label} title={label} aria-pressed={hidden} onClick={onToggle}>
      {hidden ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
    </Button>
  );
}
