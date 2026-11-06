# ProcureDesk review V1

Consider attached roles and instruction and design SaaS product for below requirements.

 AI-FIRST PROCUREMENT SaaS

## 0. PRIMARY OBJECTIVE

Build a **modern, production-quality, AI-first procurement SaaS application** called **ProcureDesk**.

This should not be a generic SaaS dashboard or a traditional procurement form with an AI chatbot attached.

The core product idea is:

> **Users should be able to describe what they need in natural language, and the procurement system should intelligently turn that intent into a structured, policy-aware, budget-aware purchase request.**

AI should reduce the amount of manual form filling while keeping the user in control of important financial and procurement decisions.

The product must support:

- Requestors
- Approvers
- Admins
- Procurement teams
- Finance teams

with role-based permissions and workflows.

The application should be **fully functional**, not a collection of static screens.

---

# 1. DESIGN DIRECTION

Create a sophisticated 2026-era enterprise SaaS experience inspired by the usability principles of products such as:

- Expensify
- Procurify
- Ramp
- Brex
- Stripe
- Linear
- Microsoft
- Apple

Do not copy their UI.

Use them only as inspiration for:

- interaction quality
- simplicity
- information hierarchy
- workflow efficiency
- enterprise usability
- progressive disclosure
- contextual actions
- AI integration

### Visual characteristics

The UI should be:

- Minimal
- Clean
- Premium
- Professional
- Calm
- Highly readable
- Information-dense without feeling cluttered
- Enterprise-ready
- AI-centric without looking like an AI toy

Avoid:

- excessive gradients
- excessive glassmorphism
- unnecessary cards
- giant headings
- excessive rounded containers
- decorative illustrations
- unnecessary animations
- excessive AI glow effects
- chatbot-heavy layouts

Use subtle visual hierarchy, whitespace, typography, borders, spacing, and contextual emphasis.

---

# 2. IMPORTANT SCREENSHOT INSTRUCTION

The attached screenshot is the **reference for the information architecture, procurement data, terminology, and required fields**.

### Use the screenshot for:

- field names
- procurement concepts
- line-item information
- request metadata
- approval information
- budget information
- attachment concepts
- comments
- supplier information
- quote information
- request statuses

### DO NOT copy:

- exact layout
- visual styling
- spacing
- component design
- colors
- card arrangement
- interaction patterns

Completely redesign the experience.

The screenshot should be treated as a **data/content reference**, not a UI reference.

---

# 3. SCREENSHOT DATA MODEL

The existing request example contains:

### Request

**Laptop for new hire**

Request ID:

**REQ-80000166**

Status:

**Draft**

Request type:

**PO requisition**

Business unit:

**Edtech**

Department:

**Engineering**

Contact:

**executive_e (you)**

Ship to:

**US HQ · Agate, CO**

Project:

**Q4 hiring**

Payment method:

**Corporate card**

Shipment type:

**Standard ground**

Additional controls:

- Urgent
- Delayed release
- Blanket requisition

---

# 4. LINE ITEM DATA

The screenshot contains these example items.

Use them as realistic seed data:

### Item 1

**Macbook pro laptop**

Part number:

No part number

Account:

IT Equipment Expense

Supplier:

Amazon

UOM:

EACH

Quantity:

1

Unit price:

$1,000.00

---

### Item 2

**Wireless mouse, ergonomic**

Part number:

LG M220 · Logitech Mouse

Account:

Office Supplies Expense

Supplier:

Phoenix Supplier

UOM:

EACH

Quantity:

25

Unit price:

$18.50

---

### Item 3

**27" monitor, 4K IPS panel**

Part number:

DL U270 · Dell UltraSharp

Account:

IT Equipment Expense

Supplier:

Nova Distributors

UOM:

EACH

Quantity:

4

Unit price:

$310.00

---

Use these values for the initial prototype.

However, calculate totals dynamically.

Do NOT hardcode contradictory totals from the screenshot.

---

# 5. REQUEST SUMMARY DATA

The request should support:

- Request total
- Supplier breakdown
- Budget
- Available budget
- Total budget
- Budget variance
- Approval route
- Number of approvers

For example:

### Budget

**IT Equipment · R&D FY26**

Available:

**$400**

Total:

**$12,000**

If the request exceeds budget, clearly show:

> **Over budget by $1,992.74**

However, dynamically calculate the actual amount based on the current request.

---

# 6. APPROVAL ROUTE

The screenshot shows a multi-stage approval workflow.

Support:

### Step 1 — Finance review

**Mark Knue**

Finance Analyst

Upcoming

### Step 2 — Department review

Parallel approval

**Priya Shah**

IT Security Lead

**Daniel Ortiz**

Facilities Manager

**Lena Walsh**

EHS Compliance

All three must approve.

### Step 3 — Final approval

**Rachel Kim**

VP Operations

Upcoming

The system should support:

- Sequential approvals
- Parallel approvals
- Conditional approvals
- Multiple approvers
- Approval delegation
- Approval escalation
- Approval comments
- Request changes
- Rejection

Do not hardcode this approval structure. It should be configurable by the Admin.

---

# 7. ADMIN FLOW

Start the product with an initial Admin account.

The complete flow should be:

**Login**

↓

**Admin dashboard**

↓

**Organization setup**

↓

**Users & Roles**

↓

**Create Requestor**

↓

**Create Approver**

↓

**Configure departments**

↓

**Configure budgets**

↓

**Configure approval rules**

↓

**Configure procurement policies**

↓

**Configure catalog/vendors**

↓

**Requestor creates purchase request**

↓

**AI builds request**

↓

**Policy validation**

↓

**Budget validation**

↓

**Approval routing**

↓

**Approver review**

↓

**Approval / rejection / changes**

---

# 8. LOGIN

Create a minimal enterprise login.

Fields:

- Email
- Password

Actions:

- Sign in
- Forgot password

Do not add unnecessary authentication elements to the prototype.

After login, route the user based on role.

---

# 9. ROLE-BASED ACCESS

Support at minimum:

## Admin

Can manage:

- Users
- Roles
- Departments
- Business units
- Budgets
- Vendors
- Catalog
- Policies
- Approval workflows
- Settings
- Organization

## Requestor

Can:

- Create request
- Save draft
- Edit draft
- Submit request
- View own requests
- Track status
- Respond to requested changes
- Cancel eligible requests
- Use AI purchasing assistant

## Approver

Can:

- View assigned approvals
- Review request
- Approve
- Reject
- Request changes
- Comment
- View budget
- View policy checks
- View approval history

Architecture should allow additional roles later.

---

# 10. REQUESTOR HOME

Do not make the requestor dashboard a traditional analytics dashboard.

The primary question should be:

# What do you need to purchase?

Create a prominent AI-first input.

Example:

> **Tell me what you need to buy**

Placeholder:

> "Try: 4 laptops for new hires starting next month"

Actions:

**Create with AI**

**Create manually**

The manual path must remain available.

---

# 11. AI PURCHASE EXPERIENCE

This is the centerpiece of the product.

The AI should behave like a **procurement copilot**, not a generic chatbot.

User:

> "I need 4 laptops for new hires."

AI should understand:

- item
- quantity
- likely category
- possible department
- potential project
- timing

Then ask only what is necessary.

For example:

> "I can help with that. Which team are the laptops for?"

Then:

> "When do the new hires start?"

Then:

> "Do you want to use your standard company laptop?"

Do not present 20 form fields immediately.

---

# 12. AI + STRUCTURED UI

The best experience should combine:

### Conversational input

with

### Structured request preview

Example:

**You said:**

> "I need 4 laptops for the engineering team starting next month."

Then AI creates:

### Purchase request

| Field | Value |
|---|---|
| Item | Laptop |
| Quantity | 4 |
| Department | Engineering |
| Project | Q4 hiring |
| Required by | November 1 |
| Category | IT Equipment |

Each field should be editable.

The AI should never lock the user into the conversational interface.

---

# 13. AI CONFIDENCE & SOURCE

Clearly distinguish between:

### Confirmed

Information explicitly provided by the user.

### Suggested

Information inferred or recommended by AI.

### Needs confirmation

Information required before submission.

Example:

**Department**

Engineering  
✓ Confirmed

**Category**

IT Equipment  
AI suggested

**Vendor**

Amazon  
Needs confirmation

Avoid excessive AI badges.

Use subtle visual indicators.

---

# 14. CATALOG INTELLIGENCE

When AI recognizes an item, search the internal catalog.

Example:

User:

> "I need a MacBook Pro."

AI:

> "I found a matching item in your company catalog."

Show:

**MacBook Pro 14-inch**

Supplier:

Amazon

Unit price:

$1,999

Contract:

Active

Preferred vendor:

Yes

Availability:

Available

Actions:

**Use catalog item**

**Compare options**

**Enter manually**

---

# 15. NON-CATALOG PURCHASE

If no catalog item exists:

Show:

> "I couldn't find an exact match in your catalog."

Then offer:

**Create non-catalog item**

**Search suppliers**

**Try another description**

Never block the user unnecessarily.

---

# 16. QUOTE IMPORT

The screenshot includes:

**Import quote**

Support quote upload.

Allow:

- PDF
- CSV
- Excel
- Image

AI should extract:

- Supplier
- Quote number
- Items
- Quantity
- Unit price
- Tax
- Shipping
- Total
- Quote date
- Validity
- Part number

Show an extraction review before adding items.

Example:

> **AI found 3 line items in this quote.**

Allow:

- Add all
- Review items
- Remove item

Never silently import financial information without review.

---

# 17. MANUAL PURCHASE REQUEST

The user can bypass AI.

Provide a structured request form.

### Request information

- Business unit
- Department
- Contact
- Requisition type
- Project
- Ship to
- Payment method
- Shipment type

### Options

- Urgent
- Delayed release
- Blanket requisition

---

# 18. LINE ITEMS

Build a powerful enterprise line-item table.

Columns:

- Line
- Description
- Part number
- Account
- Supplier
- UOM
- Quantity
- Unit price
- Tax
- Shipping
- Total

Actions:

- Add item
- Edit item
- Duplicate item
- Delete item
- Expand item
- Multi-edit
- Import file

The table must support many line items.

Do not assume only 3 items.

---

# 19. LINE ITEM DETAIL

Clicking a line item should reveal additional information without forcing users to leave the request.

Use an expandable row or contextual drawer.

Include:

- Description
- Part number
- Supplier
- Category
- Account
- Quantity
- Unit price
- Tax
- Shipping
- Delivery date
- Contract
- Budget
- Notes

---

# 20. MULTI-EDIT

Support selecting multiple line items.

Example:

Select 5 items → Multi-edit

Allow updating:

- Supplier
- Account
- Category
- Department
- Project
- Delivery date

Clearly communicate how many records are affected.

---

# 21. PURCHASE TOTAL

Calculate dynamically:

**Subtotal**

+

**Shipping**

+

**Tax**

=

**Total**

Show the total prominently.

Never show contradictory totals.

If the total changes, all relevant areas should update:

- Request total
- Budget
- Approval route
- Footer
- Supplier breakdown
- Policy checks

---

# 22. SUPPLIER BREAKDOWN

If multiple suppliers are involved, show:

### Suppliers

Amazon — $4,000

Phoenix Supplier — $462.50

Nova Distributors — $1,240

Allow users to understand why the request contains multiple suppliers.

---

# 23. BUDGET INTELLIGENCE

The AI should automatically evaluate the request against available budgets.

Example:

### Budget

IT Equipment · R&D FY26

Available:

$400

Request:

$2,392

Result:

🔴 Over budget by $1,992

Then explain:

> "This request exceeds the selected budget. You can choose another budget or request an exception."

Actions:

**Choose another budget**

**Request exception**

**Edit request**

Do not simply display a red number without explaining what the user can do.

---

# 24. POLICY INTELLIGENCE

Before submission, automatically check:

- Budget
- Preferred supplier
- Contract requirement
- Quote requirement
- Approval thresholds
- Category restrictions
- Required fields
- Required attachments

Example:

### Procurement checks

✓ Required information complete

✓ Supplier available

✓ Catalog item found

⚠ Quote required for purchases over $5,000

🔴 Budget exceeded

Each warning should be actionable.

---

# 25. DUPLICATE DETECTION

Before submission:

AI should check recent requests.

Example:

> "A similar request for 5 MacBook Pro laptops was submitted 4 days ago."

Show:

- Request ID
- Requestor
- Date
- Amount
- Status

Actions:

**View request**

**Continue anyway**

---

# 26. SMART REQUEST TITLE

AI should automatically create a useful request title.

Example:

Input:

> "I need laptops for the new engineering hires."

AI title:

**Laptops for new engineering hires**

User can edit it.

---

# 27. REQUIRED INFORMATION

The AI should understand what information is required based on:

- request type
- amount
- category
- department
- supplier
- policy
- approval workflow

Do not make every field mandatory.

Only request information when necessary.

---

# 28. PROGRESSIVE DISCLOSURE

Keep the initial request simple.

Show first:

- What are you buying?
- Quantity
- Supplier
- Required date
- Department
- Budget

Advanced information should appear only when necessary:

- Account
- Project
- Tax
- Shipping
- Contract
- Payment terms
- Supplier details
- Additional notes

---

# 29. ADDITIONAL INFORMATION

Use the screenshot's concepts but redesign them.

Support:

### Note to buyer

### Note to supplier

### Attention

Select a person.

### Supplier quote #

### Website reference

These should be optional and progressively disclosed.

---

# 30. ATTACHMENTS

Support attachments.

Examples:

- Supplier quote
- Specification
- Business case
- Approval document
- Supporting PDF

Show:

Filename

File size

Upload status

Remove action

AI can extract relevant information from uploaded documents.

---

# 31. COMMENTS

Support contextual comments.

Users can:

- add comment
- mention user
- reply
- attach file

Comments should remain associated with the purchase request.

---

# 32. APPROVAL ROUTE PREVIEW

Before submission, show:

### Approval route

1. Finance review
2. Department review
3. Final approval

For parallel approvals:

Show:

**Department review**

3 approvals required

Priya Shah

Daniel Ortiz

Lena Walsh

Clearly communicate:

> "All three reviewers must approve."

The user should understand the approval route before submitting.

---

# 33. APPROVAL ROUTE SHOULD BE DYNAMIC

The route must not be hardcoded.

Example:

If request = $800:

Manager approval

If request = $6,000:

Manager + Finance

If request = $25,000:

Manager + Finance + Procurement + Executive

If category = IT:

IT Security approval may be required.

If category = equipment:

Facilities approval may be required.

Build the logic so Admin can configure these rules.

---

# 34. FINAL REVIEW

Create a clean final review experience.

Instead of forcing the user to scan the entire form, create:

### Purchase summary

**Laptop for new hire**

4 × MacBook Pro

Estimated total:

**$7,996**

Department:

Engineering

Project:

Q4 hiring

Supplier:

Amazon

Required by:

November 1

Budget:

IT Equipment · R&D FY26

Then:

### Checks

✓ Information complete

✓ Catalog match

✓ Supplier verified

⚠ Over budget

### Approval route

You → Manager → Finance

Primary action:

**Submit for approval**

Secondary:

**Save as draft**

---

# 35. SAVE AS DRAFT

Autosave the request.

Show:

**Saved just now**

Allow the user to leave and return later.

Draft should retain:

- AI conversation context
- structured fields
- line items
- attachments
- comments
- validation results

---

# 36. SUBMISSION

Primary CTA:

**Send for approval**

After submission:

Show a proper success state.

Example:

# Request submitted

**REQ-80000166**

Your request has been sent to:

**Mark Knue**

Next:

**Finance review**

Actions:

**View request**

**Back to requests**

---

# 37. APPROVER EXPERIENCE

The approver should see a very different experience from the requestor.

Prioritize:

> **What am I approving?**

At the top:

**Laptop for new hire**

**$7,996**

**Engineering**

**Q4 hiring**

Then:

### AI summary

> "This request includes 4 MacBook Pro laptops for upcoming engineering hires. The request uses Amazon as the supplier and exceeds the selected IT equipment budget by $1,996."

Then:

### Procurement checks

✓ Catalog item

✓ Supplier verified

⚠ Budget exception

Then:

### Approval history

Then:

### Line items

Then:

### Comments / attachments

Primary actions:

**Approve**

**Request changes**

**Reject**

---

# 38. AI APPROVER ASSISTANT

Give approvers optional AI assistance.

Example:

**Ask AI about this request**

User can ask:

> "Why is this request over budget?"

> "Is Amazon a preferred supplier?"

> "What similar requests were made recently?"

> "What policy requires my approval?"

AI should answer using available procurement data.

It must not invent information.

---

# 39. APPROVAL ACTIONS

## Approve

Require confirmation only when appropriate.

## Request changes

Require a reason.

Example:

> "Please select the approved laptop model."

## Reject

Require a rejection reason.

Options:

- Budget unavailable
- Duplicate purchase
- Not required
- Policy violation
- Incorrect information
- Other

---

# 40. REQUEST DETAIL PAGE

Create a comprehensive request page.

Structure:

### Header

Request title

Request ID

Status

Total

Actions

### Overview

Request metadata

### Items

Line-item table

### Budget

Budget status

### Approval route

Timeline

### Attachments

### Comments

### Activity

Audit history

---

# 41. AUDIT TRAIL

Track:

- Request created
- AI extraction
- User edits
- Quote imported
- Supplier changed
- Budget changed
- Request submitted
- Approval
- Rejection
- Changes requested
- Resubmission

Example:

> 10:32 AM — Request created

> 10:34 AM — AI identified 3 line items

> 10:36 AM — User changed supplier

> 10:38 AM — Request submitted

> 10:41 AM — Finance approval completed

This is critical for enterprise procurement.

---

# 42. AI GLOBAL ASSISTANT

Create a global AI assistant available throughout the application.

Users can ask:

> "Create a purchase request for 10 monitors."

> "Show requests waiting for my approval."

> "Which vendors do we use for laptops?"

> "Why is this request blocked?"

> "How much budget does Engineering have left?"

> "Show purchases over $10,000 this quarter."

AI should understand the current context.

---

# 43. AI ACTION SAFETY

AI can:

- suggest
- prepare
- summarize
- classify
- extract
- compare
- recommend

AI should NOT silently:

- submit requests
- approve requests
- reject requests
- change financial values
- change suppliers
- change budgets

without explicit user confirmation where the action is consequential.

---

# 44. REQUEST STATES

Support:

- Draft
- Pending approval
- Changes requested
- Approved
- Rejected
- Cancelled
- Ordered
- Partially received
- Received

Design each status consistently.

---

# 45. SEARCH & FILTERING

Purchase Requests should support:

- Search
- Status
- Requestor
- Department
- Supplier
- Amount
- Date
- Project
- Budget
- Category

Support saved filters/views later.

Search should support natural language where appropriate.

Example:

> "Show engineering requests above $5,000 awaiting approval."

---

# 46. REQUEST LIST

Create a powerful procurement table.

Columns:

- Request ID
- Request
- Requestor
- Department
- Supplier
- Amount
- Status
- Required date
- Created date

Allow:

- sorting
- filtering
- search
- bulk selection
- column customization
- pagination

---

# 47. ADMIN DASHBOARD

Keep it operational rather than decorative.

Show:

### Pending approvals

### Purchase requests

### Spend

### Budget utilization

### Policy exceptions

### Recent activity

### AI insights

Example AI insight:

> "3 purchase requests are currently blocked by insufficient budget."

This should be actionable.

---

# 48. DESIGN SYSTEM

Create a reusable design system.

Define:

- Typography
- Spacing
- Colors
- Border
- Radius
- Shadows
- Icons
- Buttons
- Inputs
- Tables
- Dropdowns
- Comboboxes
- Drawers
- Modals
- Alerts
- Toasts
- Status badges
- AI indicators

Use one consistent visual language throughout the application.

---

# 49. PROCUREMENT-SPECIFIC UI RULE

Do not hide important financial information.

The user should always understand:

**What am I buying?**

**How much does it cost?**

**Who is supplying it?**

**Which budget pays for it?**

**Why am I being asked for approval?**

**What happens next?**

This information should never require excessive navigation.

---

# 50. RESPONSIVE BEHAVIOR

Desktop is the primary experience.

However:

### Tablet

Maintain core workflow.

### Mobile

Optimize for:

- creating simple requests
- checking status
- approving
- commenting
- notifications

Do not simply scale down the desktop table.

---

# 51. ALL REQUIRED UI STATES

Implement:

- Empty
- Loading
- Skeleton
- Success
- Error
- Validation error
- Permission denied
- Read-only
- Disabled
- Partial success
- No results
- Saving
- Saved
- Uploading
- Processing
- AI thinking
- AI extraction
- AI needs clarification

The AI processing state should feel intentional.

Example:

> **Analyzing your request…**

Then:

> **Found 3 possible items**

Then:

> **Checking your catalog and budget…**

Do not use an endless spinner.

---

# 52. AI UX STATES

Create clear states for:

### AI listening

User has entered a request.

### AI processing

Analyzing intent.

### AI clarification

Missing information.

### AI suggestion

Potential value identified.

### AI confirmation

User needs to confirm.

### AI completed

Structured request generated.

### AI unable to determine

The AI cannot confidently interpret the request.

In the last case:

> "I'm not sure which laptop configuration you need."

Provide choices instead of guessing.

---

# 53. CRITICAL DATA CONSISTENCY RULE

The attached screenshot contains some intentionally inconsistent example totals and counts.

**Do not reproduce those inconsistencies.**

All calculations must be derived from the underlying line items.

For example:

If:

1 × $1,000

25 × $18.50

4 × $310

Then the system should calculate:

**$1,000 + $462.50 + $1,240 = $2,702.50**

Do not hardcode another total.

Likewise:

- Request total
- Supplier totals
- Budget variance
- Footer total
- Approval threshold

must all derive from the same underlying data.

---

# 54. SAMPLE END-TO-END FLOW

Build and test this complete scenario.

### Admin

Login

↓

Create organization

↓

Create:

**Amit — Requestor**

↓

Create:

**Mark — Finance Approver**

↓

Create:

**Priya — IT Security Approver**

↓

Create:

**Rachel — Final Approver**

↓

Configure:

Purchases over $5,000 require Finance approval.

IT purchases require IT Security review.

Purchases over $20,000 require Executive approval.

↓

Configure:

Engineering department

IT Equipment budget

↓

Login as Amit

↓

Purchase Requests

↓

Create purchase

↓

AI asks:

> "What do you need?"

User:

> "I need 4 MacBook Pro laptops for our new engineering hires."

↓

AI finds catalog item

↓

AI asks for required date

↓

AI identifies Engineering department

↓

AI identifies Q4 hiring project

↓

AI checks budget

↓

AI checks supplier

↓

AI checks policies

↓

AI creates structured request

↓

User reviews

↓

User submits

↓

Request enters approval workflow

↓

Mark reviews

↓

AI provides summary

↓

Mark approves

↓

Priya reviews

↓

Priya approves

↓

Rachel approves if threshold requires it

↓

Request becomes:

**Approved**

↓

Audit trail records every important event.

---

# 55. FINAL PRODUCT QUALITY BAR

Before considering the implementation complete, evaluate:

### Requestor

Can someone create a request without knowing procurement terminology?

### Experienced user

Can someone create a request in under a minute when information is simple?

### Approver

Can an approver understand the financial and business context within seconds?

### Admin

Can an admin configure roles and approval workflows without technical knowledge?

### Procurement

Can procurement understand supplier, budget, policy, and approval context?

### Finance

Can finance understand the financial impact?

### AI

Does AI genuinely reduce manual work?

### Trust

Can users distinguish confirmed data from AI suggestions?

### Safety

Can AI make consequential financial changes without authorization?

It must not.

### Scalability

Does the experience still work with:

- 100 requests?
- 10,000 requests?
- 100 line items?
- multiple suppliers?
- multiple approval stages?
- parallel approvals?

---

# 56. MOST IMPORTANT DESIGN PRINCIPLE

Do not build:

> **Traditional procurement form + AI chatbot**

Build:

> **AI-native procurement workflow + structured enterprise controls**

The user should be able to start with:

> **"I need 4 laptops for our new hires."**

and progressively arrive at a complete purchase request without manually navigating dozens of fields.



**Budget control → Policy compliance → Supplier intelligence → Approval governance → Auditability**

The experience should feel like the procurement system is **doing the operational work for the user**, while the user remains in control of every important decision.

**Build the complete working product, not just the purchase-request screen.**

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7f42ef9a-1691-46f3-98fe-ea99f57371d7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
