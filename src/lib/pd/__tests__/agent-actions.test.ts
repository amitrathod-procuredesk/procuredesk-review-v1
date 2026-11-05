import { describe, expect, it } from 'vitest';
import { addAgent, reviewVerdict, seedAgents } from '../agents/store';
import type { NewAgentDraft } from '../agents/domain';

const draft: NewAgentDraft = { name: 'Spend watchdog', area: 'Requests', triggerKind: 'manual', instructions: 'Review spending.', mode: 'shadow', category: 'custom', dos: ['  Flag risks  ', ''], donts: ['Never approve requests'] };
describe('Reference agent mutation flows', () => {
  it('creates the agent in shadow mode with cleaned guardrails and empty run history', () => {
    const s = seedAgents(); const a = addAgent(s, draft);
    expect(a.status).toBe('shadow'); expect(a.dos).toEqual(['Flag risks']);
    expect(s.agents[0].id).toBe(a.id); expect(s.runs[a.id]).toEqual([]);
    expect(s.modeHistory[a.id][0].to).toBe('Shadow');
  });
  it('keeps the one-policy-agent restriction', () => {
    expect(() => addAgent(seedAgents(), { ...draft, category: 'policy' })).toThrow('A policy agent already exists.');
  });
  it('rejects duplicate agent names', () => {
    expect(() => addAgent(seedAgents(), { ...draft, name: 'Penny' })).toThrow('An agent with this name already exists.');
  });
  it('replaces a review and clears it on a repeated click', () => {
    const s = seedAgents(); const run = s.runs['policy-agent'][0];
    reviewVerdict(s, 'policy-agent', run.id, 'po', 'right', 'You');
    expect(run.reviews.po.mark).toBe('right');
    reviewVerdict(s, 'policy-agent', run.id, 'po', 'wrong', 'You');
    expect(run.reviews.po.mark).toBe('wrong');
    reviewVerdict(s, 'policy-agent', run.id, 'po', 'wrong', 'You');
    expect(run.reviews.po).toBeUndefined();
  });
  it('keeps samples isolated when mutating settings and reviews', () => {
    const s = seedAgents(); addAgent(s, draft);
    expect(seedAgents().agents).toHaveLength(7);
  });
});