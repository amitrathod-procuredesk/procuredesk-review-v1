import type { LineItem } from "./types";

/** Internal stock on hand per catalog item (demo data). Lines fulfilled from stock create no purchase. */
export const INVENTORY: Record<string, { onHand: number; location: string }> = {
  c_mbp: { onHand: 3, location: "Agate warehouse" },
  c_mouse: { onHand: 40, location: "Agate warehouse" },
  c_mon: { onHand: 2, location: "HQ IT store" },
  c_dock: { onHand: 6, location: "HQ IT store" },
  c_chair: { onHand: 0, location: "Agate warehouse" },
};

export const stockFor = (catalogId?: string) => {
  const s = catalogId ? INVENTORY[catalogId] : undefined;
  return s && s.onHand > 0 ? s : null;
};

export const fromStock = (l: LineItem) => l.fulfillment === "inventory";
/** Lines that create spend: not declined and not fulfilled from internal stock. */
export const isSpend = (l: LineItem) => !l.declined && !fromStock(l);
