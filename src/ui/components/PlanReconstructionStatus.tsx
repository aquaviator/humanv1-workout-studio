import { Plan, PlanPlacement, Workout } from "../../domain/types";
import { dedupeDiagnostics, publicationBlockReason, ReconstructionDiagnostic } from "../../domain/presentation";

const categoryText = (diagnostic: ReconstructionDiagnostic) => {
  switch (diagnostic.category) {
    case "ARCHIVED_PARENT": return "Its existing placements remain safe to inspect; no plan data was deleted.";
    case "MISSING_PARENT": return "This workout reference is absent. Its existing placements remain safe to inspect.";
    case "MALFORMED_REFERENCE": return "The scheduled workout reference is malformed. The placement remains safe to inspect.";
    default: return diagnostic.reason;
  }
};

const dayName = (value: number) => ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][value] || "Unknown day";

export function PlanReconstructionStatus({ plan, todayEpochDay = Math.floor(Date.now() / 86400000) }: { plan: Plan; todayEpochDay?: number }) {
  const diagnostics = dedupeDiagnostics(plan.reconstructionDiagnostics ?? []);
  const blocking = diagnostics.filter(item => item.severity === "blocking");
  const reason = publicationBlockReason(diagnostics);
  if (!blocking.length) return null;
  return <section role="alert" aria-labelledby="plan-attention-title" className="mx-4 md:mx-8 mt-4 rounded-lg border border-hv-error p-4 bg-hv-surface-1">
    <h2 id="plan-attention-title" className="font-bold">This plan needs attention</h2>
    <p className="text-sm mt-1">{blocking.length === 1 ? "One scheduled workout needs attention." : `${blocking.length} scheduled workouts need attention.`} Existing plan data has not been deleted.</p>
    {reason && <p id="plan-publication-reason" className="text-sm font-semibold mt-1">{reason}.</p>}
    <div className="mt-3 space-y-2">{blocking.map(item => {
      const affected = plan.weeks.flatMap(week => week.placements.filter(placement => item.referenceId ? placement.workoutId === item.referenceId : !placement.workoutId).map(placement => ({ week, placement })));
      const past = affected.filter(({ placement }) => typeof placement.scheduledEpochDay === "number" && placement.scheduledEpochDay < todayEpochDay);
      const future = affected.filter(({ placement }) => typeof placement.scheduledEpochDay !== "number" || placement.scheduledEpochDay >= todayEpochDay);
      return <div key={`${item.category}:${item.referenceId ?? ""}`} className="text-sm">
        <p><span className="font-semibold">{item.displayName || "Workout unavailable"}:</span> {categoryText(item)}</p>
        <p className="mt-1">{affected.length} preserved {affected.length === 1 ? "placement" : "placements"}: {past.length} historical, {future.length} future or unscheduled.</p>
        <p className="mt-1 text-hv-text-muted">Resolution preview only: an explicit replacement would update these stable placements to a selected immutable workout version; explicit removal would remove only these placements. Nothing has been changed.</p>
        <details className="mt-1"><summary className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-hv-primary">Technical details</summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2">
            <dt>Entity</dt><dd>{item.entityType}</dd><dt>Reference</dt><dd>{item.referenceId || "Unavailable"}</dd>
            <dt>Code</dt><dd>{item.category}</dd><dt>Impact</dt><dd>Publication blocked</dd>
          </dl>
          <ul className="mt-1 list-disc pl-5">{affected.map(({ week, placement }) => <li key={placement.placementId}>{week.label}, {dayName(placement.dayOfWeek)} · placement {placement.placementId} · {typeof placement.scheduledEpochDay === "number" && placement.scheduledEpochDay < todayEpochDay ? "historical" : "future or unscheduled"}</li>)}</ul>
        </details>
      </div>;
    })}</div>
  </section>;
}

export function PlacementReconstructionStatus({ placement, weekLabel, dayLabel, workout, diagnostics }: { placement: PlanPlacement; weekLabel: string; dayLabel: string; workout?: Workout; diagnostics: ReconstructionDiagnostic[] }) {
  const relevant = dedupeDiagnostics(diagnostics).filter(item => item.severity === "blocking" && (item.referenceId ? item.referenceId === placement.workoutId : !placement.workoutId));
  if (!relevant.length) return null;
  return <div className="mt-2 border-t border-hv-border pt-2 text-xs" aria-label={`Reconstruction status for ${weekLabel}, ${dayLabel}, placement ${placement.placementId}`}>
    <p className="font-semibold">{workout?.title || relevant[0].displayName || "Workout unavailable"}</p>
    <p>{relevant[0].category === "ARCHIVED_PARENT" ? "Archived workout" : "Unavailable workout"} · safe to inspect · publication blocked</p>
  </div>;
}
