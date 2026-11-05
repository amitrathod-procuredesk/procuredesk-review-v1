# Copy the AI agents experience

## What will be added
- **AI agents** in the left menu and mobile navigation.
- The same seven-agent directory, search, status filters and pause/resume interactions.
- Agent details with mode controls, live-mode confirmation, history, Penny’s ten-person team, instructions, policy sections and run history.
- Policy editing, enforcement switches, supporting-document hints, full run evidence and reversible Right/Wrong reviews.
- The same two-step new-agent flow: type and mode, then name, area, trigger, job and do/do-not instructions, including validation and the one-policy-agent restriction.

## Presentation
Keep the reference’s content and interaction flow, but use ProcureDesk’s compact white cards, existing headings, fields, buttons, dialogs and spacing. Check desktop, the current window size and mobile.

## Important limit
The reference is a front-end prototype: its run records are samples, and Live mode does not actually run agents, send messages or process invoices. Copy that behavior without claiming live automation or introducing autonomous financial actions. Agent configuration and reviews will save to this project’s shared workspace, unlike the reference’s session-only storage.

## Technical approach
Reuse the reference’s domain helpers, catalog, runs and original portrait files. Port its screens to the existing TanStack routes and shared design system. Keep agent state in the existing workspace document through its mutation/versioning mechanism; do not connect to the source project’s database or import private records.

## Verification
Run copied domain tests plus mutation tests, and exercise creation, policy save/cancel, mode confirmation, pause/resume, filters, team navigation and reversible run reviews in the app. Check reload persistence and narrow-screen overflow.