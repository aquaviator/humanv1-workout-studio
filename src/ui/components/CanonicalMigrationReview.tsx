import type { NormalizationPlan } from "../../domain/normalization";

const labels = {
  ALREADY_CANONICAL: "Up to date", SAFE_NORMALIZATION_AVAILABLE: "Safe format upgrade available", USER_REVIEW_REQUIRED: "Needs your input",
  OWNERSHIP_CONFLICT: "Conflict needs review", REVISION_CONFLICT: "Conflict needs review", UNSUPPORTED_SCHEMA: "Needs your input", HISTORICAL_PRESERVE_ONLY: "Historical record preserved",
} as const;

export function CanonicalMigrationReview({ plan, onApply, onOpenGuidedEditor }: { plan: NormalizationPlan; onApply?: () => void; onOpenGuidedEditor?: (globalId: string) => void }) {
  const safe = plan.commands.filter(item => item.classification === "SAFE_NORMALIZATION_AVAILABLE");
  return <section aria-labelledby="migration-review-title" className="rounded-lg border border-hv-border bg-hv-surface-1 p-4">
    <h2 id="migration-review-title" className="font-semibold">Canonical format review</h2>
    <p className="mt-1 text-sm text-hv-text-muted">Preview only. Customer-authored meaning and completed, skipped or detached history will not be replaced.</p>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt>Records inspected</dt><dd>{plan.commands.length}</dd><dt>Safe changes</dt><dd>{safe.length}</dd><dt>History affected</dt><dd>0</dd><dt>Rollback</dt><dd>Available per command</dd></dl>
    <ul className="mt-4 space-y-2">{plan.commands.map(command => <li key={command.commandId} className="rounded border border-hv-border p-2">
      <span className="font-medium">{labels[command.classification]}</span><span className="ml-2 text-xs text-hv-text-muted">{command.entityType} · {command.entityGlobalId}</span>
      {command.changes.length > 0 && <details className="mt-1 text-sm"><summary>Preview fields</summary><ul className="list-disc pl-5">{command.changes.map(change => <li key={change.fieldPath}>{change.fieldPath}: {change.reason}</li>)}</ul></details>}
      {command.reviewIssues.map(issue => <p key={issue} className="mt-1 text-sm text-hv-warning">{issue}</p>)}
      {command.classification === "USER_REVIEW_REQUIRED" && onOpenGuidedEditor && <button type="button" className="mt-2 rounded border border-hv-border px-2 py-1 text-sm" onClick={() => onOpenGuidedEditor(command.entityGlobalId)}>Open guided editor</button>}
    </li>)}</ul>
    {onApply && <button type="button" disabled={safe.length === 0} onClick={onApply} className="mt-4 rounded bg-hv-primary px-3 py-2 font-medium text-hv-background disabled:opacity-50">Apply approved safe upgrades</button>}
  </section>;
}
