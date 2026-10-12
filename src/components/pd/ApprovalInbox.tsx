import { Link } from "@tanstack/react-router";
import { budgetStatus, currentStageIndex, isPendingFor, money, smartDate, smartTime, totals } from "@/lib/pd/engine";
import { useDB, useMe } from "@/lib/pd/store";
import { CheckIcon, Empty, Money } from "./bits";

export function ApprovalInbox() {
  const db = useDB();
  const me = useMe()!;
  const mine = db.requests.filter((r) => isPendingFor(r, me.id));
  const history = db.requests.filter((r) => r.route.some((s) => s.approvals.some((a) => a.userId === me.id && ["approved", "rejected", "changes"].includes(a.status))));
  return (
    <div className="space-y-8">
      {mine.length === 0 ? (
        <Empty title="You're all caught up" body="New requests that need your approval will appear here." />
      ) : (
        <ul className="space-y-2">
          {mine.map((r) => {
            const b = budgetStatus(r, db);
            const stage = r.route[currentStageIndex(r)];
            const u = db.users.find((x) => x.id === r.requesterId);
            return (
              <li key={r.id}>
                <Link to="/app/requests/$id" params={{ id: r.id }} className="pd-panel flex flex-wrap items-center gap-x-6 gap-y-2 p-4 hover:border-ring">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground"><span className="num">{r.id}</span> · {u?.name} · {db.departments.find((d) => d.id === r.departmentId)?.name} · {r.project || "No project"}</p>
                  </div>
                  <div className="text-xs"><p className="text-muted-foreground">Your step</p><p>{stage?.name}</p></div>
                  <div className="flex items-center gap-1.5 text-xs">{b && <CheckIcon level={b.over ? (r.exceptionRequested ? "warn" : "error") : "ok"} />}{b ? (b.over ? `Over by ${money(-b.remaining)}` : "Within budget") : "No budget"}</div>
                  <div className="text-xs"><p className="text-muted-foreground">Needed</p><p>{smartDate(r.requiredBy)}</p></div>
                  <Money v={totals(r).total} className="text-base font-medium" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {history.length > 0 && (
        <div>
          <h2 className="pd-section-title mb-2">Your recent decisions</h2>
          <ul className="pd-panel divide-y divide-border">
            {history.map((r) => {
              const a = r.route.flatMap((s) => s.approvals).find((x) => x.userId === me.id)!;
              return (
                <li key={r.id}><Link to="/app/requests/$id" params={{ id: r.id }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-subtle"><span className="line-clamp-2 min-w-0 flex-1 break-words" title={r.title}>{r.title}</span><span className="text-xs capitalize text-muted-foreground">{a.status === "changes" ? "Changes requested" : a.status} {a.at && smartTime(a.at)}</span><Money v={totals(r).total} /></Link></li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
