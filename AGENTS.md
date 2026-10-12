<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- ProcureDesk state lives in a client store (`src/lib/pd/store.ts`, persisted to localStorage) and all money/budget/route/policy values are derived in `src/lib/pd/engine.ts` from line items and admin rules — never hardcode totals or approval routes.
- The copilot (`src/lib/pd/copilot.ts`) and assistant are deterministic and grounded only in org data; they prepare drafts but never submit, approve or change financial values without a user click.
- Form controls use `src/components/pd/form.tsx` (TextInput, TextArea, Select, Checkbox, Radio) on top of the shared `.pd-input` / checkbox / radio styles in `src/styles.css`; never add per-field heights or radii — so one fix updates every screen.
- Line items issued from internal stock (`fulfillment: "inventory"`, stock in `src/lib/pd/inventory.ts`) are excluded from totals, supplier spend and budget — they create no purchase.
- Admin portal is /app/admin?section=…; its sidebar and section list come from `src/lib/pd/adminNav.ts` so menu and pages never drift.
- Budget control (header vs line) is resolved only through engine helpers (`budgetLevelOf`, `lineBudgetId`, `budgetAllocation`, `budgetStatuses`); drafts follow the org setting, submitted requests keep a snapshot so history never shifts.
