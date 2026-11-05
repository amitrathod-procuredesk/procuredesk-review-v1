import { describe, expect, it } from 'vitest';
import {
  AGENT_CATALOG,
  AGENT_RUNS,
  filterAgents,
  modeChangeNeedsConfirm,
  nextAgentId,
  reviewProgress,
  runSummary,
  statusCounts,
  validateNewAgent,
  agentCategory,
  canCreatePolicyAgent,
  verdictCounts,
  type NewAgentDraft,
} from '../agents/domain';

describe('statusCounts', () => {
  it('counts every status plus all', () => {
    const c = statusCounts(AGENT_CATALOG);
    expect(c.all).toBe(AGENT_CATALOG.length);
    expect(c.live + c.shadow + c.paused + c.draft).toBe(c.all);
    expect(c.shadow).toBe(1); // policy agent
    expect(c.paused).toBe(1); // payment run prep
    expect(c.draft).toBe(1); // contract renewal watch
  });

  it('handles an empty directory', () => {
    expect(statusCounts([])).toEqual({ all: 0, live: 0, shadow: 0, paused: 0, draft: 0 });
  });
});

describe('filterAgents', () => {
  it('filters by status', () => {
    const live = filterAgents(AGENT_CATALOG, 'live', '');
    expect(live.every((a) => a.status === 'live')).toBe(true);
    expect(live.length).toBe(statusCounts(AGENT_CATALOG).live);
  });

  it('matches name, area and description, any case', () => {
    expect(filterAgents(AGENT_CATALOG, 'all', 'penny').map((a) => a.id)).toEqual(['penny']);
    expect(filterAgents(AGENT_CATALOG, 'all', 'INVOICES').some((a) => a.id === 'penny')).toBe(true);
    expect(filterAgents(AGENT_CATALOG, 'all', 'renewal').map((a) => a.id)).toEqual(['contract-renewal-watch']);
  });

  it('combines status and query', () => {
    expect(filterAgents(AGENT_CATALOG, 'paused', 'payment').map((a) => a.id)).toEqual(['payment-run-prep']);
    expect(filterAgents(AGENT_CATALOG, 'live', 'payment')).toEqual([]);
  });
});

describe('modeChangeNeedsConfirm', () => {
  it('asks for confirmation only when going live', () => {
    expect(modeChangeNeedsConfirm('shadow', 'live')).toBe(true);
    expect(modeChangeNeedsConfirm('paused', 'live')).toBe(true);
    expect(modeChangeNeedsConfirm('draft', 'live')).toBe(true);
    expect(modeChangeNeedsConfirm('live', 'shadow')).toBe(false);
    expect(modeChangeNeedsConfirm('live', 'paused')).toBe(false);
    expect(modeChangeNeedsConfirm('shadow', 'paused')).toBe(false);
  });
});

describe('run summaries and reviews', () => {
  const conflicted = AGENT_RUNS['policy-agent'][0];
  const clean = AGENT_RUNS['policy-agent'][2];

  it('summarises conflicts in plain words', () => {
    expect(runSummary(conflicted)).toBe('4 checks not met');
    expect(runSummary(clean)).toBe('No conflicts');
  });

  it('counts verdicts', () => {
    expect(verdictCounts(conflicted)).toEqual({ met: 3, notMet: 4, na: 1 });
    expect(verdictCounts(clean).notMet).toBe(0);
  });

  it('tracks review progress', () => {
    expect(reviewProgress(conflicted)).toEqual({ reviewed: 1, total: 8 });
    expect(reviewProgress(clean)).toEqual({ reviewed: 0, total: 8 });
  });
});

describe('validateNewAgent', () => {
  const good: NewAgentDraft = {
    name: 'Spend watchdog',
    area: 'Orders',
    triggerKind: 'schedule',
    instructions: 'Flag any order over budget.',
    mode: 'shadow',
    dos: ['Flag orders over budget'],
    donts: ['Never cancel an order'],
  };

  it('accepts a complete draft', () => {
    expect(validateNewAgent(good)).toEqual({});
  });

  it('requires name, area, trigger and instructions', () => {
    const errors = validateNewAgent({ name: ' ', area: '', triggerKind: '', instructions: '', mode: 'shadow' });
    expect(Object.keys(errors).sort()).toEqual(['area', 'donts', 'dos', 'instructions', 'name', 'trigger']);
  });

  it('ignores blank do and do-not lines', () => {
    const errors = validateNewAgent({ ...good, dos: ['  '], donts: [''] });
    expect(Object.keys(errors).sort()).toEqual(['donts', 'dos']);
  });
});

describe('agent categories', () => {
  it('treats only the sectioned agent as policy; Penny is custom', () => {
    expect(agentCategory(AGENT_CATALOG.find((a) => a.id === 'policy-agent') ?? AGENT_CATALOG[0])).toBe('policy');
    expect(agentCategory(AGENT_CATALOG.find((a) => a.id === 'penny') ?? AGENT_CATALOG[0])).toBe('custom');
  });

  it('allows a policy agent only when none exists', () => {
    expect(canCreatePolicyAgent(AGENT_CATALOG)).toBe(false);
    expect(canCreatePolicyAgent(AGENT_CATALOG.filter((a) => a.id !== 'policy-agent'))).toBe(true);
  });
});

describe('nextAgentId', () => {
  it('never collides with an existing id', () => {
    const id = nextAgentId(AGENT_CATALOG);
    expect(AGENT_CATALOG.some((a) => a.id === id)).toBe(false);
    const withClash = [...AGENT_CATALOG, { ...AGENT_CATALOG[0], id }];
    expect(nextAgentId(withClash)).not.toBe(id);
  });
});
