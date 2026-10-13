# ProcureDesk design system documentation

Write a single reference document for the design system ProcureDesk already uses. The app itself does not change.

## Deliverables
- A Word document (`ProcureDesk-Design-System.docx`) in Files that designers and stakeholders can share.
- The same content as a Markdown file in the project (`docs/design-system.md`), so future changes stay consistent.

## Contents
1. **Foundations**: shadcn/ui (New York style) on Radix primitives, Tailwind CSS v4 tokens, Lucide icons.
2. **Color tokens**: every semantic token from the stylesheet (background, surface, subtle, border, primary, success, warning, attention, danger and their soft variants), with hex values, where each is used, and a swatch table.
3. **Typography**: Inter for text and JetBrains Mono for numbers and IDs, plus the size scale in use (11px meta, 13px body, section titles, page titles).
4. **Spacing, radius and elevation**: the card and panel radii, borders, shadows and spacing rhythm.
5. **Components**: buttons, form controls (TextInput, TextArea, Select, Checkbox, Radio on the shared input style), status badges, chips, sections and panels, line item cards and table, right rail with hide/show, popovers, tooltips, dialogs and drawers, toasts.
6. **Patterns**: status colors across the request lifecycle, money and number formatting, empty states, validation highlighting, the rule that AI only prepares drafts, and the rule against showing the same information twice.
7. **Do / Don't**: no hard-coded colors, no per-field heights or radii, compact and calm density.

## Technical details
- Values are read directly from `src/styles.css`, `components.json`, `src/components/pd/form.tsx`, `bits.tsx` and `src/components/ui/*`, so nothing is invented.
- The document is generated with docx-js, validated, converted to page images and checked page by page before delivery.
