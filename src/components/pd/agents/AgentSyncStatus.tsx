import { Check, CloudAlert, LoaderCircle } from 'lucide-react';
import { syncState, useDB } from '@/lib/pd/store';

export function AgentSyncStatus() {
  useDB();
  const state = syncState();
  const Icon = state === 'saved' ? Check : state === 'error' ? CloudAlert : LoaderCircle;
  const label = state === 'saved' ? 'Saved' : state === 'error' ? 'Retrying save' : 'Saving';
  return <span role="status" aria-label={`Agent workspace: ${label}`} className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" title={state === 'error' ? 'Changes are kept on this device while the shared save retries.' : label}>
    <Icon className={state === 'saving' ? 'size-3 motion-safe:animate-spin' : 'size-3'} />{label}
  </span>;
}