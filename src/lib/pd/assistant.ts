/** Read-only assistant answers grounded strictly in ProcureDesk data. */
import type { DB, PRequest, User } from "./types";
import { budgetAvailable, budgetStatus, currentStageIndex, findDuplicates, isPendingFor, money, runChecks, STATUS_LABEL, supplierBreakdown, totals } from "./engine";
import { searchCatalog } from "./copilot";

export interface Answer {
  text: string;
  rows?: { label: string; value: string; requestId?: string }[];
  startRequest?: string;
}

const reqRow = (r: PRequest) => ({ label: `${r.id} · ${r.title}`, value: `${money(totals(r).total)} · ${STATUS_LABEL[r.status]}`, requestId: r.id });

export function answer(db: DB, me: User, q: string, ctx?: PRequest): Answer {
  const l = q.toLowerCase();

  if (ctx) {
    if (/over budget|budget/.test(l)) {
      const b = budgetStatus(ctx, db);
      if (!b) return { text: "No budget is selected on this request." };
      return {
        text: b.over
          ? `The request total is ${money(b.request)} and ${b.budget.name} has ${money(Math.max(0, b.available))} available, so it is over by ${money(-b.remaining)}.${ctx.exceptionRequested ? ` The requester asked for an exception${ctx.exceptionReason ? `: “${ctx.exceptionReason}”` : ""}.` : ""}`
          : `It fits: ${money(b.request)} against ${money(b.available)} available in ${b.budget.name}, leaving ${money(b.remaining)}.`,
      };
    }
    if (/preferred|supplier|vendor/.test(l)) {
      const rows = supplierBreakdown(ctx, db).map((s) => {
        const v = db.vendors.find((x) => x.id === s.vendorId);
        return { label: s.name, value: v ? `${v.preferred ? "Preferred" : "Not preferred"} · ${v.verified ? "Verified" : "Unverified"} · contract ${v.contractActive ? "active" : "none"}` : "No supplier" };
      });
      return { text: "Supplier status from the vendor registry:", rows };
    }
    if (/similar|duplicate|recent/.test(l)) {
      const d = findDuplicates(ctx, db);
      return d.length ? { text: `${d.length} similar request(s) in the last ${db.policies.duplicateWindowDays} days:`, rows: d.map(reqRow) } : { text: "No similar requests found in the duplicate window." };
    }
    if (/policy|why.*(my|approval)|require/.test(l)) {
      const i = currentStageIndex(ctx);
      const stages = ctx.route.map((s, idx) => ({ label: `${idx + 1}. ${s.name}${idx === i ? " (current)" : ""}`, value: s.reason }));
      return { text: "Approvals are required by these configured rules:", rows: stages };
    }
    if (/blocked|check|issue|problem/.test(l)) {
      const c = runChecks(ctx, db).filter((x) => x.level !== "ok");
      return c.length ? { text: "These checks need attention:", rows: c.map((x) => ({ label: x.title, value: x.detail ?? "" })) } : { text: "All procurement checks pass on this request." };
    }
  }

  if (/approv/.test(l) && /(wait|pending|my|queue)/.test(l)) {
    const list = db.requests.filter((r) => (me.role === "admin" ? r.status === "pending" : isPendingFor(r, me.id)));
    return list.length ? { text: `${list.length} request(s) waiting${me.role === "admin" ? " for approval" : " for your approval"}:`, rows: list.map(reqRow) } : { text: "Nothing is waiting for approval right now." };
  }
  if (/budget/.test(l)) {
    const dep = db.departments.find((d) => l.includes(d.name.toLowerCase()));
    const list = db.budgets.filter((b) => !dep || b.departmentId === dep.id);
    return { text: dep ? `${dep.name} budgets:` : "Budget availability:", rows: list.map((b) => ({ label: b.name, value: `${money(budgetAvailable(b.id, db))} of ${money(b.total)} available` })) };
  }
  const over = l.match(/(?:over|above|more than|>)\s*\$?\s*([\d,.]+)\s*(k)?/);
  if (over) {
    const n = Number(over[1].replace(/,/g, "")) * (over[2] ? 1000 : 1);
    const list = db.requests.filter((r) => totals(r).total > n && r.status !== "draft");
    return list.length ? { text: `${list.length} request(s) over ${money(n)}:`, rows: list.map(reqRow) } : { text: `No submitted requests over ${money(n)}.` };
  }
  if (/vendor|supplier/.test(l)) {
    const items = searchCatalog(db, l);
    if (items.length) {
      return { text: "Catalog suppliers for that:", rows: items.map((c) => ({ label: c.name, value: `${db.vendors.find((v) => v.id === c.vendorId)?.name} · ${money(c.price)}` })) };
    }
    return { text: "Verified suppliers:", rows: db.vendors.filter((v) => v.verified).map((v) => ({ label: v.name, value: v.preferred ? "Preferred" : "Approved" })) };
  }
  if (/blocked|over budget/.test(l)) {
    const list = db.requests.filter((r) => ["draft", "pending", "changes"].includes(r.status) && budgetStatus(r, db)?.over);
    return { text: `${list.length} open request(s) exceed their budget:`, rows: list.map(reqRow) };
  }
  if (/(create|need|buy|order|purchase request)/.test(l) && me.role !== "approver") {
    return { text: "I can prepare that as a draft. Nothing is submitted until you review it.", startRequest: q.replace(/^create (a )?purchase request for\s*/i, "I need ") };
  }
  return { text: "I can only answer from ProcureDesk data — try asking about approvals, budgets, suppliers, or requests over an amount." };
}
