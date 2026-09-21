import { describe, expect, it } from "vitest";
import { canonicalPlanFixtures } from "../../fixtures/canonicalFixtures";
import { cloneResearchPlanToDraft, triathlonResearchPlans } from "../../fixtures/triathlonResearchFixtures";
import { buildPhaseTimeline, formatPhaseWeeks } from "../planPhaseTimeline";

describe("plan phase timeline", () => {
  it("maps the affected Research Candidate fixture from authoritative phase IDs", () => {
    const result = buildPhaseTimeline(triathlonResearchPlans[0], "RESEARCH_CANDIDATE");
    expect(result.unavailable).toBe(false);
    expect(result.entries.map(item => [item.displayName, formatPhaseWeeks(item)])).toEqual([
      ["Foundation Base", "Weeks 1–2"], ["Aerobic Build", "Week 3"], ["Recovery Block", "Week 4"],
      ["Aerobic Build", "Weeks 5–6"], ["Specific Peak", "Week 7"], ["Recovery Block", "Week 8"], ["Specific Peak", "Weeks 9–10"],
      ["Exponential Taper", "Week 11"], ["Event Execution", "Week 12"],
    ]);
    for (const entry of result.entries) {
      const scheduleNames = triathlonResearchPlans[0].weeks.filter(week => entry.weekNumbers.includes(week.weekNumber)).map(week => week.phaseName);
      expect(new Set(scheduleNames)).toEqual(new Set([entry.displayName]));
    }
    expect(result.entries.filter(item => item.displayName === "Recovery Block")).toHaveLength(2);
    expect(result.entries.find(item => item.displayName === "Recovery Block")?.recovery).toBe(true);
    expect(result.entries.find(item => item.displayName === "Exponential Taper")?.taper).toBe(true);
    expect(result.entries.find(item => item.displayName === "Event Execution")?.event).toBe(true);
  });

  it("renders every Research Candidate plan without blank entries", () => {
    for (const plan of triathlonResearchPlans) {
      const result = buildPhaseTimeline(plan, "RESEARCH_CANDIDATE");
      expect(result.unavailable, plan.name).toBe(false);
      expect(result.entries.every(entry => entry.displayName.trim() && entry.weekNumbers.length > 0), plan.name).toBe(true);
    }
  });

  it("preserves stable phase identity and boundaries when cloning without writing", () => {
    const source = triathlonResearchPlans[0];
    const draft = cloneResearchPlanToDraft(source, "human_test");
    expect(draft.phases?.map(phase => phase.phaseId)).toEqual(source.phases.map(phase => phase.phaseId));
    expect(buildPhaseTimeline(draft, "CLONED_DRAFT").definitions.map(item => item.weekNumbers)).toEqual(source.phases.map(phase => source.weeks.filter(week => week.phaseId === phase.phaseId).map(week => week.weekNumber)));
  });

  it("maps canonical phases through cycles and handles a single phase", () => {
    const result = buildPhaseTimeline(canonicalPlanFixtures[1], "CANONICAL_PLAN");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ displayName: "Foundation", firstWeek: 1, lastWeek: 4 });
    expect(formatPhaseWeeks(result.entries[0])).toBe("Weeks 1–4");
  });

  it("maps complete legacy aliases and explicit boundaries in stable order", () => {
    const result = buildPhaseTimeline({ phases: [{ id: "p2", label: "Build", startWeek: 2, endWeek: 3, order: 2 }, { id: "p1", phaseName: "Start", startWeek: 1, endWeek: 1, order: 1 }], weeks: [1, 2, 3].map(weekNumber => ({ weekNumber })) }, "LEGACY_RECONSTRUCTION");
    expect(result.entries.map(item => item.displayName)).toEqual(["Start", "Build"]);
    expect(formatPhaseWeeks(result.entries[0])).toBe("Week 1");
  });

  it.each([
    ["no phases", { phases: [], weeks: [{ weekNumber: 1 }] }],
    ["missing metadata", { weeks: [{ weekNumber: 1, label: "Unrelated UI text" }] }],
    ["blank names", { phases: [{ phaseId: "p", name: "", weekNumbers: [1] }], weeks: [{ weekNumber: 1 }] }],
    ["duplicate IDs", { phases: [{ phaseId: "p", name: "One", weekNumbers: [1] }, { phaseId: "p", name: "Two", weekNumbers: [2] }], weeks: [{ weekNumber: 1 }, { weekNumber: 2 }] }],
    ["inverted boundaries", { phases: [{ phaseId: "p", name: "Bad", startWeek: 3, endWeek: 1 }], weeks: [{ weekNumber: 1 }, { weekNumber: 2 }, { weekNumber: 3 }] }],
    ["out-of-range boundaries", { phases: [{ phaseId: "p", name: "Bad", startWeek: 1, endWeek: 3 }], weeks: [{ weekNumber: 1 }, { weekNumber: 2 }] }],
    ["unexplained overlap", { phases: [{ phaseId: "p1", name: "One", weekNumbers: [1] }, { phaseId: "p2", name: "Two", weekNumbers: [1] }], weeks: [{ weekNumber: 1 }] }],
  ])("fails closed for %s", (_label, plan) => {
    expect(buildPhaseTimeline(plan, "LEGACY_RECONSTRUCTION")).toEqual({ entries: [], definitions: [], unavailable: true });
  });
});
