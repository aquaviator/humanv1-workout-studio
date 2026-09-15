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

export default function PlanBuilder({ identity }: { identity: HumanIdentity }) {
  const { planId: routePlanId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [workoutsData, setWorkoutsData] = React.useState<Workout[]>([]);
  const [editableWorkoutIds, setEditableWorkoutIds] = React.useState<Set<string>>(new Set());
  const [workoutDrafts, setWorkoutDrafts] = React.useState<Map<string, DraftEnvelope<Workout>>>(new Map());
  const [workoutsLoaded, setWorkoutsLoaded] = React.useState(false);
  React.useEffect(() => { 
    Promise.all([draftRepository.listWorkoutDrafts(identity.humanUserId), draftRepository.listWorkoutEnvelopes(identity.humanUserId)]).then(([data, envelopes]) => {
      setWorkoutsData(data);
      setEditableWorkoutIds(new Set(data.map(workout => workout.workoutId)));
      setWorkoutDrafts(new Map(envelopes.map(envelope => [envelope.globalId, envelope])));
      setWorkoutsLoaded(true);
      crossAppRepository.listAppWorkouts(identity.humanUserId).then(app => setWorkoutsData(current => [...current, ...app.filter(remote => !current.some(local => local.workoutId === remote.workoutId))])).catch(() => undefined);
    }).catch(() => {
      setWorkoutsData([]);
      setWorkoutsLoaded(true);
    }); 
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
  const [saveStatus, setSaveStatus] = useState<"Saved" | "Saving..." | "Unsaved">("Saved");
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
    if (validationErrors.length > 0) {
      setSaveStatus("Unsaved");
      return;
    }
    let timeout: ReturnType<typeof setTimeout>;
    setSaveStatus("Saving...");
    timeout = setTimeout(() => {
      const normalized = migrateLegacyPlanDraft(plan, identity.humanUserId, workoutDrafts).plan;
      draftRepository.savePlanDraft(identity.humanUserId, normalized).then(() => setSaveStatus("Saved")).catch(() => setSaveStatus("Unsaved"));
    }, 500);
    return () => clearTimeout(timeout);
  }, [plan, identity.humanUserId, isLoading, validationErrors.length]);

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
      const records = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'plan');
      const record = records.find(r => (r.envelope as PublishedEnvelope<Plan>).sourceDraftId === plan.planId);
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
    if (!syncRecord) return "Ready";
    switch (syncRecord.status) {
      case 'QUEUED': return "Queued—will send when connected";
      case 'SENDING': return "Sending";
      case 'SYNCED': return "Sent to HumanV1 cloud";
      case 'CONFLICT': return "Conflict";
      case 'FAILED': return "Retry required";
      default: return "";
    }
  }, [deliveryAttempt, syncRecord, publishStatus]);


  if (isLoading || !workoutsLoaded) {
    return <div className="p-8 text-center text-hv-text-muted">Loading...</div>;
  }



  const handlePublish = async () => {
    try {
      setPublishStatus("");
      await recordDelivery('VALIDATING');
      const frozenPlan = structuredClone(plan);
      const frozenPlanEnvelope = await draftRepository.getPlanEnvelope(identity.humanUserId, plan.planId);
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
      const workoutVersions = new Map<string, string>();
      const resolvedWorkouts = new Map<string, NonNullable<import("../../domain/types").PlanPlacement["resolvedWorkout"]>>();
      await recordDelivery('PUBLISHING_WORKOUTS');
      for (const week of newPlan.weeks) {
         for (const placement of week.placements) {
             const knownVersion = workoutVersions.get(placement.workoutId);
             if (knownVersion) { placement.workoutVersionId = knownVersion; placement.resolvedWorkout = resolvedWorkouts.get(placement.workoutId); delete placement.dependency; continue; }
             if (placement.dependency?.kind === 'PUBLISHED_WORKOUT_VERSION') {
               const fixed = await publicationRepository.getPublishedVersion<Workout>(identity.humanUserId, 'workout', placement.dependency.versionId);
               if (!fixed || fixed.globalId !== placement.dependency.workoutGlobalId || fixed.revision !== placement.dependency.revision || fixed.contentChecksum !== placement.dependency.checksum || fixed.schemaVersion !== placement.dependency.schemaVersion || fixed.publicationState !== 'PUBLISHED') throw new Error('PUBLISHED_DEPENDENCY_MISMATCH');
               placement.workoutVersionId = fixed.versionId;
               placement.resolvedWorkout = { workoutGlobalId: fixed.globalId, versionId: fixed.versionId, revision: fixed.revision, checksum: fixed.contentChecksum, schemaVersion: fixed.schemaVersion };
               delete placement.dependency; workoutVersions.set(placement.workoutId, fixed.versionId); resolvedWorkouts.set(placement.workoutId, placement.resolvedWorkout); continue;
             }
             const workout = availableWorkouts.find(w => w.workoutId === placement.workoutId);
             if (!workout) throw new Error(`Missing workout reference`);
             const pubs = await publicationRepository.listPublishedVersions(identity.humanUserId, 'workout', workout.workoutId);
             
             const checksum = await publicationRepository.generateChecksum(workout);
             let pub = pubs.find(candidate => candidate.contentChecksum === checksum && candidate.publicationState === 'PUBLISHED');
             if (!pub) {
                 pub = await publicationRepository.publishAuthenticated('workout', workout.workoutId, workout, [workout.discipline]);
             } else {
                 await syncManager.queueUpload(pub, 'workout', 'publication');
             }
             placement.workoutVersionId = pub.versionId;
             placement.resolvedWorkout = { workoutGlobalId: pub.globalId, versionId: pub.versionId, revision: pub.revision, checksum: pub.contentChecksum, schemaVersion: pub.schemaVersion };
             resolvedWorkouts.set(placement.workoutId, placement.resolvedWorkout);
             delete placement.dependency;
             workoutVersions.set(placement.workoutId, pub.versionId);
         }
      }
      const currentPlanEnvelope = await draftRepository.getPlanEnvelope(identity.humanUserId, plan.planId);
      const currentDrafts = new Map((await draftRepository.listWorkoutEnvelopes(identity.humanUserId)).map(envelope => [envelope.globalId, envelope]));
      const changedPlan = frozenPlanEnvelope && currentPlanEnvelope && frozenPlanEnvelope.revision !== currentPlanEnvelope.revision;
      const dependencyDraftIds = new Set(frozenPlan.weeks.flatMap(week => week.placements.flatMap(item => item.dependency?.kind === 'WORKOUT_DRAFT' ? [item.dependency.workoutDraftId] : [])));
      const changedWorkout = [...dependencyDraftIds].some(id => currentDrafts.get(id)?.revision !== freshDrafts.get(id)?.revision);
      if (changedPlan || changedWorkout) throw new Error('CHANGED_WHILE_PREPARING');
      await recordDelivery('PUBLISHING_PLAN', { workoutVersionIds: [...workoutVersions.values()] });
      newPlan.schemaVersion = 'humanv1.plan/1';
      delete newPlan.dependencyKinds;
      delete newPlan.dependencyOwnerHumanUserId;
      newPlan.destinationApplication = 'HUMAN_STRENGTH';
      newPlan.workoutVersionIds = [...workoutVersions.values()].sort();
      const planPublication = await publicationRepository.publishAuthenticated('plan', newPlan.planId, newPlan, ['PLAN']);
      const projection = await crossAppRepository.deliverPublishedPlan(identity.humanUserId, newPlan, {
        planVersionId: planPublication.versionId,
        planChecksum: planPublication.contentChecksum,
        planRevision: planPublication.revision,
        workoutVersionIds: [...workoutVersions.values()],
        destinationApplication: 'HUMAN_STRENGTH',
      });
      if (!navigator.onLine || projection.queued) {
        await recordDelivery('QUEUED_OFFLINE', { workoutVersionIds: [...workoutVersions.values()], planVersionId: planPublication.versionId });
        return;
      }
      await recordDelivery('SENDING', { workoutVersionIds: [...workoutVersions.values()], planVersionId: planPublication.versionId });
      await syncManager.syncPending();
      const records = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'plan');
      const current = records.find(record => (record.envelope as PublishedEnvelope<Plan>).versionId === planPublication.versionId);
      if (current?.status === 'CONFLICT' || current?.status === 'FAILED') throw new Error(current.lastErrorCode ?? 'UPLOAD_FAILED');
      const details = { workoutVersionIds: [...workoutVersions.values()], planVersionId: planPublication.versionId, planChecksum: planPublication.contentChecksum, planRevision: planPublication.revision };
      await recordDelivery('SENT_TO_HUMANV1', details);
      const acknowledgement = await deliveryAcknowledgementRepository.findExactPlan(identity.humanUserId, {
        planGlobalId: newPlan.planId, planVersionId: planPublication.versionId,
        planChecksum: planPublication.contentChecksum, sourceRevision: planPublication.revision,
        workoutVersionIds: [...workoutVersions.values()],
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
      const deps: Workout[] = [];
      const changed: Workout[] = [];
      const reused: Workout[] = [];
      for (const week of plan.weeks) {
         for (const placement of week.placements) {
             const workout = availableWorkouts.find(w => w.workoutId === placement.workoutId);
             if (workout) {
                 const pubs = await publicationRepository.listPublishedVersions(identity.humanUserId, 'workout', workout.workoutId);
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
    if (plan.weeks.length <= 1) return;
    const updatedWeeks = plan.weeks.filter((_, idx) => idx !== activeWeekIndex);
    // Re-number weeks
    const renumbered = updatedWeeks.map((w, idx) => ({ ...w, weekNumber: idx + 1, label: `Week ${idx + 1}` }));
    setPlan(withDependencyMetadata({ ...plan, weeks: renumbered }));
    setActiveWeekIndex(Math.max(0, activeWeekIndex - 1));
  };

  const onDragEnd = (result: DropResult) => {
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
    const updatedWeeks = [...plan.weeks];
    updatedWeeks[activeWeekIndex] = {
      ...updatedWeeks[activeWeekIndex],
      placements: updatedWeeks[activeWeekIndex].placements.filter(p => p.placementId !== placementId)
    };
    setPlan(withDependencyMetadata({ ...plan, weeks: updatedWeeks }));
  };
  
  const addWorkoutToDay = (workoutId: string, dayOfWeek: number) => {
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
          <input
            type="text"
            className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-hv-border focus:border-hv-primary focus:outline-none py-1 w-full"
            value={plan.title}
            onChange={(e) => setPlan({ ...plan, title: e.target.value })}
            aria-label="Plan Title"
          />
          <input
            type="text"
            className="text-hv-text-muted mt-1 bg-transparent border-b border-transparent hover:border-hv-border focus:border-hv-primary focus:outline-none w-full"
            value={plan.description || ""}
            onChange={(e) => setPlan({ ...plan, description: e.target.value })}
            placeholder="Add description"
            aria-label="Plan Description"
          />
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className="text-xs text-hv-text-muted hidden md:inline-block">{saveStatus}</span>
          <button onClick={undo} disabled={!canUndo} className="p-2 text-hv-text-muted hover:text-hv-text disabled:opacity-50" aria-label="Undo">
            <Undo2 className="w-5 h-5" />
          </button>
          <button onClick={redo} disabled={!canRedo} className="p-2 text-hv-text-muted hover:text-hv-text disabled:opacity-50" aria-label="Redo">
            <Redo2 className="w-5 h-5" />
          </button>
          <button onClick={handleOpenPublish} disabled={validationErrors.length > 0} aria-describedby={publicationReason ? "plan-publication-reason" : undefined} title={validationErrors[0]?.message ?? dependencyIssues[0]?.message} className="bg-hv-primary text-hv-background px-4 py-2 rounded-md font-medium hover:bg-hv-primary-hover flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            <Send className="w-4 h-4" /> Send plan to my apps
          </button>
      {isPublishModalOpen && (
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
          {deliveryAttempt.phase === 'FAILED' && deliveryAttempt.diagnostic?.retryEligibility === 'RETRYABLE' && <button onClick={handlePublish} className="mt-3 px-3 py-2 rounded bg-hv-primary text-hv-background font-medium">Retry</button>}
          {deliveryAttempt.phase === 'FAILED' && deliveryAttempt.diagnostic?.userCorrectableInStudio && deliveryAttempt.diagnostic.entityType === 'workout' && <button onClick={() => navigate(`/workouts/${deliveryAttempt.diagnostic!.entityId}`)} className="mt-3 px-3 py-2 rounded bg-hv-primary text-hv-background font-medium">Review workout</button>}
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
          <button 
            onClick={addWeek}
            className="px-3 py-1 text-sm font-medium rounded-full border border-hv-border hover:bg-hv-surface-2 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add Week
          </button>
        </div>
        {plan.weeks.length > 1 && (
          <button 
            onClick={removeCurrentWeek}
            className="text-xs text-hv-error hover:underline flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Remove current week
          </button>
        )}
      </div>
      

      
      <DragDropContext onDragEnd={onDragEnd}>
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
                    
                    <Droppable droppableId={`day-${dayOfWeekNumber}`}>
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
                              <Draggable key={p.placementId} draggableId={p.placementId} index={pIdx} isDragDisabled={unresolved}>
                                {(provided) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className="bg-hv-bg border border-hv-border p-3 rounded-md text-sm group relative"
                                  >
                                    <div className="font-semibold mb-1 line-clamp-1 pr-6">{workout?.title || "Workout unavailable"}</div>
                                    <div className="text-xs text-hv-text-muted">{workout?.discipline || "Reconstructed placement"}</div>
                                    {p.dependency?.kind === 'WORKOUT_DRAFT' && <div className="mt-1 text-xs text-hv-primary">{dependencyHasUnpublishedChanges(p.dependency, workoutDrafts) ? 'Workout has unpublished changes' : 'Draft'}</div>}
                                    <PlacementReconstructionStatus placement={p} weekLabel={plan.weeks[activeWeekIndex].label} dayLabel={format(day, 'EEEE')} workout={workout} diagnostics={plan.reconstructionDiagnostics ?? []} />
                                    <button 
                                      onClick={() => removePlacement(p.placementId)}
                                      disabled={unresolved}
                                      title={unresolved ? "Resolve the workout reference before removing this placement" : undefined}
                                      className="absolute top-2 right-2 text-hv-text-muted hover:text-hv-error opacity-0 group-hover:opacity-100 focus:opacity-100"
                                      aria-label="Remove workout"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
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
                      <Draggable key={workout.workoutId} draggableId={workout.workoutId} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className="bg-hv-bg border border-hv-border p-3 rounded-md mb-2 flex items-center justify-between gap-3 group"
                          >
                            <div 
                              {...provided.dragHandleProps} 
                              className="flex-1 flex items-center gap-3 cursor-grab"
                            >
                              <Dumbbell className="w-4 h-4 text-hv-text-muted hidden md:block" />
                              <div>
                                <div className="font-semibold text-sm line-clamp-1">{workout.title}</div>
                                <div className="text-xs text-hv-text-muted">{workout.discipline}</div>
                              </div>
                            </div>
                            
                            <div className="flex gap-1 items-center">
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
                            </div>
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
      </DragDropContext>
    </div>
  );
}
