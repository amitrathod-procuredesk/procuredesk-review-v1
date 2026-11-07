import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/pd/engine";
import { matchCatalog } from "@/lib/pd/procurementAi";
import { purchaseSuggestions } from "@/lib/pd/procurementSuggestions";
import type { DB } from "@/lib/pd/types";
import { ProcurementAgent } from "./ProcurementAgent";

export function CatalogPicker({
  db,
  query,
  active,
  onPick,
}: {
  db: DB;
  query: string;
  active: boolean;
  onPick: (id: string, name: string) => void;
}) {
  const history = purchaseSuggestions(db, db.session.userId ?? "", query);
  const rows = matchCatalog(db, query).sort(
    (a, b) =>
      Number(history.some((h) => h.item.catalogId === b.id)) -
      Number(history.some((h) => h.item.catalogId === a.id)),
  );
  return (
    <ul aria-label="Matching products" className="divide-y divide-border">
      {rows.map((c) => {
        const v = db.vendors.find((x) => x.id === c.vendorId);
        return (
          <li
            key={c.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 py-3"
          >
            <Package className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium">{c.name}</p>
              <p className="break-words text-xs text-muted-foreground">
                {v?.name ?? "No supplier"}
                {v?.preferred ? " · Preferred" : ""}
                {history.some((h) => h.item.catalogId === c.id) ? " · Purchased before" : ""}
              </p>
            </div>
            <span className="num col-start-2 row-start-2 text-xs font-medium">
              {money(c.price)} <span className="font-normal text-muted-foreground">each</span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="col-start-3 row-span-2 row-start-1 h-7 shrink-0 px-2.5 text-xs"
              disabled={!active}
              aria-label={`Select ${c.name}`}
              onClick={() => onPick(c.id, c.name)}
            >
              Select
            </Button>
          </li>
        );
      })}
      {!rows.length && (
        <li className="px-3 py-6 text-center text-xs text-muted-foreground">
          No matching products. Describe another item or add it manually.
        </li>
      )}
    </ul>
  );
}

export const ProcurementAI = ProcurementAgent;
