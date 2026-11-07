# Personalized Procurement AI

## Goal
Turn Procurement AI into a context-aware buying assistant for employees who know what they need but should not have to understand procurement rules. Preserve ProcureDesk’s compact visual style and the existing Requests entry point.

The existing Lovable AI connection supports real-time responses. No additional ChatGPT API key is required. Today, it only rewrites a scripted result; the upgrade makes it interpret the conversation and choose relevant next steps.

## Conversation experience
- Keep the current single, session-only conversation, restart and undo behavior. Do not add chat-history navigation or change Ask Insights.
- Stream natural replies, preserve the full conversation, and remember selected items, specifications, quantities, units, supplier preferences and shared request details throughout the session.
- Search organization catalog and eligible suppliers before recommending a buying path. Show a small, collapsible activity entry with real results, not simulated checks.
- Ask only useful missing questions, usually one or two at a time. Do not repeat answered questions or ask for model specifications when someone requests ordinary paper.
- Use relevant selectable capsules: item choices, supplier choices, units, specifications and next actions. Never turn inferred preferences into confirmed purchase details.
- Distinguish facts, user preferences and unconfirmed suggestions. Clearly disclose unavailable catalog results, missing prices and unsupported supplier access.

## Multiple items and item-specific details
- Maintain a compact list of requested items, with independent selection, specifications, quantity, unit and supplier for each.
- Support selecting several matching catalog products before continuing, rather than forcing one item per conversation.
- Let users answer together: “20 packs of blue pens and 10 reams of A4 80 gsm paper.” Map each value to the correct item.
- For ambiguous answers such as “20,” ask which item and whether individual units or packs; do not guess.
- Support inspecting or editing one item without discarding the others; shared suppliers or delivery details apply to all only when confirmed.
- Rank suppliers that can demonstrably cover both items first; otherwise show the best verified option for each. Do not claim a supplier stocks both solely because its category is Office Supplies.
- Handle additions, removal, substitution, unavailable products, mixed catalog/manual items, services, declined supplier suggestions and changing requirements mid-conversation.

## Supplier and no-match paths
- Show only relevant organization suppliers; do not include IT-only suppliers for stationery.
- Label ordinary approved suppliers separately from punchout connections. The current project has a simulated supplier cart, not verified live punchout access.
- Respect “I don’t want punchout”: offer approved non-punchout sourcing or a manual item with the user’s product details, quote or link.
- Do not fabricate public-web products, availability or prices. Live external search or supplier purchasing requires a verified supported integration; if unavailable, retain the honest manual/link path rather than a fake web-results panel.

## Draft and approval flow
- Remove Review request as the default next step. Keep item details and request progress compact beside the conversation, with mobile access to the same information.
- When some approval details are missing, explain what remains and offer **Create draft** when the existing draft requirements are satisfied. If those requirements are missing too, ask for them first.
- When all mandatory details pass the existing checks, summarize items, quantities, total, delivery, department/budget and actual approver names, then ask: **Create request and send for approval?**
- Require an explicit confirmation control before creating a draft or submitting. A completed answer, capsule selection or AI tool call must never create or submit by itself.
- Recheck current prices, permissions, required details and approval routing at confirmation. If something changed, present the change and require confirmation again.
- Keep saving and submission idempotent. If saving fails, preserve the proposal; if submission has already occurred, retry only persistence rather than sending twice.
- After success, show the real request number with **View draft** or **View approval status**. Nothing is ordered by the assistant.

## Design
- Use the existing AI Elements messages, composer and collapsed tool-result controls, styled with ProcureDesk tokens and shared form controls.
- Assistant prose stays unframed; user messages remain distinct. Avoid oversized cards, nested cards, duplicate supplier lists and permanent action buttons unrelated to the current step.
- Item choices support visible multi-selection and a single continue action. Detail questions are clearly associated with their item.
- Keep the question field focused after answers; preserve readable loading, cancellation, failure and retry states on desktop and mobile.

## Technical implementation
- Replace the prose-only Procurement AI integration with the Lovable AI Gateway SDK using the currently configured `openai/gpt-6-astra` Responses model; preserve unrelated AI integrations.
- Add authenticated, read-only tools for catalog search, relevant supplier lookup, requester-specific prior requests, request requirements and approval previews. Reuse the existing server-validated ProcureDesk session; never trust a browser-provided user ID for server access.
- Validate structured item proposals and tool inputs. Catalog IDs, supplier eligibility, pricing, totals and approval rules remain authoritative application logic, not model-generated facts.
- Keep proposals isolated from workspace state until explicit confirmation; save through the existing shared workspace/versioning path. Harden the Procurement AI action boundary without redesigning unrelated workspace features.
- Adapt native SDK streaming events to the existing message-parts UI. Handle final Gateway errors without blind inference retries, and retain user input/partial replies.
- Replace conflicting architecture rules and add focused tests alongside the existing procurement tests.

## Verification
- Stationery with no exact catalog match recommends relevant suppliers and asks useful questions.
- Pens plus paper preserve separate quantities, units, specifications and supplier choices; multi-selection and individual edits work.
- Supplier refusal, ambiguous quantity, missing price, unavailable item and mixed catalog/manual purchases have honest recovery paths.
- Incomplete details lead to an eligible draft offer; complete details lead to the actual approval preview and explicit confirmation.
- No request is created on abandoned conversations or ordinary selections. Confirmed actions persist once and read back from Requests; approval checks execute immediately before submission.
- Run procurement regression and new rule tests; verify the central signed-in conversation through confirmation, error recovery and desktop/mobile layouts.

## Scope
This upgrades Procurement AI in Requests. It does not change Ask Insights, introduce persistent chat history, invent catalog products, or claim real external supplier connections where none exist.