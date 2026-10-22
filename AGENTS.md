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

- ProcureDesk state is one shared workspace document in Lovable Cloud (`workspace_state`, read/written only via `src/lib/pd/workspace.functions.ts` with optimistic versioning); `src/lib/pd/store.ts` keeps a local cache, replays edits on conflict and polls for others' changes. Only the signed-in user id stays per browser.
- The copilot (`src/lib/pd/copilot.ts`) and assistant are deterministic and grounded only in org data; they prepare drafts but never submit, approve or change financial values without a user click.
- Procurement AI keeps its conversation and proposal isolated from workspace state; only Create draft & review persists it through existing store actions, so abandoned proposals never create requests.
- Form controls use `src/components/pd/form.tsx` (TextInput, TextArea, Select, Checkbox, Radio) on top of the shared `.pd-input` / checkbox / radio styles in `src/styles.css`; never add per-field heights or radii — so one fix updates every screen.
- Line items issued from internal stock (`fulfillment: "inventory"`, stock in `src/lib/pd/inventory.ts`) are excluded from totals, supplier spend and budget — they create no purchase.
- Admin portal is /app/admin?section=…; its sidebar and section list come from `src/lib/pd/adminNav.ts` so menu and pages never drift.
- Budget control (header vs line) is resolved only through engine helpers (`budgetLevelOf`, `lineBudgetId`, `budgetAllocation`, `budgetStatuses`); drafts follow the org setting, submitted requests keep a snapshot so history never shifts.
- Asset records live in the workspace document as `assetItems`; every lifecycle change (status, check-out/in, repair stages, disposal) goes through the action helpers in `src/lib/pd/assetRegister.ts` so history and status stay consistent with the lifecycle configured in asset settings.
- Maintenance uses each asset's existing plan, due date, optional service progress and completion log through assetRegister actions; service progress stays separate from asset lifecycle status to preserve assignments and repair history.
- Shared LineItems uses the existing editor for editable details and a read-only item dialog for inspection, so removing inline disclosure never hides review information or enables edits.
- Restrained destructive actions use the shared Button destructive-soft variant with semantic danger tokens, keeping desktop, mobile and confirmation styling consistent.
- Login and workspace branding use the same uploaded logo asset pointer so the brand remains consistent across entry points.
- Dashboard controls stack below content-driven breakpoints and tab strips scroll locally, keeping page-level horizontal overflow out of narrow layouts.
