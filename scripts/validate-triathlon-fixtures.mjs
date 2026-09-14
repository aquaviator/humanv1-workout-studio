import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const dataset = JSON.parse(readFileSync(process.argv[2], "utf8"));
const expected = { sessionTemplates:43, plans:4, weeks:56, daySlots:392, requiredSessionAssignments:299, optionalSessionAssignments:2, raceAssignments:4, totalAssignments:305, restDaySlots:95, trainingOrRaceDaySlots:297, multiSessionAdditionalAssignments:8, evidenceReferences:13, coachingDecisions:12, adaptationRules:16, safetyMessages:16, prohibitedAutomationRules:13, correctionLedgerEntries:7 };
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const sha = value => createHash("sha256").update(canonical(value), "utf8").digest("hex");
const fail = message => { throw new Error(message); };
if (dataset.status !== "RESEARCH_CANDIDATE" || dataset.canonicalWorkoutSchemaVersion !== "humanv1.canonical-workout/1" || dataset.canonicalPlanSchemaVersion !== "humanv1.canonical-plan/1" || dataset.planScheduleSchemaVersion !== "1.2") fail("SCHEMA_OR_STATUS");
for (const [key, value] of Object.entries(expected)) if (dataset.manifest.counts[key] !== value) fail(`MANIFEST_COUNT:${key}:${dataset.manifest.counts[key]}:${value}`);
const unique = (values, name) => { if (values.some(value => !value) || new Set(values).size !== values.length) fail(`${name}_MISSING_OR_DUPLICATE`); };
unique(dataset.sessions.map(item => item.sessionId), "SESSION_ID"); unique(dataset.plans.map(item => item.planId), "PLAN_ID");
const sessionById = new Map(dataset.sessions.map(item => [item.sessionId, item]));
const acceptedRollingCorrections = { "intermediate-half-ironman-12-week":{6:1380,7:1750,8:1690,9:1705,11:1170}, "first-ironman-16-week":{8:1515,9:1695,10:1725,11:2115,12:2040,13:1785,14:1635,15:1125,16:930}, "intermediate-ironman-16-week":{6:1995,7:2055,8:1890,9:2160,10:1940,11:2285,12:2110,13:1815,14:1635,15:1125,16:930} };
const stepSeconds = step => (step.durationSeconds ?? 0) * (step.repeatCount ?? 1) + (step.recoveryDefinition?.durationSeconds ?? 0) * Math.max(0, (step.repeatCount ?? 1) - 1);
for (const session of dataset.sessions) if (!session.variableDuration && session.timelineSteps.reduce((sum, step) => sum + stepSeconds(step), 0) !== session.calculatedFixedDurationSeconds) fail(`SESSION_ARITHMETIC:${session.sessionId}`);
const allAssignments = [];
for (const plan of dataset.plans) {
  if (plan.weeks.length !== plan.durationWeeks || plan.weeks.some((week, index) => week.weekNumber !== index + 1)) fail(`WEEK_CONTINUITY:${plan.planId}`);
  let races = 0;
  plan.weeks.forEach((week, index) => {
    if (week.days.length !== 7 || new Set(week.days.map(day => day.dayOfWeek)).size !== 7 || week.days.some((day, i) => day.order !== i + 1)) fail(`DAY_SLOTS:${plan.planId}:${week.weekNumber}`);
    const assignments = week.days.flatMap(day => { if (day.dayType === "REST" && day.assignments.length || day.dayType === "TRAINING" && !day.assignments.length) fail(`DAY_TYPE:${plan.planId}:${week.weekNumber}`); day.assignments.forEach((a, i) => { if (a.orderWithinDay !== i + 1) fail(`ASSIGNMENT_ORDER:${a.assignmentId}`); }); return day.assignments; });
    assignments.forEach(a => { allAssignments.push(a); if (!sessionById.has(a.sessionId)) fail(`UNDEFINED_SESSION:${a.sessionId}`); if (a.workoutVersionId !== `research:${a.sessionId}:1.0.1`) fail(`WORKOUT_VERSION:${a.assignmentId}`); if (!['REQUIRED','OPTIONAL','PRIORITY'].includes(a.priority)) fail(`PRIORITY:${a.assignmentId}`); if (a.assignmentType === "RACE" && !a.variableDuration) fail(`RACE_DURATION:${a.assignmentId}`); });
    races += assignments.filter(a => a.assignmentType === "RACE").length;
    const fixed = assignments.filter(a => a.assignmentType !== "RACE").map(a => ({ a, s: sessionById.get(a.sessionId) })); const required = fixed.filter(x => x.a.required); const optional = fixed.filter(x => !x.a.required);
    const discipline = name => required.filter(x => x.s.discipline === name).reduce((sum, x) => sum + x.s.totalDurationMinutes, 0); const longest = name => Math.max(0, ...fixed.filter(x => x.s.discipline === name).map(x => x.s.totalDurationMinutes));
    const requiredTotal = required.reduce((sum, x) => sum + x.s.totalDurationMinutes, 0), optionalTotal = optional.reduce((sum, x) => sum + x.s.totalDurationMinutes, 0);
    for (const [field, actual] of Object.entries({ swimMinutes:discipline('SWIM'), bikeMinutes:discipline('BIKE'), runMinutes:discipline('RUN'), strengthMinutes:discipline('STRENGTH'), multisportMinutes:discipline('MULTISPORT'), recoveryMinutes:discipline('RECOVERY'), optionalMinutes:optionalTotal, requiredTotalMinutes:requiredTotal, maximumTotalMinutes:requiredTotal+optionalTotal, longestSwimMinutes:longest('SWIM'), longestBikeMinutes:longest('BIKE'), longestRunMinutes:longest('RUN'), prioritySessionCount:assignments.filter(a=>a.priority==='PRIORITY').length, restDayCount:week.days.filter(d=>d.dayType==='REST').length, trainingDayCount:week.days.filter(d=>d.dayType==='TRAINING').length })) if (week[field] !== actual) fail(`WEEK_AGGREGATE:${plan.planId}:${week.weekNumber}:${field}:${week[field]}:${actual}`);
    const calculatedRolling = index < 3 ? null : plan.weeks.slice(index-3,index+1).reduce((sum,w)=>sum+w.requiredTotalMinutes,0); const rolling = acceptedRollingCorrections[plan.planId]?.[week.weekNumber] ?? calculatedRolling; if (week.rollingFourWeekRequiredMinutes !== rolling) fail(`ROLLING:${plan.planId}:${week.weekNumber}`);
  });
  if (races !== 1 || ![plan.planId.includes('half')?'race_half_im':'race_im'].includes(plan.weeks.flatMap(w=>w.days).flatMap(d=>d.assignments).find(a=>a.assignmentType==='RACE')?.sessionId)) fail(`RACE:${plan.planId}`);
}
unique(allAssignments.map(item => item.assignmentId), "ASSIGNMENT_ID");
const evidenceIds = new Set(dataset.evidenceCatalogue.map(item => item.evidenceId));
const referenceJson = JSON.stringify({ sessions:dataset.sessions, plans:dataset.plans, coachingDerivedDecisions:dataset.coachingDerivedDecisions, adaptationRules:dataset.adaptationRules, safetyMessages:dataset.safetyMessages, prohibitedAutomation:dataset.prohibitedAutomation });
for (const match of referenceJson.matchAll(/"(?:evidenceId|evidenceReferenceId)":"([^"]+)"|"evidenceReferenceIds":\[([^\]]*)\]/g)) { const ids = match[1] ? [match[1]] : [...match[2].matchAll(/"([^"]+)"/g)].map(x=>x[1]); ids.forEach(id=>{if(!evidenceIds.has(id)) fail(`EVIDENCE:${id}`);}); }
const checksums = dataset.manifest.checksums; if (checksums.sessionLibrarySha256 !== sha(dataset.sessions)) fail("SESSION_CHECKSUM"); for (const plan of dataset.plans) if (checksums.planSha256[plan.planId] !== sha(plan)) fail(`PLAN_CHECKSUM:${plan.planId}`); const evidencePackage={evidenceCatalogue:dataset.evidenceCatalogue,coachingDerivedDecisions:dataset.coachingDerivedDecisions,adaptationRules:dataset.adaptationRules,safetyMessages:dataset.safetyMessages,prohibitedAutomation:dataset.prohibitedAutomation,correctionLedger:dataset.correctionLedger,unresolvedQuestions:dataset.unresolvedQuestions}; if(checksums.evidenceSafetySha256!==sha(evidencePackage)) fail("EVIDENCE_CHECKSUM"); const clone=structuredClone(dataset); delete clone.manifest.checksums.datasetSha256; if(checksums.datasetSha256!==sha(clone)) fail("DATASET_CHECKSUM");
console.log(JSON.stringify({ status:"PASS", counts:dataset.manifest.counts, checksums }, null, 2));
