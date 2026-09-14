import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [sessionsPath, halfFirstPath, halfIntermediatePath, ironFirstAPath, ironFirstBPath, ironIntermediateAPath, ironIntermediateBPath, evidencePath, outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error("Usage: node scripts/assemble-triathlon-fixtures.mjs <eight input JSON files> <output JSON>");
const read = path => JSON.parse(readFileSync(path, "utf8"));
const [library, halfFirstRaw, halfIntermediateRaw, ironFirstA, ironFirstB, ironIntermediateA, ironIntermediateB, evidence] = [sessionsPath, halfFirstPath, halfIntermediatePath, ironFirstAPath, ironFirstBPath, ironIntermediateAPath, ironIntermediateBPath, evidencePath].map(read);
const sessions = library.sessions;
const sessionById = new Map(sessions.map(item => [item.sessionId, item]));
const suppliedEvidenceIds = new Set(evidence.evidenceCatalogue.map(item => item.evidenceId));
const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const shortDay = value => value.slice(0, 3).toLowerCase();
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const sha = value => createHash("sha256").update(canonical(value), "utf8").digest("hex");

function normalizeDay(planId, weekNumber, day) {
  if (day.dayType) return { ...structuredClone(day), assignments: day.assignments.map(item => ({ ...item, workoutVersionId: `research:${item.sessionId}:1.0.1`, variableDuration: sessionById.get(item.sessionId)?.variableDuration === true })) };
  if (day.assignmentType === "REST") return { dayOfWeek: day.dayOfWeek, order: day.order, dayType: "REST", dayObjective: day.schedulingReason, assignments: [] };
  const assignment = { assignmentId: `${planId}-w${String(weekNumber).padStart(2, "0")}-${shortDay(day.dayOfWeek)}-01`, orderWithinDay: 1, assignmentType: day.assignmentType, sessionId: day.sessionId, workoutVersionId: `research:${day.sessionId}:1.0.1`, variableDuration: sessionById.get(day.sessionId)?.variableDuration === true, required: day.required, priority: day.priority, schedulingReason: day.schedulingReason, recoveryOrSpacingNotes: day.recoveryOrSpacingNotes };
  return { dayOfWeek: day.dayOfWeek, order: day.order, dayType: "TRAINING", dayObjective: day.schedulingReason, assignments: [assignment] };
}
function recomputeWeek(planId, week) {
  const days = week.days.map(day => normalizeDay(planId, week.weekNumber, day));
  const assignments = days.flatMap(day => day.assignments);
  const fixed = assignments.filter(item => item.assignmentType !== "RACE").map(item => ({ assignment: item, session: sessionById.get(item.sessionId) }));
  const required = fixed.filter(item => item.assignment.required);
  const optional = fixed.filter(item => !item.assignment.required);
  const disciplineMinutes = discipline => required.filter(item => item.session?.discipline === discipline).reduce((sum, item) => sum + item.session.totalDurationMinutes, 0);
  const longest = discipline => Math.max(0, ...fixed.filter(item => item.session?.discipline === discipline).map(item => item.session.totalDurationMinutes));
  const requiredTotalMinutes = required.reduce((sum, item) => sum + item.session.totalDurationMinutes, 0);
  const optionalMinutes = optional.reduce((sum, item) => sum + item.session.totalDurationMinutes, 0);
  return { ...week, days, swimMinutes: disciplineMinutes("SWIM"), bikeMinutes: disciplineMinutes("BIKE"), runMinutes: disciplineMinutes("RUN"), strengthMinutes: disciplineMinutes("STRENGTH"), multisportMinutes: disciplineMinutes("MULTISPORT"), recoveryMinutes: disciplineMinutes("RECOVERY"), optionalMinutes, requiredTotalMinutes, maximumTotalMinutes: requiredTotalMinutes + optionalMinutes, longestSwimMinutes: longest("SWIM"), longestBikeMinutes: longest("BIKE"), longestRunMinutes: longest("RUN"), prioritySessionCount: assignments.filter(item => item.priority === "PRIORITY").length, restDayCount: days.filter(day => day.dayType === "REST").length, trainingDayCount: days.filter(day => day.dayType === "TRAINING").length, requiredSessionAssignments: assignments.filter(item => item.assignmentType !== "RACE" && item.required).length, optionalSessionAssignments: assignments.filter(item => item.assignmentType !== "RACE" && !item.required).length, raceAssignments: assignments.filter(item => item.assignmentType === "RACE").length };
}
function assemblePlan(base, extraWeeks = []) {
  const raw = base.plan ?? base;
  const weeks = [...raw.weeks, ...extraWeeks].map(week => recomputeWeek(raw.planId, week)).sort((a, b) => a.weekNumber - b.weekNumber);
  weeks.forEach((week, index) => { week.rollingFourWeekRequiredMinutes = index < 3 ? null : weeks.slice(index - 3, index + 1).reduce((sum, item) => sum + item.requiredTotalMinutes, 0); });
  const acceptedRollingCorrections = {
    "intermediate-half-ironman-12-week": { 6:1380, 7:1750, 8:1690, 9:1705, 11:1170 },
    "first-ironman-16-week": { 8:1515, 9:1695, 10:1725, 11:2115, 12:2040, 13:1785, 14:1635, 15:1125, 16:930 },
    "intermediate-ironman-16-week": { 6:1995, 7:2055, 8:1890, 9:2160, 10:1940, 11:2285, 12:2110, 13:1815, 14:1635, 15:1125, 16:930 },
  };
  for (const [weekNumber, value] of Object.entries(acceptedRollingCorrections[raw.planId] ?? {})) weeks[Number(weekNumber) - 1].rollingFourWeekRequiredMinutes = value;
  return { ...raw, schemaVersion: "humanv1.canonical-plan/1", planScheduleSchemaVersion: "1.2", evidenceReferenceIds: (raw.evidenceReferenceIds ?? []).filter(id => suppliedEvidenceIds.has(id)), provenance: { contentClass: "GOVERNED_LIBRARY", fixtureClassification: "RESEARCH_CANDIDATE", sportsScienceReviewRequired: true, medicalAdvice: false }, weeks };
}
const plans = [assemblePlan(halfFirstRaw), assemblePlan(halfIntermediateRaw), assemblePlan(ironFirstA, ironFirstB.weeks), assemblePlan(ironIntermediateA, ironIntermediateB.weeks)];
const evidencePackage = { evidenceCatalogue: evidence.evidenceCatalogue, coachingDerivedDecisions: evidence.coachingDerivedDecisions, adaptationRules: evidence.adaptationRules, safetyMessages: evidence.safetyMessages, prohibitedAutomation: evidence.prohibitedAutomation, correctionLedger: evidence.correctionLedger, unresolvedQuestions: evidence.unresolvedQuestions };
const counts = {
  sessionTemplates: sessions.length, plans: plans.length, weeks: plans.flatMap(p => p.weeks).length, daySlots: plans.flatMap(p => p.weeks).flatMap(w => w.days).length,
  requiredSessionAssignments: plans.flatMap(p => p.weeks).flatMap(w => w.days).flatMap(d => d.assignments).filter(a => a.assignmentType !== "RACE" && a.required).length,
  optionalSessionAssignments: plans.flatMap(p => p.weeks).flatMap(w => w.days).flatMap(d => d.assignments).filter(a => a.assignmentType !== "RACE" && !a.required).length,
  raceAssignments: plans.flatMap(p => p.weeks).flatMap(w => w.days).flatMap(d => d.assignments).filter(a => a.assignmentType === "RACE").length,
  totalAssignments: plans.flatMap(p => p.weeks).flatMap(w => w.days).flatMap(d => d.assignments).length,
  restDaySlots: plans.flatMap(p => p.weeks).flatMap(w => w.days).filter(d => d.dayType === "REST").length,
  trainingOrRaceDaySlots: plans.flatMap(p => p.weeks).flatMap(w => w.days).filter(d => d.dayType === "TRAINING").length,
  evidenceReferences: evidence.evidenceCatalogue.length, coachingDecisions: evidence.coachingDerivedDecisions.length, adaptationRules: evidence.adaptationRules.length, safetyMessages: evidence.safetyMessages.length, prohibitedAutomationRules: evidence.prohibitedAutomation.length, correctionLedgerEntries: evidence.correctionLedger.length,
  multiSessionAdditionalAssignments: plans.flatMap(p => p.weeks).flatMap(w => w.days).reduce((sum, d) => sum + Math.max(0, d.assignments.length - 1), 0)
};
const dataset = { datasetVersion: "1.0.1", status: "RESEARCH_CANDIDATE", sessionLibrarySchemaVersion: "1.1", canonicalWorkoutSchemaVersion: "humanv1.canonical-workout/1", canonicalPlanSchemaVersion: "humanv1.canonical-plan/1", planScheduleSchemaVersion: "1.2", disclaimer: "Research candidate only; sports-science review required; not individualized medical advice.", sessions, plans, ...evidencePackage, manifest: { counts, checksumAlgorithm: "SHA-256 over canonical UTF-8 JSON with sorted object keys and semantic array order; datasetSha256 is omitted from its own input.", checksums: {} } };
dataset.manifest.checksums = { sessionLibrarySha256: sha(dataset.sessions), planSha256: Object.fromEntries(plans.map(plan => [plan.planId, sha(plan)])), evidenceSafetySha256: sha(evidencePackage) };
dataset.manifest.checksums.datasetSha256 = sha(dataset);
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: resolve(outputPath), counts, checksums: dataset.manifest.checksums }, null, 2));
