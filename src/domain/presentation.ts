export type DiagnosticCategory =
  | "MISSING_PARENT" | "ARCHIVED_PARENT" | "MISSING_EXERCISE"
  | "ORPHANED_CHILD" | "MISSING_PUBLICATION" | "MALFORMED_REFERENCE"
  | "TIMESTAMP_UNAVAILABLE";

export interface ReconstructionDiagnostic {
  category: DiagnosticCategory;
  entityType: "workout" | "plan" | "exercise" | "placement" | "set" | "publication" | "timestamp";
  referenceId?: string;
  reason: string;
  severity: "info" | "warning" | "blocking";
  recommendedAction: string;
}

type TimestampLike = { toDate?: () => Date; seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number };

export function dateFromUnknown(value: unknown): Date | null {
  if (value == null || value === "") return null;
  let candidate: Date | null = null;
  if (value instanceof Date) candidate = new Date(value.getTime());
  else if (typeof value === "string") candidate = new Date(value);
  else if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 100_000_000_000) candidate = new Date(value);
  else if (typeof value === "object") {
    const stamp = value as TimestampLike;
    if (typeof stamp.toDate === "function") candidate = stamp.toDate();
    else {
      const seconds = typeof stamp.seconds === "number" ? stamp.seconds : stamp._seconds;
      const nanos = typeof stamp.nanoseconds === "number" ? stamp.nanoseconds : stamp._nanoseconds ?? 0;
      if (typeof seconds === "number" && Number.isFinite(seconds) && Number.isFinite(nanos)) candidate = new Date(seconds * 1000 + nanos / 1_000_000);
    }
  }
  return candidate && Number.isFinite(candidate.getTime()) ? candidate : null;
}

export function formatUserDate(value: unknown, includeTime = false): string {
  const date = dateFromUnknown(value);
  if (!date) return "Timestamp unavailable";
  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
}

export function timestampDiagnostic(value: unknown): ReconstructionDiagnostic[] {
  return dateFromUnknown(value) ? [] : [{
    category: "TIMESTAMP_UNAVAILABLE", entityType: "timestamp", reason: value == null || value === "" ? "Not recorded" : "Invalid legacy timestamp",
    severity: "info", recommendedAction: "No action is required.",
  }];
}

export function referenceDiagnostic(entityType: ReconstructionDiagnostic["entityType"], referenceId: string, parent: unknown | { deletedAt?: unknown }): ReconstructionDiagnostic | null {
  if (!referenceId) return { category: "MALFORMED_REFERENCE", entityType, reason: "The original reference is malformed.", severity: "blocking", recommendedAction: "Review the original record before publishing." };
  if (parent && typeof parent === "object") {
    if ((parent as { deletedAt?: unknown }).deletedAt != null) return { category: "ARCHIVED_PARENT", entityType, referenceId, reason: "The original parent is archived.", severity: "blocking", recommendedAction: "Review the archived parent before publishing." };
    return null;
  }
  return { category: "MISSING_PARENT", entityType, referenceId, reason: "The original parent is unavailable.", severity: "blocking", recommendedAction: "Restore or verify the original parent before publishing." };
}

export const blocksPublication = (diagnostics: ReconstructionDiagnostic[] = []) => diagnostics.some(item => item.severity === "blocking");
export const dedupeDiagnostics = (diagnostics: ReconstructionDiagnostic[]) => [...new Map(diagnostics.map(item => [`${item.category}:${item.entityType}:${item.referenceId ?? ""}`, item])).values()];
