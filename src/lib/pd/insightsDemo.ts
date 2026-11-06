import type { DB } from "./types";
import type { InsightRow } from "./insights";

export type DemoLedger = Record<"invoices" | "orders" | "items", InsightRow[]>;

// Isolated sample ledgers: no workspace requests, budgets or financial values are mutated.
export function demoInsightLedger(db: DB): DemoLedger {
  const result: DemoLedger = { invoices: [], orders: [], items: [] };
  const products = [
    {
      name: "MacBook Pro 14-inch",
      price: 1999,
      category: "IT equipment",
      account: "6100 · Equipment",
    },
    {
      name: "Microsoft 365 annual license",
      price: 264,
      category: "Software",
      account: "6200 · Software",
    },
    {
      name: "Ergonomic office chair",
      price: 349,
      category: "Office supplies",
      account: "6300 · Office",
    },
    { name: "Cloud hosting", price: 1250, category: "IT services", account: "6400 · Services" },
    {
      name: "Dell 27-inch monitor",
      price: 299,
      category: "IT equipment",
      account: "6100 · Equipment",
    },
    {
      name: "Security assessment",
      price: 4500,
      category: "Professional services",
      account: "6400 · Services",
    },
  ];
  for (let month = 0; month < 18; month++) {
    for (let i = 0; i < 6; i++) {
      const product = products[i];
      const supplier = db.vendors[i % Math.max(1, db.vendors.length)]?.name ?? "Sample supplier";
      const user = db.users[(month + i) % Math.max(1, db.users.length)];
      const department =
        db.departments[(i + (month % 3)) % Math.max(1, db.departments.length)]?.name ??
        "Operations";
      const quantity = 2 + ((month * 3 + i * 2) % 12);
      const date = new Date(Date.UTC(2025, 5 + month, 4 + i * 4)).toISOString().slice(0, 10);
      const amount = Math.round(product.price * quantity * 1.08 * 100) / 100;
      const base = {
        label: product.name,
        date,
        supplier,
        user: user?.name ?? "Sample requestor",
        department,
        category: product.category,
        account: product.account,
        item: product.name,
        budget: "Sample operating budget",
        quantity,
        amount,
      };
      const id = 10000 + month * 6 + i;
      if (month < 14 || i === 5 || i % 2 === 1) result.invoices.push({ ...base, id: `INV-DEMO-${id}`, amount: month >= 14 && i !== 5 ? Math.round(amount * 0.5 * 100) / 100 : amount });
      // Recent open POs include partially invoiced balances; historical POs are fully closed.
      if (month >= 14 && i !== 5)
        result.orders.push({
          ...base,
          id: `PO-DEMO-${id}`,
          amount: Math.round(amount * (i % 2 ? 0.5 : 1) * 100) / 100,
        });
      if (month < 17 || i % 2 === 0) result.items.push({ ...base, id: `RCV-DEMO-${id}` });
    }
  }
  return result;
}
