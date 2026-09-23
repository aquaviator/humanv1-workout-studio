import { PublishedEnvelope } from "../../domain/publication";
import { syncManager, SyncRecord } from "../../repositories/SyncManager";
import { useParams, Link, useNavigate, useLocation } from "react-router";
import React, { useState, useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { format, addDays, startOfWeek } from "date-fns";
import { draftRepository } from "../../repositories/DraftRepository";
import { Workout } from "../../domain/types";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Dumbbell, Plus, Trash2, Undo2, Redo2 } from "lucide-react";
import { useHistory } from "../../lib/useHistory";
import { HumanIdentity } from "../../domain/identity";
import { Plan } from "../../domain/types";
import { publicationRepository } from "../../repositories/PublicationRepository";
import { Send } from "lucide-react";
import { validatePlan } from "../../domain/validation/planValidation";
import { AlertCircle } from "lucide-react";
import { crossAppRepository } from "../../repositories/CrossAppRepository";
import { PlanReconstructionStatus, PlacementReconstructionStatus } from "../components/PlanReconstructionStatus";
import { publicationBlockReason } from "../../domain/presentation";
import { planDeliveryRepository, PlanDeliveryAttempt, PlanDeliveryPhase } from "../../repositories/PlanDeliveryRepository";
import { deliveryAcknowledgementRepository } from "../../repositories/DeliveryAcknowledgementRepository";
import { PublicationDiagnosticError, transientPublicationDiagnostic, validatePlanPublicationDependencies } from "../../domain/publicationDiagnostics";
import type { DraftEnvelope } from "../../repositories/DraftRepository";
import { dependencyHasUnpublishedChanges, migrateLegacyPlanDraft, validateDraftDependencies, workoutDraftDependency } from "../../domain/planDraftDependencies";
import { governedPublicationRepository } from "../../repositories/GovernedPublicationRepository";
import { useAcceptanceMode } from "../components/AcceptanceModeProvider";
import { assertMutationAllowed } from "../../config/mutationPolicy";

export default function PlanBuilder({ identity }: { identity: HumanIdentity }) {
  const { isReadOnlyAcceptance } = useAcceptanceMode();
  const { planId: routePlanId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [workoutsData, setWorkoutsData] = React.useState<Workout[]>([]);
  const [editableWorkoutIds, setEditableWorkoutIds] = React.useState<Set<string>>(new Set());
  const [workoutDrafts, setWorkoutDrafts] = React.useState<Map<string, DraftEnvelope<Workout>>>(new Map());
  const [workoutsLoaded, setWorkoutsLoaded] = React.useState(false);
  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      // A plan can arrive from Human Strength before this preview origin has a
      // local workout cache. Hydrate the owner-scoped draft envelopes first so
      // legacy/app placements can be pinned to their authoritative revision.
      await syncManager.syncDown(identity.humanUserId, ["workout"]).catch(() => undefined);
      const [data, envelopes] = await Promise.all([draftRepository.listWorkoutDrafts(identity.humanUserId), draftRepository.listWorkoutEnvelopes(identity.humanUserId)]);
      if (!mounted) return;
      setWorkoutsData(data);
      setEditableWorkoutIds(new Set(data.map(workout => workout.workoutId)));
      setWorkoutDrafts(new Map(envelopes.map(envelope => [envelope.globalId, envelope])));
      setWorkoutsLoaded(true);
      crossAppRepository.listAppWorkouts(identity.humanUserId).then(app => setWorkoutsData(current => [...current, ...app.filter(remote => !current.some(local => local.workoutId === remote.workoutId))])).catch(() => undefined);
    };
    load().catch(() => {
      if (!mounted) return;
      setWorkoutsData([]);
      setWorkoutsLoaded(true);
    });
    return () => { mounted = false; };
  }, [identity.humanUserId]);
  const [planId] = useState(() => routePlanId && routePlanId !== 'new' ? routePlanId : uuidv4());

  useEffect(() => {
    if (location.pathname === '/plans/new') navigate(`/plans/${planId}`, { replace: true });
  }, [location.pathname, navigate, planId]);
  
  const initialPlan: Plan = {
    schemaVersion: "humanv1.studio-plan-draft/1",
    planId,
    title: "New Plan",
    description: "",
    dependencyOwnerHumanUserId: identity.humanUserId,
    dependencyKinds: [],
    weeks: [{
      weekId: uuidv4(),
      weekNumber: 1,
      label: "Week 1",
      placements: []
    }]
  };

  const { state: plan, set: setPlan, reset, undo, redo, canUndo, canRedo } = useHistory<Plan>(initialPlan);
  const availableWorkouts = workoutsData;
  const [saveStatus, setSaveStatus] = useState<"Saved on this device" | "Saving to Studio" | "Needs attention">("Saved on this device");
  const [isLoading, setIsLoading] = useState(true);
  const validationErrors = React.useMemo(() => validatePlan(plan), [plan]);
  const dependencyIssues = React.useMemo(() => validateDraftDependencies(plan, identity.humanUserId, workoutDrafts), [plan, identity.humanUserId, workoutDrafts]);
  const publicationReason = React.useMemo(() => publicationBlockReason(plan.reconstructionDiagnostics), [plan.reconstructionDiagnostics]);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (!workoutsLoaded) return;
    let mounted = true;
    if (routePlanId) {
      draftRepository.getPlanDraft(identity.humanUserId, routePlanId).then(async (draft) => {
        if (!mounted) return;
        const appPlan = draft ? null : (await crossAppRepository.listAppPlans(identity.humanUserId).catch(() => [])).find(item => item.planId === routePlanId);
        if (draft || appPlan) reset(draft ? migrateLegacyPlanDraft(draft, identity.humanUserId, workoutDrafts).plan : appPlan!);
        setIsLoading(false);
      }).catch(() => {
        if (mounted) setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
    return () => { mounted = false; };
  }, [identity.humanUserId, reset, routePlanId, workoutsLoaded]);

  useEffect(() => {
    if (isLoading) return;
    if (isReadOnlyAcceptance) {
      setSaveStatus("Saved on this device");
      return;
    }
    if (validationErrors.length > 0 || dependencyIssues.length > 0) {
      setSaveStatus("Needs attention");
      return;
    }
    let timeout: ReturnType<typeof setTimeout>;
    setSaveStatus("Saving to Studio");
    timeout = setTimeout(() => {
      const normalized = migrateLegacyPlanDraft(plan, identity.humanUserId, workoutDrafts).plan;
      draftRepository.savePlanDraft(identity.humanUserId, normalized).then(() => setSaveStatus("Saved on this device")).catch(() => setSaveStatus("Needs attention"));
    }, 500);
    return () => clearTimeout(timeout);
  }, [plan, identity.humanUserId, isLoading, validationErrors.length, dependencyIssues.length, isReadOnlyAcceptance]);

  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  
  const [syncRecord, setSyncRecord] = useState<SyncRecord | null>(null);
  const [draftDependencies, setDraftDependencies] = useState<Workout[]>([]);
  const [newVersionDependencies, setNewVersionDependencies] = useState<Workout[]>([]);
  const [reusedDependencies, setReusedDependencies] = useState<Workout[]>([]);
  const [publishStatus, setPublishStatus] = useState<string>("");
  const [deliveryAttempt, setDeliveryAttempt] = useState<PlanDeliveryAttempt | null>(null);

  const recordDelivery = async (phase: PlanDeliveryPhase, details: Partial<PlanDeliveryAttempt> = {}) => {
    const attempt: PlanDeliveryAttempt = {
      humanUserId: identity.humanUserId,
      planId: plan.planId,
      workoutVersionIds: details.workoutVersionIds ?? deliveryAttempt?.workoutVersionIds ?? [],
      planVersionId: details.planVersionId ?? deliveryAttempt?.planVersionId,
      planChecksum: details.planChecksum ?? deliveryAttempt?.planChecksum,
      planRevision: details.planRevision ?? deliveryAttempt?.planRevision,
      phase,
      lastAttemptedAt: new Date().toISOString(),
      ...(details.failureCategory ? { failureCategory: details.failureCategory } : {}),
      ...(details.diagnostic ? { diagnostic: details.diagnostic } : {}),
      ...(details.diagnostics ? { diagnostics: details.diagnostics } : {}),
    };
    setDeliveryAttempt(attempt);
    await planDeliveryRepository.save(attempt);
  };

  useEffect(() => {
    void planDeliveryRepository.load(identity.humanUserId, plan.planId).then(setDeliveryAttempt);
  }, [identity.humanUserId, plan.planId]);

  useEffect(() => {
    if (deliveryAttempt?.phase !== 'WAITING_FOR_HUMANV1' || !deliveryAttempt.planVersionId || !deliveryAttempt.planChecksum || !deliveryAttempt.planRevision) return;
    let active = true;
    const check = async () => {
      const acknowledgement = await deliveryAcknowledgementRepository.findExactPlan(identity.humanUserId, {
        planGlobalId: plan.planId, planVersionId: deliveryAttempt.planVersionId!, planChecksum: deliveryAttempt.planChecksum!,
        sourceRevision: deliveryAttempt.planRevision!, workoutVersionIds: deliveryAttempt.workoutVersionIds,
      }).catch(() => null);
      if (!active || !acknowledgement) return;
      if (acknowledgement.state === 'APPLIED') await recordDelivery('AVAILABLE_IN_HUMANV1');
      else if (acknowledgement.state === 'CONFLICT') await recordDelivery('CONFLICT', { failureCategory: acknowledgement.reasonCode ?? 'Plan conflict' });
      else await recordDelivery('PARTIALLY_DELIVERED', { failureCategory: acknowledgement.reasonCode ?? 'Plan rejected' });
    };
    void check(); const timer = setInterval(() => void check(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [deliveryAttempt?.phase, deliveryAttempt?.planVersionId, deliveryAttempt?.planChecksum, deliveryAttempt?.planRevision, identity.humanUserId, plan.planId]);

  useEffect(() => {
    if (!plan.planId) return;
    const fetchStatus = async () => {
      const records = await syncManager.listSyncRecords(identity.humanUserId, 'plan');
      const record = records.find(r => r.envelope.globalId === plan.planId);
      setSyncRecord(record || null);
    };
    fetchStatus();
    const unsub = syncManager.subscribe(fetchStatus); return () => { unsub(); };
  }, [plan.planId, identity.humanUserId]);
  
  const displayPublishStatus = useMemo(() => {
    if (publishStatus) return publishStatus;
    if (deliveryAttempt) {
      switch (deliveryAttempt.phase) {
        case 'VALIDATING': return 'Validating plan';
        case 'PUBLISHING_WORKOUTS': return 'Publishing required workouts';
        case 'PUBLISHING_PLAN': return 'Publishing plan';
        case 'QUEUED_OFFLINE': return 'Queued offline—will send when connected';
        case 'SENDING': return 'Sending to HumanV1';
        case 'SENT_TO_HUMANV1': return 'Sent to HumanV1 cloud';
        case 'WAITING_FOR_HUMANV1': return 'Waiting for HumanV1';
        case 'AVAILABLE_IN_HUMANV1': return 'Available in HumanV1';
        case 'PARTIALLY_DELIVERED': return 'Partially delivered—needs attention';
        case 'CONFLICT': return 'Conflict—needs attention';
        case 'FAILED': return deliveryAttempt.diagnostic?.retryEligibility === 'NOT_RETRYABLE'
          ? `Cannot send: ${deliveryAttempt.diagnostic.explanation}`
          : `Retry required: ${deliveryAttempt.failureCategory ?? 'publication failed'}`;
      }
    }
    if (!syncRecord) return "Saved on this device";
    switch (syncRecord.status) {
      case 'QUEUED': return "Saved on this device";
      case 'SENDING': return "Saving to Studio";
      case 'SYNCED': return "Saved in Studio";
      case 'CONFLICT': case 'FAILED': case 'NEEDS_USER_REVIEW': return syncRecord.attention
        ? `Needs attention: ${syncRecord.attention.explanation} Your changes remain saved on this device.`
        : "Needs attention: review the plan and save again. Your changes remain saved on this device.";
      default: return "Needs attention";
    }
  }, [deliveryAttempt, syncRecord, publishStatus]);


  if (isLoading || !workoutsLoaded) {
    return <div className="p-8 text-center text-hv-text-muted">Loading...</div>;
  }



  const handlePublish = async () => {
    assertMutationAllowed("publishPlan");
    try {
      setPublishStatus("");
      await recordDelivery('VALIDATING');
      const frozenPlan = structuredClone(plan);
      const freshDrafts = new Map((await draftRepository.listWorkoutEnvelopes(identity.humanUserId)).map(envelope => [envelope.globalId, envelope]));
      const dependencyIssues = validateDraftDependencies(frozenPlan, identity.humanUserId, freshDrafts);
      if (dependencyIssues.length) throw new PublicationDiagnosticError(dependencyIssues.map(issue => ({
        errorCode: 'INVALID_CONTENT', entityType: 'workout' as const, entityId: issue.workoutId, displayName: issue.displayName,
        fieldPath: `placements[${issue.placementId}].dependency`, validationRule: `DRAFT_DEPENDENCY_${issue.state}`,
        explanation: issue.message, userCorrectableInStudio: true, sourceMigrationRequired: false, retryEligibility: 'NOT_RETRYABLE' as const,
      })));
      const diagnostics = validatePlanPublicationDependencies(frozenPlan, availableWorkouts, editableWorkoutIds);
      if (diagnostics.length) throw new PublicationDiagnosticError(diagnostics);
      
      const newPlan: Plan = structuredClone(frozenPlan);
      if (!newPlan.startDate) newPlan.startDate = format(weekStart, 'yyyy-MM-dd');
      if (!newPlan.timezone) newPlan.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      if (!navigator.onLine) { await recordDelivery('QUEUED_OFFLINE'); return; }
      await draftRepository.savePlanDraft(identity.humanUserId, newPlan);
      await syncManager.syncPending();
      const persisted = await draftRepository.getPlanEnvelope(identity.humanUserId, newPlan.planId);
      if (!persisted) throw new Error('PLAN_DRAFT_NOT_FOUND');
      await recordDelivery('PUBLISHING_WORKOUTS');
      const publication = await governedPublicationRepository.publishPlan(newPlan.planId, persisted.revision);
      const details = { workoutVersionIds: publication.workoutVersionIds, planVersionId: publication.planVersionId, planChecksum: publication.planChecksum, planRevision: publication.planRevision };
      await recordDelivery('PUBLISHING_PLAN', details);
      await recordDelivery('SENDING', details);
      await recordDelivery('SENT_TO_HUMANV1', details);
      const acknowledgement = await deliveryAcknowledgementRepository.findExactPlan(identity.humanUserId, {
        planGlobalId: newPlan.planId, planVersionId: publication.planVersionId,
        planChecksum: publication.planChecksum, sourceRevision: publication.planRevision,
        workoutVersionIds: publication.workoutVersionIds,
      });
      if (acknowledgement?.state === 'APPLIED') await recordDelivery('AVAILABLE_IN_HUMANV1', details);
      else if (acknowledgement?.state === 'CONFLICT') await recordDelivery('CONFLICT', { ...details, failureCategory: acknowledgement.reasonCode ?? 'Plan conflict' });
      else if (acknowledgement?.state === 'REJECTED') await recordDelivery('PARTIALLY_DELIVERED', { ...details, failureCategory: acknowledgement.reasonCode ?? 'Plan rejected' });
      else await recordDelivery('WAITING_FOR_HUMANV1', details);
    } catch (error: unknown) {
      const diagnostic = error instanceof PublicationDiagnosticError ? error.diagnostic : error instanceof Error && error.message === 'CHANGED_WHILE_PREPARING'
        ? { errorCode: 'CHANGED_WHILE_PREPARING', entityType: 'plan' as const, entityId: plan.planId, displayName: plan.title, fieldPath: 'draftRevision', validationRule: 'FROZEN_DRAFT_UNCHANGED', explanation: 'The plan or a workout changed while preparing. Review the latest draft and send again.', userCorrectableInStudio: true, sourceMigrationRequired: false, retryEligibility: 'NOT_RETRYABLE' as const }
        : transientPublicationDiagnostic(plan, error);
      await recordDelivery('FAILED', { failureCategory: diagnostic.errorCode, diagnostic, diagnostics: error instanceof PublicationDiagnosticError ? error.diagnostics : [diagnostic] });
    }
  };

  const handleOpenPublish = async () => {
      assertMutationAllowed("openPlanPublication");
      const deps: Workout[] = [];
      const changed: Workout[] = [];
      const reused: Workout[] = [];
      for (const week of plan.weeks) {
         for (const placement of week.placements) {
             const workout = availableWorkouts.find(w => w.workoutId === placement.workoutId);
             if (workout) {
                  const pubs = await governedPublicationRepository.listWorkoutVersions(identity.humanUserId, workout.workoutId);
                 const checksum = await publicationRepository.generateChecksum(workout);
                 const exact = pubs.some(candidate => candidate.contentChecksum === checksum && candidate.publicationState === 'PUBLISHED');
                 const target = exact ? reused : pubs.length ? changed : deps;
                 if (!target.find(dependency => dependency.workoutId === workout.workoutId)) target.push(workout);
             }
         }
      }
      setDraftDependencies(deps);
      setNewVersionDependencies(changed);
      setReusedDependencies(reused);
      setIsPublishModalOpen(true);
  };

  const addWeek = () => {
    assertMutationAllowed("addPlanWeek");
    const newWeekIndex = plan.weeks.length;
    const newWeek = {
      weekId: uuidv4(),
      weekNumber: newWeekIndex + 1,
      label: `Week ${newWeekIndex + 1}`,
      placements: []
    };
    setPlan({ ...plan, weeks: [...plan.weeks, newWeek] });
    setActiveWeekIndex(newWeekIndex);
  };

  const dependencyFor = (workoutId: string) => {
    const envelope = workoutDrafts.get(workoutId);
    return envelope ? workoutDraftDependency(envelope) : undefined;
  };

  const withDependencyMetadata = (next: Plan): Plan => migrateLegacyPlanDraft(next, identity.humanUserId, workoutDrafts).plan;

  const removeCurrentWeek = () => {
    assertMutationAllowed("removePlanWeek");
    if (plan.weeks.length <= 1) return;
    const updatedWeeks = plan.weeks.filter((_, idx) => idx !== activeWeekIndex);
    // Re-number weeks
    const renumbered = updatedWeeks.map((w, idx) => ({ ...w, weekNumber: idx + 1, label: `Week ${idx + 1}` }));
    setPlan(withDependencyMetadata({ ...plan, weeks: renumbered }));
    setActiveWeekIndex(Math.max(0, activeWeekIndex - 1));
  };

  const onDragEnd = (result: DropResult) => {
    assertMutationAllowed("reorderPlan");
    const { source, destination } = result;
    if (!destination) return;

    if (source.droppableId === "library" && destination.droppableId.startsWith("day-")) {
      const workoutId = result.draggableId;
      const dayOfWeek = parseInt(destination.droppableId.replace("day-", ""));
      
      const newPlacement = {
        placementId: uuidv4(),
        dayOfWeek,
        workoutId,
        ...(dependencyFor(workoutId) ? { dependency: dependencyFor(workoutId) } : { workoutVersionId: `${workoutId}_v1` }),
        preferredMinuteOfDay: null,
        reminderEnabled: false,
        notes: ""
      };
      
      const updatedWeeks = [...plan.weeks];
      updatedWeeks[activeWeekIndex] = {
        ...updatedWeeks[activeWeekIndex],
        placements: [...updatedWeeks[activeWeekIndex].placements, newPlacement]
      };
      
      setPlan(withDependencyMetadata({ ...plan, weeks: updatedWeeks }));
    } else if (source.droppableId.startsWith("day-") && destination.droppableId.startsWith("day-")) {
      const sourceDay = parseInt(source.droppableId.replace("day-", ""));
      const destDay = parseInt(destination.droppableId.replace("day-", ""));
      
      const updatedWeeks = [...plan.weeks];
      const sourcePlacements = [...updatedWeeks[activeWeekIndex].placements];
      
      const movedItemIndex = sourcePlacements.findIndex(p => p.placementId === result.draggableId);
      if (movedItemIndex >= 0) {
        const candidate = sourcePlacements[movedItemIndex];
        if ((plan.reconstructionDiagnostics ?? []).some(item => item.severity === "blocking" && (item.referenceId ? item.referenceId === candidate.workoutId : !candidate.workoutId))) return;
        const [movedItem] = sourcePlacements.splice(movedItemIndex, 1);
        movedItem.dayOfWeek = destDay;
        sourcePlacements.push(movedItem);
        
        updatedWeeks[activeWeekIndex] = { ...updatedWeeks[activeWeekIndex], placements: sourcePlacements };
        setPlan({ ...plan, weeks: updatedWeeks });
      }
    }
  };

  const removePlacement = (placementId: string) => {
    assertMutationAllowed("removePlanPlacement");
    const updatedWeeks = [...plan.weeks];
    updatedWeeks[activeWeekIndex] = {
      ...updatedWeeks[activeWeekIndex],
      placements: updatedWeeks[activeWeekIndex].placements.filter(p => p.placementId !== placementId)
    };
    setPlan(withDependencyMetadata({ ...plan, weeks: updatedWeeks }));
  };
  
  const addWorkoutToDay = (workoutId: string, dayOfWeek: number) => {
    assertMutationAllowed("addPlanPlacement");
    const newPlacement = {
      placementId: uuidv4(),
      dayOfWeek,
      workoutId,
      ...(dependencyFor(workoutId) ? { dependency: dependencyFor(workoutId) } : { workoutVersionId: `${workoutId}_v1` }),
      preferredMinuteOfDay: null,
      reminderEnabled: false,
      notes: ""
    };
    const updatedWeeks = [...plan.weeks];
    updatedWeeks[activeWeekIndex] = {
      ...updatedWeeks[activeWeekIndex],
      placements: [...updatedWeeks[activeWeekIndex].placements, newPlacement]
    };
    setPlan(withDependencyMetadata({ ...plan, weeks: updatedWeeks }));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 md:p-8 pb-4 flex flex-col md:flex-row justify-between md:items-center border-b border-hv-border gap-4">
        <div>
          {isReadOnlyAcceptance ? <h1 className="text-2xl font-bold py-1">{plan.title}</h1> : <input
            type="text"
            className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-hv-border focus:border-hv-primary focus:outline-none py-1 w-full"
            value={plan.title}
            onChange={(e) => setPlan({ ...plan, title: e.target.value })}
            aria-label="Plan Title"
          />}
          {isReadOnlyAcceptance ? <p className="mt-1 text-hv-text-muted">{plan.description || "No description provided."}</p> : <input
            type="text"
            className="text-hv-text-muted mt-1 bg-transparent border-b border-transparent hover:border-hv-border focus:border-hv-primary focus:outline-none w-full"
            value={plan.description || ""}
            onChange={(e) => setPlan({ ...plan, description: e.target.value })}
            placeholder="Add description"
            aria-label="Plan Description"
          />}
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className="text-xs text-hv-text-muted hidden md:inline-block">{saveStatus}</span>
          {!isReadOnlyAcceptance && <button onClick={undo} disabled={!canUndo} className="p-2 text-hv-text-muted hover:text-hv-text disabled:opacity-50" aria-label="Undo">
            <Undo2 className="w-5 h-5" />
          </button>}
          {!isReadOnlyAcceptance && <button onClick={redo} disabled={!canRedo} className="p-2 text-hv-text-muted hover:text-hv-text disabled:opacity-50" aria-label="Redo">
            <Redo2 className="w-5 h-5" />
          </button>}
          {!isReadOnlyAcceptance && <button onClick={handleOpenPublish} disabled={validationErrors.length > 0} aria-describedby={publicationReason ? "plan-publication-reason" : undefined} title={validationErrors[0]?.message ?? dependencyIssues[0]?.message} className="bg-hv-primary text-hv-background px-4 py-2 rounded-md font-medium hover:bg-hv-primary-hover flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            <Send className="w-4 h-4" /> Send plan to my apps
          </button>}
      {!isReadOnlyAcceptance && isPublishModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-hv-surface-1 p-6 rounded-xl max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-hv-text">Send plan to my apps</h2>
            <div className="space-y-3 mb-6 text-hv-text-muted">
                            <p><span className="font-semibold text-hv-text">Weeks:</span> {plan.weeks.length}</p>
              <p><span className="font-semibold text-hv-text">Placements:</span> {plan.weeks.reduce((acc, w) => acc + w.placements.length, 0)}</p>
              {draftDependencies.length > 0 && (
                  <div className="mt-4">
                      <p className="font-semibold text-hv-text">Workouts published for the first time:</p>
                      <ul className="list-disc pl-5">
                          {draftDependencies.map(d => <li key={d.workoutId}>{d.title}</li>)}
                      </ul>
                  </div>
              )}
            </div>
            {deliveryAttempt?.phase === 'FAILED' && (deliveryAttempt.diagnostics ?? (deliveryAttempt.diagnostic ? [deliveryAttempt.diagnostic] : [])).length > 0 && (
              <div role="alert" className="mb-4 rounded-md border border-hv-error p-3 text-sm text-hv-text">
                <p className="font-semibold">Content needs attention</p>
                <ul className="mt-2 list-disc pl-5">{(deliveryAttempt.diagnostics ?? [deliveryAttempt.diagnostic!]).map(item => <li key={`${item.entityId}:${item.fieldPath}`}>{item.explanation}</li>)}</ul>
              </div>
            )}
                        {displayPublishStatus && displayPublishStatus !== "Ready" && <p className="mb-4 text-hv-primary">{displayPublishStatus}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsPublishModalOpen(false)} className="px-4 py-2 text-hv-text-muted hover:text-hv-text rounded">Cancel</button>
              {deliveryAttempt?.phase === 'FAILED' && deliveryAttempt.diagnostic?.userCorrectableInStudio && deliveryAttempt.diagnostic.entityType === 'workout' ? (
                <button onClick={() => navigate(`/workouts/${deliveryAttempt.diagnostic!.entityId}`)} className="px-4 py-2 bg-hv-primary text-hv-background rounded hover:bg-hv-primary-hover font-medium">Review workout</button>
              ) : (
                <button onClick={handlePublish} disabled={deliveryAttempt?.phase === 'VALIDATING' || deliveryAttempt?.phase === 'PUBLISHING_WORKOUTS' || deliveryAttempt?.phase === 'PUBLISHING_PLAN' || deliveryAttempt?.phase === 'SENDING' || deliveryAttempt?.diagnostic?.retryEligibility === 'NOT_RETRYABLE'} className="px-4 py-2 bg-hv-primary text-hv-background rounded hover:bg-hv-primary-hover font-medium">{deliveryAttempt?.phase === 'FAILED' ? 'Retry' : 'Send'}</button>
              )}
              {newVersionDependencies.length > 0 && <div><p className="font-semibold text-hv-text">Workouts that will create a new fixed version:</p><ul className="list-disc pl-5">{newVersionDependencies.map(item => <li key={item.workoutId}>{item.title}</li>)}</ul></div>}
              {reusedDependencies.length > 0 && <div><p className="font-semibold text-hv-text">Existing fixed versions reused:</p><ul className="list-disc pl-5">{reusedDependencies.map(item => <li key={item.workoutId}>{item.title}</li>)}</ul></div>}
              <p>Your editable drafts remain available. Sending creates fixed versions for reliable device delivery.</p>
            </div>
            {deliveryAttempt && (
              <details className="mt-4 text-xs text-hv-text-muted">
                <summary className="cursor-pointer">Delivery details</summary>
                <dl className="mt-2 break-all">
                  <dt>Entity</dt><dd>Plan</dd>
                  <dt>Plan ID</dt><dd>{deliveryAttempt.planId}</dd>
                  {deliveryAttempt.planVersionId && <><dt>Immutable version</dt><dd>{deliveryAttempt.planVersionId}</dd></>}
                  <dt>Current phase</dt><dd>{deliveryAttempt.phase}</dd>
                  {deliveryAttempt.diagnostic && <><dt>Error code</dt><dd>{deliveryAttempt.diagnostic.errorCode}</dd><dt>Entity</dt><dd>{deliveryAttempt.diagnostic.entityType}: {deliveryAttempt.diagnostic.displayName}</dd><dt>Field</dt><dd>{deliveryAttempt.diagnostic.fieldPath}</dd><dt>Rule</dt><dd>{deliveryAttempt.diagnostic.validationRule}</dd><dt>Next step</dt><dd>{deliveryAttempt.diagnostic.explanation}</dd></>}
                  <dt>Destination</dt><dd>Human Strength</dd>
                  <dt>Last attempted</dt><dd>{deliveryAttempt.lastAttemptedAt}</dd>
                </dl>
              </details>
            )}
          </div>
        </div>
      )}
        </div>
      </div>
      {dependencyIssues.length > 0 && <section role="alert" className="mx-4 md:mx-8 mt-4 rounded-lg border border-hv-error p-4"><h2 className="font-semibold">Needs attention</h2><ul className="mt-2 list-disc pl-5">{dependencyIssues.map(issue => <li key={issue.placementId}>{issue.message}</li>)}</ul></section>}
      <PlanReconstructionStatus plan={plan} />
      {deliveryAttempt && (
        <section className="mx-4 md:mx-8 mt-4 rounded-lg border border-hv-border bg-hv-surface-1 p-4" aria-live="polite" aria-label="Plan delivery status">
          <h2 className="font-semibold text-hv-text">{displayPublishStatus}</h2>
          <p className="mt-1 text-sm text-hv-text-muted">Destination: Human Strength</p>
          {!isReadOnlyAcceptance && deliveryAttempt.phase === 'FAILED' && deliveryAttempt.diagnostic?.retryEligibility === 'RETRYABLE' && <button onClick={handlePublish} className="mt-3 px-3 py-2 rounded bg-hv-primary text-hv-background font-medium">Retry</button>}
          {!isReadOnlyAcceptance && deliveryAttempt.phase === 'FAILED' && deliveryAttempt.diagnostic?.userCorrectableInStudio && deliveryAttempt.diagnostic.entityType === 'workout' && <button onClick={() => navigate(`/workouts/${deliveryAttempt.diagnostic!.entityId}`)} className="mt-3 px-3 py-2 rounded bg-hv-primary text-hv-background font-medium">Review workout</button>}
          <details className="mt-3 text-xs text-hv-text-muted">
            <summary className="cursor-pointer">Delivery details</summary>
            <dl className="mt-2 break-all"><dt>Plan ID</dt><dd>{deliveryAttempt.planId}</dd>{deliveryAttempt.planVersionId && <><dt>Immutable version</dt><dd>{deliveryAttempt.planVersionId}</dd></>}<dt>Phase</dt><dd>{deliveryAttempt.phase}</dd>{deliveryAttempt.diagnostic && <><dt>Error code</dt><dd>{deliveryAttempt.diagnostic.errorCode}</dd><dt>Entity</dt><dd>{deliveryAttempt.diagnostic.entityType}: {deliveryAttempt.diagnostic.displayName}</dd><dt>Field</dt><dd>{deliveryAttempt.diagnostic.fieldPath}</dd><dt>Rule</dt><dd>{deliveryAttempt.diagnostic.validationRule}</dd><dt>Next step</dt><dd>{deliveryAttempt.diagnostic.explanation}</dd></>}<dt>Last attempted</dt><dd>{deliveryAttempt.lastAttemptedAt}</dd></dl>
          </details>
        </section>
      )}
      
      <div className="px-4 md:px-8 border-b border-hv-border flex items-center justify-between py-2">
        <div className="flex gap-2">
          {plan.weeks.map((week, idx) => (
            <button
              key={week.weekId}
              onClick={() => setActiveWeekIndex(idx)}
              className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                activeWeekIndex === idx 
                  ? 'bg-hv-primary text-white' 
                  : 'bg-hv-surface-2 text-hv-text hover:bg-hv-border'
              }`}
            >
              {week.label}
            </button>
          ))}
          {!isReadOnlyAcceptance && <button
            onClick={addWeek}
            className="px-3 py-1 text-sm font-medium rounded-full border border-hv-border hover:bg-hv-surface-2 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add Week
          </button>}
        </div>
        {!isReadOnlyAcceptance && plan.weeks.length > 1 && (
          <button 
            onClick={removeCurrentWeek}
            className="text-xs text-hv-error hover:underline flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Remove current week
          </button>
        )}
      </div>
      

      
      {isReadOnlyAcceptance ? (
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden" data-testid="read-only-plan-schedule">
          <div className="flex-1 p-4 md:p-8 overflow-y-auto">
            <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {days.map(day => {
                const dayOfWeekNumber = day.getDay() === 0 ? 7 : day.getDay();
                const placements = plan.weeks[activeWeekIndex].placements.filter(item => item.dayOfWeek === dayOfWeekNumber);
                return (
                  <section key={day.toISOString()} className="min-w-0 rounded-lg border border-hv-border bg-hv-surface-1" aria-label={`${format(day, "EEEE")} schedule`}>
                    <header className="border-b border-hv-border bg-hv-surface-2 p-3 text-center">
                      <div className="text-xs font-semibold uppercase text-hv-text-muted">{format(day, "EEE")}</div>
                      <div className="text-lg font-bold">{format(day, "d")}</div>
                    </header>
                    <div className="min-h-24 space-y-2 p-2">
                      {placements.map(placement => {
                        const workout = availableWorkouts.find(item => item.workoutId === placement.workoutId);
                        return <article key={placement.placementId} className="rounded-md border border-hv-border bg-hv-bg p-3 text-sm">
                          <div className="font-semibold">{workout?.title || "Workout unavailable"}</div>
                          <div className="text-xs text-hv-text-muted">{workout?.discipline || "Reconstructed placement"}</div>
                          {placement.dependency?.kind === "WORKOUT_DRAFT" && <div className="mt-1 text-xs text-hv-primary">{dependencyHasUnpublishedChanges(placement.dependency, workoutDrafts) ? "Workout has unpublished changes" : "Draft"}</div>}
                        </article>;
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          <aside className="w-full border-t border-hv-border bg-hv-surface-1 p-4 md:w-80 md:border-l md:border-t-0" aria-label="Workout library">
            <h2 className="mb-4 font-bold">Library</h2>
            <p className="mb-3 text-xs text-hv-text-muted">Available workouts are shown for reference.</p>
            <div className="space-y-2">{availableWorkouts.map(workout => <article key={workout.workoutId} className="rounded-md border border-hv-border bg-hv-bg p-3">
              <div className="text-sm font-semibold">{workout.title}</div><div className="text-xs text-hv-text-muted">{workout.discipline}</div>
            </article>)}</div>
          </aside>
        </div>
      ) : <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Calendar Grid */}
          <div className="flex-1 p-4 md:p-8 overflow-y-auto">
            <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
              {days.map((day, idx) => {
                const dayOfWeekNumber = day.getDay() === 0 ? 7 : day.getDay();
                const placements = plan.weeks[activeWeekIndex].placements.filter(p => p.dayOfWeek === dayOfWeekNumber);
                
                return (
                  <div key={day.toISOString()} className="flex-1 min-w-[200px] flex flex-col bg-hv-surface-1 border border-hv-border rounded-lg overflow-hidden shrink-0 md:shrink">
                    <div className="p-3 border-b border-hv-border bg-hv-surface-2 text-center">
                      <div className="text-xs text-hv-text-muted uppercase font-semibold">{format(day, 'EEE')}</div>
                      <div className="text-lg font-bold">{format(day, 'd')}</div>
                    </div>
                    
                    <Droppable droppableId={`day-${dayOfWeekNumber}`} isDropDisabled={isReadOnlyAcceptance}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="flex-1 p-2 min-h-[200px] flex flex-col gap-2"
                        >
                          {placements.map((p, pIdx) => {
                            const workout = availableWorkouts.find(w => w.workoutId === p.workoutId);
                            const unresolved = (plan.reconstructionDiagnostics ?? []).some(item => item.severity === "blocking" && (item.referenceId ? item.referenceId === p.workoutId : !p.workoutId));
                            
                            return (
                              <Draggable key={p.placementId} draggableId={p.placementId} index={pIdx} isDragDisabled={isReadOnlyAcceptance || unresolved}>
                                {(provided) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...(!isReadOnlyAcceptance ? provided.draggableProps : {})}
                                    {...(!isReadOnlyAcceptance ? provided.dragHandleProps : {})}
                                    className="bg-hv-bg border border-hv-border p-3 rounded-md text-sm group relative"
                                  >
                                    <div className="font-semibold mb-1 line-clamp-1 pr-6">{workout?.title || "Workout unavailable"}</div>
                                    <div className="text-xs text-hv-text-muted">{workout?.discipline || "Reconstructed placement"}</div>
                                    {p.dependency?.kind === 'WORKOUT_DRAFT' && <div className="mt-1 text-xs text-hv-primary">{dependencyHasUnpublishedChanges(p.dependency, workoutDrafts) ? 'Workout has unpublished changes' : 'Draft'}</div>}
                                    <PlacementReconstructionStatus placement={p} weekLabel={plan.weeks[activeWeekIndex].label} dayLabel={format(day, 'EEEE')} workout={workout} diagnostics={plan.reconstructionDiagnostics ?? []} />
                                    {!isReadOnlyAcceptance && <button
                                      onClick={() => removePlacement(p.placementId)}
                                      disabled={unresolved}
                                      title={unresolved ? "Resolve the workout reference before removing this placement" : undefined}
                                      className="absolute top-2 right-2 text-hv-text-muted hover:text-hv-error opacity-0 group-hover:opacity-100 focus:opacity-100"
                                      aria-label="Remove workout"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Workout Library Sidebar */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-hv-border bg-hv-surface-1 p-4 flex flex-col h-64 md:h-auto">
            <h2 className="font-bold mb-4">Library</h2>
            <div className="flex-1 overflow-y-auto space-y-2">
              <Droppable droppableId="library" isDropDisabled={true}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {availableWorkouts.length === 0 && (
                      <div className="text-center p-4">
                        <p className="text-sm text-hv-text-muted mb-2">No workouts available.</p>
                        <Link to="/workouts/new" className="text-hv-primary hover:underline text-sm font-medium">Create Workout</Link>
                      </div>
                    )}
                    {availableWorkouts.map((workout, index) => (
                      <Draggable key={workout.workoutId} draggableId={workout.workoutId} index={index} isDragDisabled={isReadOnlyAcceptance}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...(!isReadOnlyAcceptance ? provided.draggableProps : {})}
                            className="bg-hv-bg border border-hv-border p-3 rounded-md mb-2 flex items-center justify-between gap-3 group"
                          >
                            <div 
                              {...(!isReadOnlyAcceptance ? provided.dragHandleProps : {})}
                              className={`flex-1 flex items-center gap-3 ${isReadOnlyAcceptance ? "" : "cursor-grab"}`}
                            >
                              <Dumbbell className="w-4 h-4 text-hv-text-muted hidden md:block" />
                              <div>
                                <div className="font-semibold text-sm line-clamp-1">{workout.title}</div>
                                <div className="text-xs text-hv-text-muted">{workout.discipline}</div>
                              </div>
                            </div>
                            
                            {!isReadOnlyAcceptance && <div className="flex gap-1 items-center">
                              <select 
                                onChange={(e) => {
                                  if (e.target.value) {
                                    addWorkoutToDay(workout.workoutId, parseInt(e.target.value));
                                    e.target.value = "";
                                  }
                                }}
                                className="text-xs bg-hv-surface-2 p-1 rounded border border-hv-border"
                                aria-label="Add workout to day"
                              >
                                <option value="">Add to...</option>
                                <option value="1">Monday</option>
                                <option value="2">Tuesday</option>
                                <option value="3">Wednesday</option>
                                <option value="4">Thursday</option>
                                <option value="5">Friday</option>
                                <option value="6">Saturday</option>
                                <option value="7">Sunday</option>
                              </select>
                            </div>}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>
        </div>
      </DragDropContext>}
    </div>
  );
}
