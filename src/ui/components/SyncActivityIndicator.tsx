import React, { useEffect, useMemo, useState } from 'react';
import { HumanIdentity } from '../../domain/identity';
import { SyncRecord, syncManager } from '../../repositories/SyncManager';
import { formatUserDate } from '../../domain/presentation';

export default function SyncActivityIndicator({ identity }: { identity: HumanIdentity }) {
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const load = async () => setRecords((await Promise.all((['workout', 'plan', 'protocol'] as const).map(async type => [
      ...await syncManager.listSyncRecords(identity.humanUserId, type),
      ...await syncManager.listPublicationSyncRecords(identity.humanUserId, type),
    ]))).flat());
    const connectivity = () => { setOnline(navigator.onLine); void load(); };
    void load();
    const unsubscribe = syncManager.subscribe(() => void load());
    window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
    return () => { unsubscribe(); window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity); };
  }, [identity.humanUserId]);

  const summary = useMemo(() => {
    const needsAttention = (record: SyncRecord) => record.status === 'CONFLICT' || record.status === 'NEEDS_USER_REVIEW' ||
      (record.status === 'FAILED' && record.lastErrorCode !== 'NETWORK_OFFLINE' && record.lastErrorCode !== 'NETWORK_RETRYABLE');
    const attention = records.filter(needsAttention).length;
    const sending = records.filter(record => record.status === 'QUEUED' || record.status === 'SENDING' ||
      (record.status === 'FAILED' && !needsAttention(record))).length;
    const completed = records.filter(record => record.status === 'SYNCED');
    const lastCompleted = completed.map(record => record.lastCompletedAt).filter((value): value is string => Boolean(value)).sort().at(-1);
    return { attention, sending, completed, lastCompleted };
  }, [records]);

  const label = !online ? 'Offline — changes will send automatically' : summary.attention ? `${summary.attention} item${summary.attention === 1 ? ' needs' : 's need'} attention` : summary.sending ? `Sending ${summary.sending} item${summary.sending === 1 ? '' : 's'}…` : 'All changes saved';
  return <div className="sticky top-0 z-20 flex justify-end border-b border-hv-border bg-hv-bg/95 px-4 py-2">
    <button type="button" aria-expanded={open} aria-controls="sync-activity-panel" onClick={() => setOpen(value => !value)} className="rounded-full border border-hv-border bg-hv-surface-1 px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2">
      <span aria-live="polite" aria-atomic="true">{label}</span>
    </button>
    {open && <section id="sync-activity-panel" aria-label="Synchronization activity" className="absolute right-4 top-12 w-[min(24rem,calc(100vw-5rem))] rounded-lg border border-hv-border bg-hv-surface-1 p-4 shadow-xl">
      <h2 className="font-semibold">Synchronization activity</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt>On your phone or saved</dt><dd>{summary.completed.length}</dd><dt>Sending</dt><dd>{summary.sending}</dd><dt>Needs attention</dt><dd>{summary.attention}</dd></dl>
      {summary.lastCompleted && <p className="mt-3 text-xs text-hv-text-muted">Last completed {formatUserDate(summary.lastCompleted, true)}</p>}
      {summary.attention > 0 && <a href="/conflicts" className="mt-3 inline-block text-sm text-hv-primary underline">Review issues</a>}
      <details className="mt-3 text-xs text-hv-text-muted"><summary className="cursor-pointer">Technical details</summary><ul className="mt-2 space-y-1">{records.slice(0, 20).map((record, index) => <li key={`${record.type}-${record.envelope.globalId}-${index}`}>{record.type}: {record.status}{record.lastErrorCode ? ` (${record.lastErrorCode})` : ''}</li>)}</ul></details>
    </section>}
  </div>;
}
