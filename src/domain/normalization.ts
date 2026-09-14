import { canonicalChecksum, CanonicalPlan, CanonicalWorkout, ContentClass, validateCanonicalPlan, validateCanonicalWorkout } from "./canonical";

export type NormalizationClassification = "ALREADY_CANONICAL" | "SAFE_NORMALIZATION_AVAILABLE" | "USER_REVIEW_REQUIRED" | "OWNERSHIP_CONFLICT" | "REVISION_CONFLICT" | "UNSUPPORTED_SCHEMA" | "HISTORICAL_PRESERVE_ONLY";
export interface LegacyRecord { entityType: "workout" | "plan" | "historical"; globalId: string; humanUserId: string; revision: number; schemaVersion: string; contentClass: ContentClass; payload: Record<string, unknown>; remoteRevision?: number }
export interface NormalizationChange { fieldPath: string; before: unknown; after: unknown; reason: string }
export interface NormalizationCommand { commandId: string; entityType: LegacyRecord["entityType"]; entityGlobalId: string; expectedRevision: number; classification: NormalizationClassification; changes: NormalizationChange[]; reviewIssues: string[]; before: LegacyRecord; after?: LegacyRecord; rollback: LegacyRecord; historyUnaffected: true }
export interface NormalizationPlan { mode: "DRY_RUN"; owner: string; commands: NormalizationCommand[]; checkpoint: string; classifications: Record<NormalizationClassification, number> }
export interface NormalizationAudit { auditId: string; commandId: string; owner: string; appliedAt: string; beforeChecksum: string; afterChecksum: string }

const supported = new Set(["humanv1.workout/1", "humanv1.plan/1", "humanv1.canonical-workout/1", "humanv1.canonical-plan/1"]);
const stableCommandId = (owner: string, record: LegacyRecord) => `normalize_${canonicalChecksum(`${owner}|${record.entityType}|${record.globalId}|${record.revision}`).slice(0, 20)}`;
function classify(owner: string, record: LegacyRecord): NormalizationClassification {
  if (record.humanUserId !== owner) return "OWNERSHIP_CONFLICT";
  if (record.remoteRevision !== undefined && record.remoteRevision > record.revision) return "REVISION_CONFLICT";
  if (record.contentClass === "HISTORICAL_EXECUTION") return "HISTORICAL_PRESERVE_ONLY";
  if (!supported.has(record.schemaVersion)) return "UNSUPPORTED_SCHEMA";
  if (record.contentClass === "CONFLICTED") return "REVISION_CONFLICT";
  if (record.entityType === "workout") {
    const blocks = record.payload.blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) return "USER_REVIEW_REQUIRED";
  }
  if (record.contentClass === "LEGACY_INCOMPLETE") return "USER_REVIEW_REQUIRED";
  if (record.schemaVersion.startsWith("humanv1.canonical-")) return "ALREADY_CANONICAL";
  return "SAFE_NORMALIZATION_AVAILABLE";
}
function normalizePayload(record: LegacyRecord): { payload: Record<string, unknown>; changes: NormalizationChange[] } {
  const payload = structuredClone(record.payload); const changes: NormalizationChange[] = [];
  const idField = record.entityType === "workout" ? "workoutGlobalId" : "planGlobalId";
  const oldField = record.entityType === "workout" ? "workoutId" : "planId";
  if (!payload[idField] && payload[oldField] === record.globalId) { payload[idField] = record.globalId; changes.push({ fieldPath: idField, before: undefined, after: record.globalId, reason: "Canonical field-name conversion" }); }
  const canonicalVersion = record.entityType === "workout" ? "humanv1.canonical-workout/1" : "humanv1.canonical-plan/1";
  if (payload.schemaVersion !== canonicalVersion) { changes.push({ fieldPath: "schemaVersion", before: payload.schemaVersion, after: canonicalVersion, reason: "Canonical schema marker" }); payload.schemaVersion = canonicalVersion; }
  for (const key of ["description", "notes"]) if (payload[key] === "") { changes.push({ fieldPath: key, before: "", after: null, reason: "Blank/null equivalence" }); payload[key] = null; }
  return { payload, changes };
}
export function planNormalization(owner: string, records: readonly LegacyRecord[], batchLimit = 100): NormalizationPlan {
  if (batchLimit < 1 || batchLimit > 500) throw new Error("INVALID_BATCH_LIMIT");
  const grouped = new Map<string, LegacyRecord[]>();
  records.forEach(record => { const key = `${record.entityType}:${record.globalId}`; grouped.set(key, [...(grouped.get(key) ?? []), record]); });
  const inventory = [...grouped.values()].map(group => {
    const uniquePayloads = new Set(group.map(item => canonicalChecksum(item)));
    return uniquePayloads.size === 1 ? group[0] : { ...group[0], contentClass: "CONFLICTED" as const };
  });
  const commands = inventory.sort((a, b) => `${a.entityType}:${a.globalId}`.localeCompare(`${b.entityType}:${b.globalId}`)).slice(0, batchLimit).map(record => {
    const classification = classify(owner, record); const normalized = classification === "SAFE_NORMALIZATION_AVAILABLE" ? normalizePayload(record) : null;
    const after = normalized ? { ...structuredClone(record), schemaVersion: normalized.payload.schemaVersion as string, payload: normalized.payload } : undefined;
    const reviewIssues = classification === "USER_REVIEW_REQUIRED" && record.entityType === "workout" && (!Array.isArray(record.payload.blocks) || record.payload.blocks.length === 0)
      ? ["Missing executable blocks, exercise references, and recorded set prescriptions."] : [];
    return { commandId: stableCommandId(owner, record), entityType: record.entityType, entityGlobalId: record.globalId, expectedRevision: record.revision,
      classification, changes: normalized?.changes ?? [], reviewIssues, before: structuredClone(record), after, rollback: structuredClone(record), historyUnaffected: true as const };
  });
  const names: NormalizationClassification[] = ["ALREADY_CANONICAL","SAFE_NORMALIZATION_AVAILABLE","USER_REVIEW_REQUIRED","OWNERSHIP_CONFLICT","REVISION_CONFLICT","UNSUPPORTED_SCHEMA","HISTORICAL_PRESERVE_ONLY"];
  const classifications = Object.fromEntries(names.map(name => [name, commands.filter(command => command.classification === name).length])) as Record<NormalizationClassification, number>;
  return { mode: "DRY_RUN", owner, commands, checkpoint: canonicalChecksum(commands.map(command => command.commandId)), classifications };
}
export function applyNormalizationInEmulator(plan: NormalizationPlan, current: readonly LegacyRecord[], emulator: boolean, appliedAt: string): { records: LegacyRecord[]; audits: NormalizationAudit[] } {
  if (!emulator) throw new Error("PRODUCTION_MIGRATION_DISABLED");
  const records = current.map(item => structuredClone(item)); const audits: NormalizationAudit[] = [];
  for (const command of plan.commands.filter(item => item.classification === "SAFE_NORMALIZATION_AVAILABLE")) {
    const index = records.findIndex(item => item.entityType === command.entityType && item.globalId === command.entityGlobalId);
    if (index < 0 || records[index].humanUserId !== plan.owner) throw new Error("OWNERSHIP_CONFLICT");
    if (records[index].revision !== command.expectedRevision) throw new Error("REVISION_CONFLICT");
    if (!command.after) continue;
    const beforeChecksum = canonicalChecksum(records[index]); const afterChecksum = canonicalChecksum(command.after);
    if (beforeChecksum === afterChecksum) continue;
    records[index] = structuredClone(command.after);
    audits.push({ auditId: `audit_${command.commandId}`, commandId: command.commandId, owner: plan.owner, appliedAt, beforeChecksum, afterChecksum });
  }
  return { records, audits };
}
export const canonicalRecordValid = (value: CanonicalWorkout | CanonicalPlan): boolean => "workoutGlobalId" in value ? validateCanonicalWorkout(value).length === 0 : validateCanonicalPlan(value).length === 0;
