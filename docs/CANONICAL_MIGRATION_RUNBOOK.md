# Canonical migration runbook — disabled

Production migration is intentionally disabled and was not executed. Enabling it requires separate authorization after a read-only, owner-scoped inventory reports previewed counts.

1. Pin the exact shared contract and application commits.
2. Inventory only an authenticated owner scope; classify every record and quarantine conflicts or incomplete parents.
3. Produce a deterministic dry-run command plan in bounded batches (maximum 500), including expected revision, before/after fields, rollback snapshot, checkpoint, and history-unaffected assertion.
4. Obtain explicit approval for the previewed batch. Never treat user-authored data as governed library data.
5. Apply only through a governed backend that rechecks owner and revision. The current implementation refuses apply unless the caller explicitly identifies an emulator.
6. Persist an audit event and checkpoint after each command. Resume from the checkpoint using the same command identities.
7. Rerun the plan: identical records must produce no writes or audit events.
8. On an authorized rollback, use the stored per-command before image only when its revision precondition still holds. Conflicts return to review.

No global reset operation exists. Historical executions, completed/skipped occurrences, and detached history are immutable. Firestore production data, rules, Functions, Hosting, Auth, App Check, DNS, IAM, and devices are outside this runbook’s authorization.
