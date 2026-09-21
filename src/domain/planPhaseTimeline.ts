export type PhaseTimelineSource = "RESEARCH_CANDIDATE" | "CLONED_DRAFT" | "CANONICAL_PLAN" | "LEGACY_RECONSTRUCTION";

export interface PhaseTimelineEntry {
  phaseId: string;
  displayName: string;
  purpose?: string;
  weekNumbers: number[];
  firstWeek: number;
  lastWeek: number;
  order: number;
  source: PhaseTimelineSource;
  recovery: boolean;
  taper: boolean;
  event: boolean;
}

export interface PhaseTimelineResult { entries: PhaseTimelineEntry[]; unavailable: boolean }
type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
const text = (...values: unknown[]) => values.find(value => typeof value === "string" && value.trim()) as string | undefined;
const integer = (value: unknown) => typeof value === "number" && Number.isInteger(value) ? value : undefined;
const records = (value: unknown) => Array.isArray(value) ? value.map(record).filter((item): item is UnknownRecord => item !== null) : [];

function explicitWeeks(phase: UnknownRecord, cycles: UnknownRecord[]): number[] {
  const direct = Array.isArray(phase.weekNumbers) ? phase.weekNumbers.map(integer).filter((item): item is number => item !== undefined) : [];
  if (direct.length) return direct;
  const weekIds = new Set(Array.isArray(phase.weekIds) ? phase.weekIds.filter((item): item is string => typeof item === "string") : []);
  const cycleIds = new Set(Array.isArray(phase.cycleIds) ? phase.cycleIds.filter((item): item is string => typeof item === "string") : []);
  for (const cycle of cycles) if (cycleIds.has(text(cycle.cycleId) ?? "")) for (const id of Array.isArray(cycle.weekIds) ? cycle.weekIds : []) if (typeof id === "string") weekIds.add(id);
  return [...weekIds].map(id => Number(id.match(/(?:week[_-]?)(\d+)$/i)?.[1])).filter(Number.isInteger);
}

export function buildPhaseTimeline(input: unknown, source: PhaseTimelineSource): PhaseTimelineResult {
  const plan = record(input);
  if (!plan) return { entries: [], unavailable: true };
  const phases = records(plan.phases), weeks = records(plan.weeks), cycles = records(plan.cycles);
  if (!phases.length || !weeks.length) return { entries: [], unavailable: true };
  const availableWeeks = new Set(weeks.map(week => integer(week.weekNumber) ?? integer(week.order)).filter((item): item is number => item !== undefined && item > 0));
  const seenIds = new Set<string>();
  const assignedWeeks = new Set<number>();
  const entries: PhaseTimelineEntry[] = [];
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    const phaseId = text(phase.phaseId, phase.id), displayName = text(phase.name, phase.title, phase.phaseName, phase.label);
    if (!phaseId || !displayName || seenIds.has(phaseId)) return { entries: [], unavailable: true };
    seenIds.add(phaseId);
    let weekNumbers = explicitWeeks(phase, cycles);
    const start = integer(phase.startWeek), end = integer(phase.endWeek);
    if (!weekNumbers.length && start !== undefined && end !== undefined && start <= end) weekNumbers = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
    if (!weekNumbers.length) weekNumbers = weeks.filter(week => text(week.phaseId) === phaseId).map(week => integer(week.weekNumber) ?? integer(week.order)).filter((item): item is number => item !== undefined);
    if (!weekNumbers.length) weekNumbers = weeks.filter(week => text(week.phaseName, week.phaseTitle, week.phaseLabel) === displayName).map(week => integer(week.weekNumber) ?? integer(week.order)).filter((item): item is number => item !== undefined);
    weekNumbers = [...new Set(weekNumbers)].sort((a, b) => a - b);
    if (!weekNumbers.length || weekNumbers.some(week => week < 1 || !availableWeeks.has(week))) return { entries: [], unavailable: true };
    if (weekNumbers.some(week => assignedWeeks.has(week))) return { entries: [], unavailable: true };
    weekNumbers.forEach(week => assignedWeeks.add(week));
    const recovery = weeks.some(week => weekNumbers.includes(integer(week.weekNumber) ?? integer(week.order) ?? -1) && week.recoveryWeek === true);
    const normalized = displayName.toLowerCase();
    entries.push({ phaseId, displayName, purpose: text(phase.objective, phase.phaseObjective, phase.description, phase.purpose), weekNumbers, firstWeek: weekNumbers[0], lastWeek: weekNumbers.at(-1)!, order: integer(phase.order) ?? index + 1, source, recovery, taper: normalized.includes("taper"), event: normalized.includes("event") || normalized.includes("race") });
  }
  entries.sort((a, b) => a.order - b.order);
  return { entries, unavailable: false };
}

export function formatPhaseWeeks(entry: PhaseTimelineEntry): string {
  if (entry.weekNumbers.length === 1) return `Week ${entry.weekNumbers[0]}`;
  const contiguous = entry.weekNumbers.every((week, index) => index === 0 || week === entry.weekNumbers[index - 1] + 1);
  return contiguous ? `Weeks ${entry.firstWeek}\u2013${entry.lastWeek}` : `Weeks ${entry.weekNumbers.join(", ")}`;
}
