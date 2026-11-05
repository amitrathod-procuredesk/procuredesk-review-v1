import { describe, expect, it } from 'vitest';
import { addAgent, reviewVerdict, seedAgents, changePolicyDocument } from '../agents/store';
import type { NewAgentDraft } from '../agents/domain';

const draft: NewAgentDraft = { name: 'Spend watchdog', area: 'Requests', triggerKind: 'manual', instructions: 'Review spending.', mode: 'shadow', category: 'custom', dos: ['  Flag risks  ', ''], donts: ['Never approve requests'] };
describe('Reference agent mutation flows', () => {
  it('adds a document with file contents to its policy section only', () => {
    const s = seedAgents(); const doc = { name: 'Policy', type: 'Reference' as const, file: 'policy.txt', instruction: 'Read policy', when: 'Before approval', dataUrl: 'data:text/plain;base64,UG9saWN5' };
    changePolicyDocument(s, 'policy-agent', 'po', null, doc);
    expect(s.agents.find(a => a.id === 'policy-agent')?.sections?.find(v => v.key === 'po')?.docs).toEqual([doc]);
    expect(seedAgents().agents.find(a => a.id === 'policy-agent')?.sections?.find(v => v.key === 'po')?.docs).toEqual([]);
  });
  it('modifies and replaces a document without leaving the old attachment', () => {
    const s = seedAgents(); const doc = { name: 'Updated vendor form', type: 'Form' as const, file: 'replacement.pdf', instruction: 'Complete it', when: 'New vendor' };
    changePolicyDocument(s, 'policy-agent', 'newv', 'New_vendor_setup.xlsx', doc);
    expect(s.agents.find(a => a.id === 'policy-agent')?.sections?.find(v => v.key === 'newv')?.docs).toEqual([doc]);
  });
  it('removes the selected document without removing other documents', () => {
    const s = seedAgents(); const section = s.agents.find(a => a.id === 'policy-agent')?.sections?.find(v => v.docs.length === 2);
    if (!section) throw new Error('Missing sample');
    const kept = section.docs[1]; changePolicyDocument(s, 'policy-agent', section.key, section.docs[0].file, null);
    expect(section.docs).toEqual([kept]);
  });
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