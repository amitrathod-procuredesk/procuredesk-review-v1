import { useDB, mutate } from '../store';
import { AGENT_CATALOG, AGENT_RUNS, POLICY_SECTIONS, canCreatePolicyAgent, cleanRules, nextAgentId, validateNewAgent, type AgentDef, type AgentRun, type AgentStatus, type NewAgentDraft, type PolicyDoc } from './domain';

export interface AgentsState {
  agents: AgentDef[];
  runs: Record<string, AgentRun[]>;
  modeHistory: Record<string, { who: string; to: string; when: string; note?: string }[]>;
}
export function seedAgents(): AgentsState {
  return structuredClone({ agents: AGENT_CATALOG, runs: AGENT_RUNS, modeHistory: {
    'policy-agent': [{ who: 'Dana Ortiz', to: 'Shadow', when: 'Oct 1, 2026, 9:05 AM', note: 'Agent created' }],
    penny: [{ who: 'ProcureDesk', to: 'Live', when: 'Sep 12, 2026, 8:00 AM', note: 'Agent created' }],
  } });
}
const initial = seedAgents();
export function useAgents(): AgentsState { return useDB().agentWorkspace ?? initial; }
function update(fn: (s: AgentsState) => void) {
  mutate(d => { d.agentWorkspace ??= seedAgents(); fn(d.agentWorkspace); });
}
export function setAgentStatus(id: string, status: AgentStatus) {
  update(s => { s.agents = s.agents.map(a => a.id === id ? { ...a, status } : a); });
}
export function togglePause(id: string) {
  update(s => { s.agents = s.agents.map(a => a.id === id ? { ...a, status: a.status === 'paused' ? (a.runs30d !== null || a.id === 'penny' ? 'live' : 'shadow') : 'paused' } : a); });
}
export function setAgentMode(id: string, mode: 'shadow' | 'live', who = 'You') {
  update(s => {
    s.agents = s.agents.map(a => a.id === id ? { ...a, status: mode } : a);
    s.modeHistory[id] = [{ who, to: mode === 'live' ? 'Live' : 'Shadow', when: 'Just now' }, ...(s.modeHistory[id] ?? [])];
  });
}
export function toggleSection(agentId: string, key: string) {
  update(s => { const section = s.agents.find(a => a.id === agentId)?.sections?.find(v => v.key === key); if (section) section.on = !section.on; });
}
export function saveSectionText(agentId: string, key: string, text: string, who = 'You') {
  update(s => { const section = s.agents.find(a => a.id === agentId)?.sections?.find(v => v.key === key); if (section) { section.text = text; section.version += 1; section.editedBy = `Edited by ${who} · just now`; } });
}
export function changePolicyDocument(s: AgentsState, agentId: string, key: string, originalFile: string | null, doc: PolicyDoc | null) {
  const section = s.agents.find(a => a.id === agentId)?.sections?.find(v => v.key === key);
  if (!section) return;
  if (doc && section.docs.some(d => d.file === doc.file && d.file !== originalFile)) throw new Error('A document with this filename already exists in this section.');
  if (originalFile === null && doc) section.docs.push(structuredClone(doc));
  else section.docs = section.docs.flatMap(d => d.file === originalFile ? (doc ? [structuredClone(doc)] : []) : [d]);
  section.version += 1;
  section.editedBy = 'Edited by You · just now';
}
export function savePolicyDocument(agentId: string, key: string, originalFile: string | null, doc: PolicyDoc | null) {
  update(s => changePolicyDocument(s, agentId, key, originalFile, doc));
}
export function reviewVerdict(s: AgentsState, agentId: string, runId: string, key: string, mark: 'right' | 'wrong', who: string) {
  const run = s.runs[agentId]?.find(r => r.id === runId);
  if (!run || !run.verdicts.some(v => v.key === key)) return;
  if (run.reviews[key]?.mark === mark) delete run.reviews[key];
  else run.reviews[key] = { mark, by: who };
}
export function markVerdict(agentId: string, runId: string, key: string, mark: 'right' | 'wrong', who = 'You, just now') {
  update(s => reviewVerdict(s, agentId, runId, key, mark, who));
}
export function addAgent(s: AgentsState, draft: NewAgentDraft & { triggerLabel?: string; icon?: string }): AgentDef {
  if (Object.keys(validateNewAgent(draft)).length) throw new Error('Complete the agent setup.');
  if (s.agents.some(a => a.name === draft.name.trim())) throw new Error('An agent with this name already exists.');
  if (draft.category === 'policy' && !canCreatePolicyAgent(s.agents)) throw new Error('A policy agent already exists.');
  const agent: AgentDef = { id: nextAgentId(s.agents), name: draft.name.trim(), area: draft.area as AgentDef['area'], description: draft.instructions.trim(), trigger: draft.triggerLabel ?? 'Manual only', triggerKind: draft.triggerKind || 'manual', status: draft.mode, runs30d: null, lastRun: null, icon: draft.icon ?? 'bot', createdBy: 'Created by you · just now', dos: cleanRules(draft.dos), donts: cleanRules(draft.donts) };
  if (draft.category === 'policy') agent.sections = structuredClone(POLICY_SECTIONS);
  s.agents.unshift(agent); s.runs[agent.id] = [];
  s.modeHistory[agent.id] = [{ who: 'You', to: draft.mode === 'live' ? 'Live' : 'Shadow', when: 'Just now', note: 'Agent created' }];
  return agent;
}
export function createAgent(draft: NewAgentDraft & { triggerLabel?: string; icon?: string }): AgentDef {
  let result: AgentDef | undefined;
  update(s => { result = addAgent(s, draft); });
  if (!result) throw new Error('Could not create agent.');
  return result;
}