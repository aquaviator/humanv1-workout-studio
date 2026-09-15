import { useState } from "react";
import { triathlonResearchDataset, triathlonResearchPlans, type ResearchPlan } from "../../fixtures/triathlonResearchFixtures";

const disciplineFields = [["Swim", "swimMinutes"], ["Bike", "bikeMinutes"], ["Run", "runMinutes"], ["Strength", "strengthMinutes"], ["Multisport", "multisportMinutes"], ["Recovery", "recoveryMinutes"]] as const;
export function TriathlonResearchLibrary({ onClone, mutationDisabled = false }: { onClone: (plan: ResearchPlan) => void | Promise<void>; mutationDisabled?: boolean }) {
  const [selected, setSelected] = useState(triathlonResearchPlans[0].planId);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const plan = triathlonResearchPlans.find(item => item.planId === selected)!;
  const totals = Object.fromEntries(disciplineFields.map(([label, field]) => [label, plan.weeks.reduce((sum, week) => sum + week[field], 0)]));
  return <section aria-labelledby="research-library-title" className="mt-10 border-t border-hv-border pt-6">
    <h2 id="research-library-title" className="text-xl font-bold">Triathlon research plans</h2>
    <p className="mt-1 text-sm text-hv-warning">Research Candidate · Sports-science review required · Not individualized medical advice</p>
    <div role="tablist" aria-label="Triathlon research plans" className="mt-4 flex flex-wrap gap-2">{triathlonResearchPlans.map(item => <button key={item.planId} role="tab" aria-selected={item.planId === selected} onClick={() => setSelected(item.planId)} className="rounded border border-hv-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-hv-primary">{item.name}</button>)}</div>
    <article className="mt-4 rounded-lg border border-hv-border bg-hv-surface-1 p-4">
      <h3 className="font-semibold">{plan.name} — {plan.durationWeeks} weeks</h3>
      <h4 className="mt-3 font-medium">Prerequisites</h4><p className="text-sm text-hv-text-muted">{Array.isArray(plan.prerequisites) ? plan.prerequisites.join(" · ") : String(plan.prerequisites)}</p>
      <h4 className="mt-3 font-medium">Phase timeline</h4><ol className="list-decimal pl-5 text-sm">{plan.phases.map(phase => <li key={phase.phaseId}>{phase.phaseName}: {phase.phaseObjective}</li>)}</ol>
      <h4 className="mt-3 font-medium">Discipline duration</h4><dl className="grid grid-cols-2 gap-x-3 text-sm">{disciplineFields.map(([label]) => <div key={label} className="contents"><dt>{label}</dt><dd>{totals[label]} minutes</dd></div>)}</dl>
      <p className="mt-3 text-sm">Recovery weeks: {plan.weeks.filter(week => week.recoveryWeek).map(week => week.weekNumber).join(", ") || "None marked"}. Required sessions: {plan.weeks.flatMap(w => w.days).flatMap(d => d.assignments).filter(a => a.required && a.assignmentType !== "RACE").length}. Optional sessions: {plan.weeks.flatMap(w => w.days).flatMap(d => d.assignments).filter(a => !a.required).length}.</p>
      <details className="mt-3"><summary>Weeks, multiple-session ordering and race placeholders</summary>{plan.weeks.map(week => <section key={week.weekNumber} aria-label={`Week ${week.weekNumber}`} className="mt-2"><h5 className="font-medium">Week {week.weekNumber} · {week.phaseName}{week.recoveryWeek ? " · Recovery" : ""}</h5><ul className="pl-5 text-sm">{week.days.filter(day => day.assignments.length).map(day => <li key={day.dayOfWeek}>{day.dayOfWeek}: {day.assignments.map(a => `${a.orderWithinDay}. ${a.sessionId}${a.assignmentType === "RACE" ? " (variable duration)" : ""}`).join("; ")}</li>)}</ul></section>)}</details>
      <details className="mt-3"><summary>Evidence and limitations</summary><p className="text-sm">Evidence supports general training principles, not these exact schedules.</p><ul className="list-disc pl-5 text-sm">{plan.evidenceReferenceIds.map(id => { const evidence = triathlonResearchDataset.evidenceCatalogue.find(item => item.evidenceId === id); return evidence ? <li key={id}>{evidence.title} — {evidence.directness}; {evidence.verificationStatus}. Limitation: {evidence.limitations}</li> : null; })}</ul></details>
      {!mutationDisabled && <button type="button" data-testid={`create-research-copy-${plan.planId}`} aria-label={`Create editable cloud copy of ${plan.name}`} disabled={pending} onClick={() => setConfirming(true)} className="mt-4 rounded bg-hv-primary px-3 py-2 text-white focus-visible:ring-2 focus-visible:ring-hv-primary disabled:opacity-50">Create editable copy</button>}
      {confirming && <div role="dialog" aria-modal="true" aria-labelledby="research-copy-title" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><div className="max-w-md rounded-lg bg-hv-surface-1 p-5"><h4 id="research-copy-title" className="font-semibold">Create an editable cloud copy of {plan.name}?</h4><p className="mt-2 text-sm text-hv-text-muted">This creates new cloud data in your account. The Research Candidate source remains unchanged.</p><div className="mt-4 flex justify-end gap-3"><button type="button" onClick={() => setConfirming(false)}>Cancel</button><button type="button" disabled={pending} onClick={async () => { if (pending) return; setPending(true); try { await onClone(plan); } finally { setPending(false); setConfirming(false); } }} className="rounded bg-hv-primary px-3 py-2 text-white disabled:opacity-50">Create cloud copy of {plan.name}</button></div></div></div>}
    </article>
  </section>;
}
