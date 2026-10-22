# ProcureDesk Design System

## 1. Foundations

- ProcureDesk uses a custom design system built on shadcn/ui (New York style) with Radix UI primitives for accessible menus, dialogs, popovers and tooltips.
- Styling is Tailwind CSS v4. Every color, radius and font is a semantic token defined once in the stylesheet; components never use raw colors.
- Icons come from Lucide, mostly at 14 to 16 px, stroke style, muted color unless interactive.
- Aesthetic: calm enterprise. Cool neutral surfaces, ink text, one indigo accent, amber reserved for AI, semantic success / warning / danger.

## 2. Color tokens

| Token | Hex | Use |
|---|---|---|
| background | #F1F3F6 | App canvas behind panels |
| surface | #FFFFFF | Panels, cards, inputs, drawers |
| subtle | #F3F4F6 | Table headers, hover rows, right rail, image placeholders |
| foreground | #14161B | Primary text |
| muted-foreground | #6C6E76 | Labels, metadata, secondary text |
| border | #E3E4E7 | Dividers and card outlines |
| input | #D9DBDE | Form control borders |
| primary | #4F46E5 | Main actions, links, focus ring, selected state |
| accent | #EBEFFF | Active chips and selected nav items |
| success | #267B4C | Approved, within budget |
| success-soft | #E3F8E9 | Approved badge background |
| warning | #B17000 | Missing data, soft warnings |
| warning-soft | #FFF2D6 | Warning banners |
| pending | #B36300 | Pending approval |
| pending-soft | #FFF0D3 | Pending badge background |
| attention | #C94E0C | Changes requested, low stock |
| attention-soft | #FFEBDF | Attention badge background |
| transit | #036EAE | Ordered / partially ordered |
| transit-soft | #DFF3FF | Ordered badge background |
| destructive | #C9302D | Rejected, errors, over budget |
| danger-soft | #FFECE9 | Error field and rejected badge background |
| ai | #BA6900 | AI suggestions only |
| ai-soft | #FFF3E3 | AI suggestion background |

## 3. Typography

| Role | Spec |
|---|---|
| Text font | Inter 400 / 500 / 600 / 700 |
| Numeric font | JetBrains Mono, tabular figures (amounts, IDs, quantities, item numbers) |
| Page title | 18 px semibold, tight tracking |
| Request title | 16 px semibold |
| Section title | 11 px semibold, uppercase, 0.06em tracking, muted |
| Body / item description | 13 to 14 px, medium for titles |
| Labels | 12 px medium, muted |
| Metadata | 11 to 11.5 px muted, separated by a dot |
| Badges | 11 px medium |

## 4. Spacing, radius and elevation

| Item | Spec |
|---|---|
| Base radius | 8 px (sm 6, md 8, lg 10, xl 12) |
| Inputs | 36 px tall, 6 px radius, 1 px input border, 3 px primary focus ring at 12% |
| Chips | 28 px tall, 6 px radius |
| Badges | 20 px tall, 4 px radius, colored dot |
| Panels | 12 px radius, full border, soft two-layer shadow |
| Table rows | header 32 px, rows 40 px |
| Spacing rhythm | 4 px grid; 12 px inside cards, 16 to 24 px page padding, 16 px between sections |
| Elevation | Flat by default; shadow only on hover, popovers, dialogs and drawers |

## 5. Components

- **Buttons**: shadcn Button: primary for the one main action per area (Submit, Approve), outline for secondary, ghost for icon actions.
- **Form controls**: TextInput, TextArea, Select, Checkbox, Radio from one shared form module on the .pd-input style. One change updates every screen.
- **Status badge**: Soft background + strong text + dot. Draft grey, Pending amber, Changes orange, Approved green, Rejected red, Ordered blue, Cancelled grey struck-through.
- **Chips**: Compact filters and secondary links; active chip uses accent color.
- **Section / Panel**: White panel with an uppercase section title; content follows immediately, no extra headers.
- **Line item card**: Image, description as title, metadata row (item #, Account:, Supplier, Budget:), quantity x unit price and total on the right, expand and more menu.
- **Line item table**: Optional view; card view is default. Inline edit only for item #, description, quantity and unit price.
- **Right rail**: Summary, budget, approval route, attachments and comments; always visible while creating a request. For more room, Line items has a "Full width" mode that fills the screen (Esc or "Exit full width" returns).
- **Overlays**: Popover for quick actions, Tooltip for hints, Dialog for confirmations, side Drawer for item details.
- **Toasts**: Sonner, short title plus optional one-line description.

## 6. Patterns

- Status colors are the same everywhere: dashboard, request header, approval inbox and timeline.
- Money is shown in the mono font with $ next to the amount and two decimals.
- Empty states use a short title, one sentence and one action.
- Validation highlights only after a submit attempt: red border and soft red fill, then scrolls to the first problem.
- AI only prepares drafts. It never submits, approves or changes amounts without an explicit click. AI content uses the amber AI color.
- Never show the same information twice unless the second place adds meaning.
- Items taken from internal stock are excluded from totals, supplier spend and budget.

## 7. Do / Don't

- **Do**: Use semantic tokens (bg-surface, text-muted-foreground)
- **Don't**: Use raw colors like white, black or hex values in components
- **Do**: Use the shared form controls
- **Don't**: Set per-field heights or radii
- **Do**: Keep screens compact and calm, one primary action per area
- **Don't**: Add decorative gradients or heavy shadows
- **Do**: Label ambiguous values (Account:, Budget:)
- **Don't**: Rely on color alone; pair it with text or an icon
