import React, { useEffect, useRef, useState } from "react";
import type { HumanIdentity } from "../../domain/identity";
import { representativeStarterPack } from "../../fixtures/representativeStarterPack";
import { starterPackImportRepository, type StarterPackImportPhase } from "../../repositories/StarterPackImportRepository";
import { useAcceptanceMode } from "./AcceptanceModeProvider";

const labels: Record<StarterPackImportPhase, string> = {
  CHECKING_LIBRARY: "Checking your library…",
  ADDING_WORKOUTS: "Adding starter workouts…",
  CREATING_PLAN: "Creating your editable plan…",
  ADDED: "Starter pack added",
  ALREADY_ADDED: "Starter pack already added",
  NEEDS_ATTENTION: "Needs attention — your existing drafts were preserved.",
};

export function StarterPackCard({ identity }: { identity: HumanIdentity }) {
  const { isReadOnlyAcceptance } = useAcceptanceMode();
  const preview = starterPackImportRepository.preview(representativeStarterPack.packId);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [phase, setPhase] = useState<StarterPackImportPhase | null>(null);
  const [affectedWorkoutName, setAffectedWorkoutName] = useState<string | undefined>();
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  useEffect(() => { if (!open) return; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); openerRef.current?.focus(); } }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [open]);
  const close = () => { setOpen(false); requestAnimationFrame(() => openerRef.current?.focus()); };
  useEffect(() => { starterPackImportRepository.operationState(identity.humanUserId, preview.packId).then(state => { if (state) { setPhase(state.phase); setAffectedWorkoutName(state.affectedWorkoutName); setErrorCode(state.errorCode); } }); }, [identity.humanUserId, preview.packId]);
  const add = async () => {
    if (confirmation !== "ADD STARTER PACK" || busy) return;
    setBusy(true);
    try { const result = await starterPackImportRepository.import(identity.humanUserId, preview.packId, confirmation, state => { setPhase(state.phase); setAffectedWorkoutName(state.affectedWorkoutName); setErrorCode(state.errorCode); }); setPhase(result.state.phase); }
    catch { setPhase("NEEDS_ATTENTION"); }
    finally { setBusy(false); }
  };
  return <section className="mb-8 rounded-lg border border-hv-border bg-hv-surface-1 p-6" aria-labelledby="starter-pack-title">
    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-hv-primary">Optional starter content</p>
    <h2 id="starter-pack-title" className="text-xl font-bold">{preview.name}</h2>
    <p className="mt-2 max-w-3xl text-sm text-hv-text-muted">{preview.description} Preview it before adding anything. All workouts and the plan remain editable, and nothing is sent to your apps automatically.</p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button ref={openerRef} className="rounded border border-hv-border px-4 py-2 text-sm font-medium hover:bg-hv-surface-2" onClick={() => setOpen(true)}>Preview Starter Pack</button>
      {!isReadOnlyAcceptance && <button data-mutation-control="true" className="rounded bg-hv-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => setOpen(true)}>Add Starter Pack</button>}
      {phase && <span role="status" aria-live="polite" className="text-sm text-hv-text-muted">{labels[phase]}</span>}
    </div>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="starter-pack-dialog-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-hv-border bg-hv-surface-1 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="starter-pack-dialog-title" className="text-xl font-bold">{preview.name}</h2><p className="mt-1 text-sm text-hv-text-muted">{preview.intendedAudience}</p></div><button ref={closeRef} aria-label="Close starter pack preview" onClick={close} className="rounded px-3 py-1 hover:bg-hv-surface-2">Close</button></div>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-hv-text-muted">Workouts</dt><dd className="font-semibold">{preview.workoutCount}</dd></div><div><dt className="text-hv-text-muted">Plan</dt><dd className="font-semibold">{preview.weekCount} weeks · {preview.placementCount} sessions</dd></div></dl>
        <h3 className="mt-5 font-semibold">Editable workouts</h3><ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{preview.workoutNames.map(name => <li key={name}>• {name}</li>)}</ul>
        <p className="mt-4 text-sm"><span className="text-hv-text-muted">Disciplines:</span> {preview.disciplines.join(", ")}</p>
        <p className="mt-5 rounded border border-hv-border p-3 text-sm">This creates draft workouts and one editable plan in your library. It creates no workout history, completed sessions, subscriptions or device deliveries.</p>
        {!isReadOnlyAcceptance && <div className="mt-5"><label className="block text-sm font-medium" htmlFor="starter-confirmation">Type <strong>ADD STARTER PACK</strong> to confirm</label><input id="starter-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded border border-hv-border bg-hv-surface-2 px-3 py-2" autoComplete="off"/><button data-mutation-control="true" disabled={confirmation !== "ADD STARTER PACK" || busy} onClick={add} className="mt-3 rounded bg-hv-primary px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "Add Starter Pack"}</button></div>}
        {isReadOnlyAcceptance && <p role="status" className="mt-5 text-sm text-hv-text-muted">Read-only acceptance mode: this preview cannot create or change drafts.</p>}
        <details className="mt-5 text-xs text-hv-text-muted"><summary>Reviewer details</summary><p className="mt-2">Registered pack {preview.packId}; version {representativeStarterPack.datasetVersion}; governed catalogue release {representativeStarterPack.compatibleCatalogueReleaseIds.join(", ")}.</p>{phase === "NEEDS_ATTENTION" && <p className="mt-2">{affectedWorkoutName ? `Conflict: ${affectedWorkoutName}. ` : "Import stopped safely. "}Successfully created drafts are preserved for a guarded retry; no automatic cleanup or overwrite is performed.{errorCode ? ` Diagnostic: ${errorCode}.` : ""}</p>}</details>
      </div>
    </div>}
  </section>;
}
