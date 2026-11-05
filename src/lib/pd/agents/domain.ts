/**
 * AI agents domain: the centralised agent directory, its statuses and modes,
 * policy sections, runs and reviews.
 *
 * Pure and free of React so the rules (filtering, mode changes, verdict
 * summaries, new-agent validation) can be tested directly. The store in
 * agentsStore.ts holds the mutable state; pages only render what these
 * helpers derive.
 */

// ---------------------------------------------------------------------------
// Statuses and modes
// ---------------------------------------------------------------------------

/**
 * live   — acts on its own when the trigger fires.
 * shadow — watches and advises in the background; changes nothing.
 * paused — temporarily off; keeps its setup and history.
 * draft  — being set up; has never run.
 */
export type AgentStatus = 'live' | 'shadow' | 'paused' | 'draft';

export type AgentArea =
  | 'Requisitions'
  | 'Requests'
  | 'Orders'
  | 'Invoices'
  | 'Contracts'
  | 'Suppliers'
  | 'Payments';

export type TriggerKind = 'event' | 'schedule' | 'manual' | 'called';

export interface TeamMember {
  name: string;
  role: string;
}

export interface PolicyDoc {
  name: string;
  type: 'Form' | 'Reference';
  file: string;
  instruction: string;
  when: string;
}

export interface PolicySection {
  key: string;
  name: string;
  version: number;
  text: string;
  docs: PolicyDoc[];
  editedBy: string;
  /** On = must be resolved before the document can move on. Off = best practice; warns but lets people proceed with a reason. */
  on: boolean;
}

export interface AgentDef {
  id: string;
  name: string;
  area: AgentArea;
  description: string;
  trigger: string;
  triggerKind: TriggerKind;
  status: AgentStatus;
  runs30d: number | null;
  lastRun: string | null;
  /** Lucide-style icon key, or 'penny' for the manager portrait. */
  icon: string;
  /** Subagents this agent manages (Penny's invoice team). */
  team?: TeamMember[];
  /** Instruction sections (policy agent). */
  sections?: PolicySection[];
  /** Guardrails written at creation: what the agent should and should not do. */
  dos?: string[];
  donts?: string[];
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Agent categories: only two kinds can exist.
// ---------------------------------------------------------------------------

export type AgentCategory = 'policy' | 'custom';

/** The policy agent is the one with policy sections; every other agent (Penny, her team, the rest) is custom. */
export function agentCategory(agent: AgentDef): AgentCategory {
  return agent.sections ? 'policy' : 'custom';
}

/** Only one policy agent may exist in the workspace. */
export function canCreatePolicyAgent(agents: AgentDef[]): boolean {
  return !agents.some((a) => agentCategory(a) === 'policy');
}

// ---------------------------------------------------------------------------
// Runs and reviews
// ---------------------------------------------------------------------------

export type Verdict = 'met' | 'not' | 'na';

export interface RunVerdict {
  key: string;
  name: string;
  verdict: Verdict;
  summary: string;
  /** The instruction text that was breached (only when not met). */
  breached?: string;
  /** Why the agent decided this (only when not met). */
  reasoning?: string;
  evidence?: { src: string; val: string }[];
}

export interface AgentRun {
  id: string;
  date: string;
  who: string;
  subject: string;
  amount: string;
  outcome: string;
  verdicts: RunVerdict[];
  /** Verdict keys a person has marked right or wrong. */
  reviews: Record<string, { mark: 'right' | 'wrong'; by: string; note?: string }>;
}

export function verdictCounts(run: AgentRun): { met: number; notMet: number; na: number } {
  return run.verdicts.reduce(
    (acc, v) => {
      if (v.verdict === 'met') acc.met += 1;
      else if (v.verdict === 'not') acc.notMet += 1;
      else acc.na += 1;
      return acc;
    },
    { met: 0, notMet: 0, na: 0 }
  );
}

/** Short human summary for a run row: "3 checks not met" or "No conflicts". */
export function runSummary(run: AgentRun): string {
  const { notMet } = verdictCounts(run);
  if (notMet === 0) return 'No conflicts';
  return `${notMet} check${notMet === 1 ? '' : 's'} not met`;
}

/** How many verdicts a person has reviewed. */
export function reviewProgress(run: AgentRun): { reviewed: number; total: number } {
  return { reviewed: Object.keys(run.reviews).length, total: run.verdicts.length };
}

// ---------------------------------------------------------------------------
// Filtering and counts
// ---------------------------------------------------------------------------

export type StatusFilter = 'all' | AgentStatus;

export function statusCounts(agents: AgentDef[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: agents.length, live: 0, shadow: 0, paused: 0, draft: 0 };
  agents.forEach((a) => {
    counts[a.status] += 1;
  });
  return counts;
}

export function filterAgents(agents: AgentDef[], filter: StatusFilter, query: string): AgentDef[] {
  const q = query.trim().toLowerCase();
  return agents.filter((a) => {
    if (filter !== 'all' && a.status !== filter) return false;
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.area.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q)
    );
  });
}

// ---------------------------------------------------------------------------
// Mode and status transitions
// ---------------------------------------------------------------------------

/**
 * Switching an agent to live always asks for confirmation, because a live
 * agent acts on real documents without a person in the loop. Every other
 * transition is safe to apply immediately.
 */
export function modeChangeNeedsConfirm(from: AgentStatus, to: AgentStatus): boolean {
  return to === 'live' && from !== 'live';
}

/** Paused agents keep their mode; resuming returns them to it. */
export function pauseAgent(agent: AgentDef): AgentStatus {
  return agent.status === 'paused' ? agent.status : 'paused';
}

// ---------------------------------------------------------------------------
// New agent validation
// ---------------------------------------------------------------------------

export interface NewAgentDraft {
  name: string;
  area: AgentArea | '';
  triggerKind: TriggerKind | '';
  instructions: string;
  mode: 'shadow' | 'live';
  category?: AgentCategory;
  dos?: string[];
  donts?: string[];
}

export function cleanRules(rules: string[] | undefined): string[] {
  return (rules ?? []).map((r) => r.trim()).filter(Boolean);
}

export function validateNewAgent(draft: NewAgentDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = 'Give the agent a name.';
  if (!draft.area) errors.area = 'Choose what the agent works on.';
  if (!draft.triggerKind) errors.trigger = 'Choose when the agent runs.';
  if (!draft.instructions.trim()) errors.instructions = 'Tell the agent what to do.';
  if (cleanRules(draft.dos).length === 0) errors.dos = 'Add at least one thing the agent should do.';
  if (cleanRules(draft.donts).length === 0) errors.donts = 'Add at least one thing the agent must not do.';
  return errors;
}

export function nextAgentId(agents: AgentDef[]): string {
  let n = agents.length + 1;
  let id = `agent-${n}`;
  while (agents.some((a) => a.id === id)) {
    n += 1;
    id = `agent-${n}`;
  }
  return id;
}

// ---------------------------------------------------------------------------
// Catalog: the agents that ship with the product
// ---------------------------------------------------------------------------

export const PENNY_TEAM: TeamMember[] = [
  { name: 'Doc Classifier', role: 'Confirms the scan is an invoice' },
  { name: 'Header Checker', role: 'Checks number, dates, amount, supplier and terms' },
  { name: 'Unit Matcher', role: 'Matches the customer name to the business unit' },
  { name: 'Supplier Matcher', role: 'Matches the supplier on the scan to the invoice' },
  { name: 'Duplicate Finder', role: 'Makes sure the invoice number is not already used' },
  { name: 'Total Checker', role: 'Compares the scanned total with the line-item total' },
  { name: 'Line Reviewer', role: 'Checks descriptions, quantity, price, tax and allocation' },
  { name: 'Period Guard', role: 'Checks for locked periods and moves the date when allowed' },
  { name: 'Approval Router', role: 'Makes sure an approval workflow and approvers exist' },
  { name: 'PO Matcher', role: 'Confirms invoice and purchase-order supplier match' },
];

const policyDocs = {
  ssForm: {
    name: 'Single-source justification form',
    type: 'Form' as const,
    file: 'Single_source_justification.docx',
    instruction: 'Complete this single-source justification and attach it to the requisition.',
    when: 'When the requester has no quotes and says the purchase is single source.',
  },
  ssRef: {
    name: 'Sole-source guidelines',
    type: 'Reference' as const,
    file: 'Sole_source_guidelines.pdf',
    instruction: 'Read this before you complete the justification. It lists what counts as a valid single source.',
    when: 'Whenever the single-source form is shown.',
  },
  nvForm: {
    name: 'New vendor form',
    type: 'Form' as const,
    file: 'New_vendor_setup.xlsx',
    instruction: 'Complete the vendor details and attach it with the supplier’s W-9.',
    when: 'When the supplier has no prior purchase orders with us.',
  },
  coi: {
    name: 'Conflict-of-interest disclosure',
    type: 'Form' as const,
    file: 'COI_disclosure.pdf',
    instruction: 'Describe the relationship, sign, and attach it. Compliance reviews it.',
    when: 'When the requester says they have a relationship with the supplier.',
  },
};

export const POLICY_SECTIONS: PolicySection[] = [
  {
    key: 'po',
    name: 'PO requirement',
    version: 3,
    text: 'Ask for a purchase order when the requisition total is greater than $5,000. Tell the requester a PO is required and link them to Create PO.',
    docs: [],
    editedBy: 'Edited by Dana Ortiz · Oct 20, 2026',
    on: true,
  },
  {
    key: 'quote',
    name: 'Quote requirement',
    version: 5,
    text: 'Purchases over $2,500 need two written quotes from different suppliers. Purchases over $25,000 need three. Grant-funded purchases (any project code starting with GR-) need three quotes regardless of amount, as the funding agreement requires. Quotes must be dated within the last 90 days and must name the supplier and the total price.\n\nIf quotes are missing, ask the requester to attach them. If the requester says only one supplier can provide the item, move to the single-source process and show the single-source justification form.\n\nFor IT purchases over $2,000, require at least one quote even when the total is under $2,500.',
    docs: [policyDocs.ssForm],
    editedBy: 'Edited by Dana Ortiz · Oct 20, 2026',
    on: true,
  },
  {
    key: 'single',
    name: 'Single-source vendor',
    version: 2,
    text: 'When quotes are required but only one supplier is used, ask the requester to complete the single-source justification and attach it to the requisition.',
    docs: [policyDocs.ssForm, policyDocs.ssRef],
    editedBy: 'Edited by Dana Ortiz · Oct 14, 2026',
    on: true,
  },
  {
    key: 'newv',
    name: 'New vendor',
    version: 2,
    text: 'If the supplier has no prior purchase orders with us, show the new-vendor process: attach a W-9 and the new vendor form. Onboarding takes 3 to 5 business days. AP reviews the vendor before the requisition can be approved.',
    docs: [policyDocs.nvForm],
    editedBy: 'ProcureDesk default',
    on: true,
  },
  {
    key: 'coi',
    name: 'Conflict of interest',
    version: 1,
    text: 'If the requester or anyone in their department has a personal or financial relationship with the supplier, ask for a conflict-of-interest disclosure and route it to Compliance for review.',
    docs: [policyDocs.coi],
    editedBy: 'ProcureDesk default',
    on: true,
  },
  {
    key: 'pref',
    name: 'Preferred vendor',
    version: 4,
    text: 'For categories with a preferred vendor, suggest the preferred vendor when a different supplier is chosen. Fasteners and anchors: Fastenal. Electrical wire and cable: Graybar. Safety equipment: Grainger.',
    docs: [],
    editedBy: 'Edited by Dana Ortiz · Oct 9, 2026',
    on: false,
  },
  {
    key: 'proc',
    name: 'Procurement engagement',
    version: 2,
    text: 'Procurement must review any requisition over $10,000, and any purchase of anchoring and fastening systems over $4,000. Add the procurement lead for the category to the approvals.',
    docs: [],
    editedBy: 'Edited by Dana Ortiz · Oct 9, 2026',
    on: true,
  },
  {
    key: 'contract',
    name: 'Contract required',
    version: 1,
    text: 'Purchases of construction materials over $2,000 from one supplier need an active supplier agreement. Check with the contract agent. If none exists, guide the requester to start a new contract before the purchase.',
    docs: [],
    editedBy: 'ProcureDesk default',
    on: true,
  },
];

export const AGENT_CATALOG: AgentDef[] = [
  {
    id: 'penny',
    name: 'Penny',
    area: 'Invoices',
    description:
      'Reviews every new invoice with her team of specialists, fixes what she safely can, and submits clean invoices for approval. Anything she cannot fix comes back to you with the reason and the fix.',
    trigger: 'New invoice',
    triggerKind: 'event',
    status: 'live',
    runs30d: 610,
    lastRun: '1m ago',
    icon: 'penny',
    team: PENNY_TEAM,
    createdBy: 'ProcureDesk default',
  },
  {
    id: 'policy-agent',
    name: 'Policy agent',
    area: 'Requisitions',
    description:
      'Checks each requisition against your purchasing policy when it is sent for approval, and tells the requester what to do next.',
    trigger: 'Sent for approval',
    triggerKind: 'event',
    status: 'shadow',
    runs30d: 312,
    lastRun: '12m ago',
    icon: 'shield',
    sections: POLICY_SECTIONS,
    createdBy: 'ProcureDesk default',
  },
  {
    id: 'contract-agent',
    name: 'Contract agent',
    area: 'Contracts',
    description:
      'Checks whether a supplier has an active agreement and starts a new contract when one is required. Called by the policy agent.',
    trigger: 'Called by another agent',
    triggerKind: 'called',
    status: 'live',
    runs30d: 41,
    lastRun: '1h ago',
    icon: 'file',
    createdBy: 'ProcureDesk default',
  },
  {
    id: 'order-follow-up',
    name: 'Order follow-up',
    area: 'Orders',
    description:
      'Chases suppliers for acknowledgement and ship dates. Updates PO status from their replies.',
    trigger: 'PO status change',
    triggerKind: 'event',
    status: 'live',
    runs30d: 386,
    lastRun: '4s ago',
    icon: 'cart',
    createdBy: 'ProcureDesk default',
  },
  {
    id: 'approval-nudge',
    name: 'Approval nudge',
    area: 'Requests',
    description:
      'Reminds approvers about requests older than 24 hours. Escalates to their manager after 72 hours.',
    trigger: 'Daily 9:00',
    triggerKind: 'schedule',
    status: 'live',
    runs30d: 104,
    lastRun: '2h ago',
    icon: 'history',
    createdBy: 'ProcureDesk default',
  },
  {
    id: 'payment-run-prep',
    name: 'Payment run prep',
    area: 'Payments',
    description: 'Bundles approved invoices due within 7 days into a proposed payment batch for AP.',
    trigger: 'Weekly Mon 8:00',
    triggerKind: 'schedule',
    status: 'paused',
    runs30d: null,
    lastRun: '3d ago',
    icon: 'card',
    createdBy: 'ProcureDesk default',
  },
  {
    id: 'contract-renewal-watch',
    name: 'Contract renewal watch',
    area: 'Suppliers',
    description: 'Watches contract end dates and flags renewals 60 days out with a spend summary.',
    trigger: 'Daily',
    triggerKind: 'schedule',
    status: 'draft',
    runs30d: null,
    lastRun: null,
    icon: 'brief',
    createdBy: 'ProcureDesk default',
  },
];

// ---------------------------------------------------------------------------
// Sample runs
// ---------------------------------------------------------------------------

const policyRunConflicts: AgentRun = {
  id: '80000056',
  date: 'Oct 27, 2026',
  who: 'John Rohn',
  subject: 'Anchoring materials for Plant 2 shutdown',
  amount: '$4,536.37',
  outcome: 'Pending approval',
  reviews: {
    quote: { mark: 'right', by: 'Dana Ortiz, Oct 28', note: 'Approver returned it for the same reason.' },
  },
  verdicts: [
    { key: 'po', name: 'PO requirement', verdict: 'met', summary: 'Total $4,536.37 is under the $5,000 threshold.' },
    {
      key: 'quote',
      name: 'Quote requirement',
      verdict: 'not',
      summary: 'Two quotes are required. One is attached.',
      breached: 'Purchases over $2,500 need two written quotes from different suppliers.',
      reasoning:
        'The total is $4,536.37, so two quotes are required. One quote is attached. No second quote and no single-source justification were found.',
      evidence: [
        { src: 'Amount', val: '$4,536.37' },
        { src: 'Supporting docs', val: '1 file: Hilti_Quotation_9261027195459.pdf' },
        { src: 'Quote, page 1', val: 'Supplier: Hilti, Inc. · Total $4,536.37' },
      ],
    },
    { key: 'single', name: 'Single-source vendor', verdict: 'na', summary: 'The requester has not said the purchase is single source.' },
    {
      key: 'newv',
      name: 'New vendor',
      verdict: 'met',
      summary: 'Supplier field is blank. Read Hilti, Inc. from the attached quote. Hilti has 14 prior purchase orders since 2021.',
    },
    { key: 'coi', name: 'Conflict of interest', verdict: 'met', summary: 'No relationship on file between John Rohn and Hilti, Inc.' },
    {
      key: 'pref',
      name: 'Preferred vendor',
      verdict: 'not',
      summary: 'The preferred vendor for anchors is Fastenal. The supplier is Hilti.',
      breached: 'Fasteners and anchors: Fastenal.',
      reasoning:
        'Both line items are anchoring products: an injectable mortar and sleeve anchors. The preferred vendor for fasteners and anchors is Fastenal. The supplier named on the quote is Hilti, Inc.',
      evidence: [
        { src: 'Line 1', val: 'INJECTABLE MORTAR HIT-HY 270' },
        { src: 'Line 2', val: 'Sleeve HIT-SC 18X85' },
        { src: 'Quote, page 1', val: 'Supplier: Hilti, Inc.' },
      ],
    },
    {
      key: 'proc',
      name: 'Procurement engagement',
      verdict: 'not',
      summary: 'Anchoring purchase over $4,000 with no procurement reviewer.',
      breached: 'Procurement must review … any purchase of anchoring and fastening systems over $4,000.',
      reasoning:
        'The total is $4,536.37 and both lines are anchoring products. The approval chain has Mike Knue (Project manager) only. No one from procurement is on it.',
      evidence: [
        { src: 'Amount', val: '$4,536.37' },
        { src: 'Approval chain', val: 'Mike Knue, Project manager' },
      ],
    },
    {
      key: 'contract',
      name: 'Contract required',
      verdict: 'not',
      summary: 'Hilti has no active supplier agreement.',
      breached: 'Purchases of construction materials over $2,000 from one supplier need an active supplier agreement.',
      reasoning:
        'The contract agent found no active agreement for Hilti, Inc. The last one (CT-0061) ended on Jun 30, 2026.',
      evidence: [
        { src: 'Contract agent', val: 'No active agreement for Hilti, Inc.' },
        { src: 'Last agreement', val: 'CT-0061, ended Jun 30, 2026' },
      ],
    },
  ],
};

const policyRunClean: AgentRun = {
  id: '80000049',
  date: 'Oct 24, 2026',
  who: 'Sara Lin',
  subject: 'Wire for Building C rough-in',
  amount: '$1,240.00',
  outcome: 'Approved',
  reviews: {},
  verdicts: [
    { key: 'po', name: 'PO requirement', verdict: 'met', summary: 'Total $1,240.00 is under the $5,000 threshold.' },
    { key: 'quote', name: 'Quote requirement', verdict: 'met', summary: 'Total is under $2,500. No quotes are required.' },
    { key: 'single', name: 'Single-source vendor', verdict: 'na', summary: 'Quotes are not required.' },
    { key: 'newv', name: 'New vendor', verdict: 'met', summary: 'Graybar has 41 prior purchase orders since 2019.' },
    { key: 'coi', name: 'Conflict of interest', verdict: 'met', summary: 'No relationship on file between Sara Lin and Graybar.' },
    { key: 'pref', name: 'Preferred vendor', verdict: 'met', summary: 'Wire and cable: Graybar is the preferred vendor.' },
    { key: 'proc', name: 'Procurement engagement', verdict: 'na', summary: 'Under $10,000 and not an anchoring or fastening purchase.' },
    { key: 'contract', name: 'Contract required', verdict: 'met', summary: 'Graybar has an active supplier agreement (CT-0098) until Mar 2027.' },
  ],
};

/** Simple run row for agents without section-level checks. */
function simpleRun(id: string, date: string, who: string, subject: string, amount: string, outcome: string, note: string): AgentRun {
  return {
    id,
    date,
    who,
    subject,
    amount,
    outcome,
    reviews: {},
    verdicts: [{ key: 'result', name: 'Result', verdict: outcome === 'Needs attention' ? 'not' : 'met', summary: note }],
  };
}

export const AGENT_RUNS: Record<string, AgentRun[]> = {
  'policy-agent': [
    policyRunConflicts,
    {
      ...policyRunClean,
      id: '80000055',
      date: 'Oct 27, 2026',
      who: 'Ana Ruiz',
      subject: 'Conveyor spares, Q4 maintenance',
      amount: '$12,880.00',
      outcome: 'Pending approval',
      verdicts: [
        { key: 'po', name: 'PO requirement', verdict: 'not', summary: 'Total $12,880.00 is over the $5,000 threshold. No PO is linked.', breached: 'Ask for a purchase order when the requisition total is greater than $5,000.', reasoning: 'The total is $12,880.00 and no purchase order is linked to the requisition.', evidence: [{ src: 'Amount', val: '$12,880.00' }] },
        { key: 'quote', name: 'Quote requirement', verdict: 'met', summary: 'Two quotes attached, dated within 90 days.' },
        { key: 'proc', name: 'Procurement engagement', verdict: 'not', summary: 'Over $10,000 with no procurement reviewer on the approval chain.', breached: 'Procurement must review any requisition over $10,000.', reasoning: 'The total is $12,880.00. The approval chain has only the department manager.', evidence: [{ src: 'Amount', val: '$12,880.00' }] },
      ],
    },
    policyRunClean,
  ],
  penny: [
    simpleRun('INV-3066', 'Today, 2:40 PM', 'Lana Steiner', 'Invoice 3066 · Acme Ltd.', '$1,203.00', 'Needs attention', 'Line 3 has no account allocation. Penny asked you to add one, then retry.'),
    simpleRun('INV-3065', 'Today, 1:58 PM', 'AP desk', 'Invoice 3065 · Parts Center Inc.', '$1,248.00', 'Needs attention', 'Scanned total $1,248.00, lines add up to $1,203.00. The $45.00 difference is above what policy lets Penny correct.'),
    simpleRun('INV-2011234', 'Today, 10:21 AM', 'Phoenix Baker', 'Invoice 2011234 · Acme Ltd.', '$8,412.50', 'Submitted', 'All ten checks passed with two safe corrections. Submitted for approval to Phoenix Baker.'),
    simpleRun('INV-3063', 'Yesterday, 11:15 AM', 'Lana Steiner', 'Invoice 3063 · Graybar', '$2,960.00', 'Submitted', 'All checks passed. Submitted for approval to Lana Steiner.'),
  ],
  'contract-agent': [
    simpleRun('CT-4412', 'Today, 9:02 AM', 'Policy agent', 'Agreement check · Hilti, Inc.', '—', 'Completed', 'No active agreement for Hilti, Inc. Last agreement CT-0061 ended Jun 30, 2026. Flagged to the policy agent.'),
    simpleRun('CT-4411', 'Yesterday, 4:18 PM', 'Policy agent', 'Agreement check · Graybar', '—', 'Completed', 'Active agreement CT-0098 found, valid until Mar 2027.'),
  ],
  'order-follow-up': [
    simpleRun('PO-6382', 'Today, 3:11 PM', 'Supplier reply', 'PO 6382 · Hilti, Inc.', '$24,180.00', 'Completed', 'Supplier acknowledged PO 6382 and confirmed ship date Nov 12. PO status updated.'),
    simpleRun('PO-6379', 'Today, 11:40 AM', 'Supplier reply', 'PO 6379 · Fastenal', '$3,412.20', 'Completed', 'No reply after two reminders. Escalated to the category buyer.'),
  ],
  'approval-nudge': [
    simpleRun('NUDGE-118', 'Today, 9:00 AM', 'Schedule', 'Daily nudge run', '—', 'Completed', '6 requests older than 24 hours. Reminders sent to 4 approvers; 2 escalated to managers after 72 hours.'),
  ],
  'payment-run-prep': [],
  'contract-renewal-watch': [],
};
