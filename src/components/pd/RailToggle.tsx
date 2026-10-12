import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "pd.rail.hidden";

/** Shared, remembered show/hide state for the request side panel (desktop only). */
export function useRailHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(KEY) === "1"); } catch { /* ignore */ } }, []);
  const toggle = () => setHidden((h) => { try { localStorage.setItem(KEY, h ? "0" : "1"); } catch { /* ignore */ } return !h; });
  return [hidden, toggle] as const;
}

const btn = "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Header row inside the side panel with the collapse control. */
export function RailHeader({ onHide }: { onHide: () => void }) {
  return (
    <div className="mb-2 hidden items-center justify-between lg:flex print:hidden">
      <span className="pd-section-title">Summary</span>
      <button type="button" className={btn} aria-label="Hide side panel" title="Hide side panel" onClick={onHide}><PanelRightClose className="size-4" /></button>
    </div>
  );
}

/** Slim strip left in place of the hidden panel, so it can be reopened from where it was. */
export function RailStrip({ onShow }: { onShow: () => void }) {
  return (
    <div className="hidden justify-center border-l border-border bg-subtle/50 pt-4 lg:flex print:hidden">
      <button type="button" className={btn} aria-label="Show side panel" title="Show summary, budget & comments" onClick={onShow}><PanelRightOpen className="size-4" /></button>
    </div>
  );
}
