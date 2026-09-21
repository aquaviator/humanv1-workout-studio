export interface ResearchSessionSummary { sessionId: string; name: string; variableDuration: boolean; totalDurationMinutes: number; discipline: string }
interface Assignment { sessionId: string; required: boolean; assignmentType: string }
interface Day { dayOfWeek: string; dayType: string; assignments: Assignment[] }
interface Week { weekNumber: number; recoveryWeek: boolean; requiredTotalMinutes: number; optionalMinutes: number; days: Day[] }
interface PlanSummarySource { name: string; durationWeeks: number; prerequisites: unknown; weeks: Week[] }

export const evidenceDirectnessLabel = (value: string): string => ({ DIRECT: "Directly supported", EXTRAPOLATED: "Applied from related evidence" }[value] ?? "Evidence relationship unavailable");
export const evidenceVerificationLabel = (value: string): string => ({ VERIFIED: "Source verified", REQUIRES_VERIFICATION: "Further review required" }[value] ?? "Verification status unavailable");

export function researchSessionPresentation(sessionId: string, sessions: ResearchSessionSummary[]) {
  const session = sessions.find(item => item.sessionId === sessionId);
  if (!session) return { available: false as const, title: "Session details unavailable", duration: "Duration unavailable", discipline: undefined };
  return { available: true as const, title: session.name, duration: session.variableDuration ? "Variable duration" : `${session.totalDurationMinutes} min`, discipline: session.discipline };
}

export function presentationSafePhasePurpose(value?: string): { text?: string; editorialDiagnostic?: string } {
  if (!value) return {};
  if (/peak enzymatic activity/i.test(value)) return { text: "Reduce training volume while retaining selected intensity before the event.", editorialDiagnostic: "The source objective contains an unsupported specific outcome and remains available in technical details for sports-science review." };
  return { text: value };
}

export const friendlyDiscipline = (value: string): string => ({ SWIM: "Swimming", BIKE: "Cycling", RUN: "Running", STRENGTH: "Strength", MULTISPORT: "Multisport", RECOVERY: "Recovery" }[value] ?? "Discipline unavailable");
export const friendlyPhaseName = (value: string): string => ({ "Foundation Base": "Foundation Phase", Base: "Foundation Phase", Build: "Aerobic Build", "Aerobic Build": "Aerobic Build", "Specific Peak": "Race-Specific Peak", "Peak/Race-Specific": "Race-Specific Peak", "Recovery Block": "Recovery Phase", "Recovery/Deload": "Recovery Phase", "Exponential Taper": "Taper Phase", Taper: "Taper Phase", "Event Execution": "Race Week", Race: "Race Week" }[value] ?? value);

export function formatTrainingMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

const range = (values: number[], unit: string) => {
  const minimum = Math.min(...values), maximum = Math.max(...values);
  return minimum === maximum ? `${minimum} ${unit}` : `${minimum}\u2013${maximum} ${unit}`;
};

export function deriveAthletePlanOverview(plan: PlanSummarySource, sessions: ResearchSessionSummary[]) {
  const weeklyMinutes = plan.weeks.map(week => week.requiredTotalMinutes + week.optionalMinutes);
  const peakMinutes = Math.max(...weeklyMinutes), peakWeek = plan.weeks[weeklyMinutes.indexOf(peakMinutes)]?.weekNumber;
  const trainingDays = plan.weeks.map(week => week.days.filter(day => day.assignments.length > 0).length);
  const restDays = plan.weeks.map(week => week.days.length - week.days.filter(day => day.assignments.length > 0).length);
  const assigned = plan.weeks.flatMap(week => week.days).flatMap(day => day.assignments).map(item => sessions.find(session => session.sessionId === item.sessionId)).filter((item): item is ResearchSessionSummary => Boolean(item));
  const disciplines = [...new Set(assigned.map(item => friendlyDiscipline(item.discipline)))];
  const longest = (discipline: string) => assigned.filter(item => item.discipline === discipline && !item.variableDuration).sort((a, b) => b.totalDurationMinutes - a.totalDurationMinutes)[0];
  const firstTime = /^First /i.test(plan.name);
  const eventDistance = /Half Ironman/i.test(plan.name) ? "Half Ironman" : /Ironman/i.test(plan.name) ? "Ironman" : "Target event";
  return {
    eventDistance,
    experienceLevel: firstTime ? "First-time finisher" : "Intermediate",
    whoFor: firstTime ? `Athletes preparing for their first ${eventDistance}.` : `Experienced athletes preparing for ${eventDistance === "Ironman" ? "an" : "a"} ${eventDistance}.`,
    weeklyRange: `${formatTrainingMinutes(Math.min(...weeklyMinutes))}\u2013${formatTrainingMinutes(Math.max(...weeklyMinutes))}`,
    peakWeek: peakWeek ? `Week ${peakWeek} · ${formatTrainingMinutes(peakMinutes)}` : "Unavailable",
    trainingDays: range(trainingDays, "training days/week"),
    restDays: range(restDays, "rest days/week"),
    recoveryWeeks: plan.weeks.filter(week => week.recoveryWeek).map(week => week.weekNumber),
    disciplines,
    longest: { swim: longest("SWIM"), ride: longest("BIKE"), run: longest("RUN") },
    prerequisites: Array.isArray(plan.prerequisites) ? plan.prerequisites.filter((item): item is string => typeof item === "string") : [],
  };
}
