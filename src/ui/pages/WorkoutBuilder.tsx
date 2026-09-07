import { PublishedEnvelope } from "../../domain/publication";
import { syncManager, SyncRecord } from "../../repositories/SyncManager";
import { useParams } from "react-router";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { v4 as uuidv4 } from "uuid";
import { Workout, Block, ExerciseBlock, Effort, MetricPrescription } from "../../domain/types";
import { GripVertical, Plus, Trash2, Undo2, Redo2, Save, ChevronUp, ChevronDown, AlertCircle } from "lucide-react";
import { catalogueRepository } from "../../repositories/FirebaseCatalogueRepository";
import { Exercise } from "../../domain/catalogue";
import { ExercisePicker } from "../components/ExercisePicker";
import { useHistory } from "../../lib/useHistory";
import { draftRepository } from "../../repositories/DraftRepository";
import { HumanIdentity } from "../../domain/identity";
import { validateWorkout } from "../../domain/validation/workoutValidation";
import { AthletePreview } from "../components/AthletePreview";
import { publicationRepository } from "../../repositories/PublicationRepository";
import { Send } from "lucide-react";
import { deliveryAcknowledgementRepository, DeliveryAcknowledgement } from "../../repositories/DeliveryAcknowledgementRepository";
import { crossAppRepository, markCatalogueSource } from "../../repositories/CrossAppRepository";
import { compatibleDestinations, presentWorkoutDelivery } from '../../domain/deliveryPresentation';
import { WorkoutDeliveryStatus } from '../components/WorkoutDeliveryStatus';

function exerciseCount(blocks: Block[]) {
  return blocks.reduce((total, block) => total + (block.type === 'EXERCISE' ? 1 : block.type === 'SUPERSET' || block.type === 'CIRCUIT' ? block.exercises.length : 0), 0);
}

export default function WorkoutBuilder({ identity }: { identity: HumanIdentity }) {
  const { workoutId: routeWorkoutId } = useParams<{ workoutId: string }>();
  const [exercisesData, setExercisesData] = React.useState<Exercise[]>([]);
  React.useEffect(() => {
    catalogueRepository.getExercises().then(catalogue => setExercisesData(catalogue.map(markCatalogueSource)));
    crossAppRepository.listPrivateExercises(identity.humanUserId, false).then(privateItems => setExercisesData(current => [...current.filter(item => item.source !== "PRIVATE"), ...privateItems])).catch(() => undefined);
  }, [identity.humanUserId]);
  const [workoutId] = useState(() => routeWorkoutId || uuidv4());

  const { state: workout, set: setWorkout, reset, undo, redo, canUndo, canRedo } = useHistory<Workout>({
    schemaVersion: "humanv1.workout/1",
    workoutId,
    title: "New Workout",
    discipline: "STRENGTH",
    catalogueReleaseId: "catalogue_release_pending",
    tags: [],
    blocks: [],
  });

  const [isExerciseDrawerOpen, setIsExerciseDrawerOpen] = useState(false);
  const [isCreateExerciseOpen, setIsCreateExerciseOpen] = useState(false);
  const [exerciseTargetGroupId, setExerciseTargetGroupId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"Saved" | "Saving..." | "Unsaved">("Saved");
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'builder' | 'preview'>('builder');
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [syncRecord, setSyncRecord] = useState<SyncRecord | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryAcknowledgement[]>([]);
  const [publishedVersions, setPublishedVersions] = useState<PublishedEnvelope<Workout>[]>([]);
  const [transientPhase, setTransientPhase] = useState<'VALIDATING' | 'PREPARING' | null>(null);
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(null);
  const publishingRef = useRef(false);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const [identicalVersion, setIdenticalVersion] = useState<PublishedEnvelope<Workout> | null>(null);

  useEffect(() => {
    if (routeWorkoutId || workout.catalogueReleaseId !== "catalogue_release_pending") return;
    const release = catalogueRepository.getActiveReleaseId?.();
    if (release) void release.then(releaseId => setWorkout({ ...workout, catalogueReleaseId: releaseId }));
  }, [routeWorkoutId, setWorkout, workout]);
  
  useEffect(() => {
    if (!workout.workoutId) return;
    const fetchStatus = async () => {
      const records = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'workout');
      const record = records.filter(r => (r.envelope as PublishedEnvelope<Workout>).sourceDraftId === workout.workoutId)
        .sort((a, b) => (b.envelope as PublishedEnvelope<Workout>).revision - (a.envelope as PublishedEnvelope<Workout>).revision)[0];
      setSyncRecord(record || null);
      const [acks, versions] = await Promise.all([
        deliveryAcknowledgementRepository.listForWorkout(identity.humanUserId, workout.workoutId).catch(() => []),
        publicationRepository.listPublishedVersions<Workout>(identity.humanUserId, 'workout', workout.workoutId),
      ]);
      setDeliveries(acks);
      setPublishedVersions(versions);
    };
    fetchStatus();
    const unsub = syncManager.subscribe(fetchStatus);
    const interval = setInterval(fetchStatus, 5000);
    return () => { unsub(); clearInterval(interval); };
  }, [workout.workoutId, identity.humanUserId]);
  
  const deliveryPresentation = useMemo(() => presentWorkoutDelivery({ workout, syncRecord, acknowledgements: deliveries, online: navigator.onLine, latestRevision: publishedVersions[0]?.revision, transientPhase }), [workout, syncRecord, deliveries, publishedVersions, transientPhase]);


  const validationErrors = useMemo(() => validateWorkout(workout, exercisesData), [workout, exercisesData]);


  useEffect(() => {
    let mounted = true;
    if (routeWorkoutId) {
      draftRepository.getWorkoutDraft(identity.humanUserId, routeWorkoutId).then(async (draft) => {
        if (!mounted) return;
        const appWorkout = draft ? null : (await crossAppRepository.listAppWorkouts(identity.humanUserId).catch(() => [])).find(item => item.workoutId === routeWorkoutId);
        if (draft || appWorkout) reset(draft || appWorkout!);
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
    return () => { mounted = false; };
  }, [identity.humanUserId, reset, routeWorkoutId]);

  useEffect(() => {
    if (isLoading) return;
    if (validationErrors.length > 0) {
      setSaveStatus("Unsaved");
      return;
    }
    let timeout: ReturnType<typeof setTimeout>;
    setSaveStatus("Saving...");
    timeout = setTimeout(() => {
      draftRepository.saveWorkoutDraft(identity.humanUserId, workout).then(() => {
        void crossAppRepository.saveAppWorkout(identity.humanUserId, workout).catch(() => undefined);
        setSaveStatus("Saved");
      });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [workout, identity.humanUserId, isLoading, validationErrors.length]);

  const handlePublish = async () => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setIsPublishModalOpen(false);
    setTransientPhase('VALIDATING');
    setNotice({ key: `validating-${workout.workoutId}`, message: 'Checking your workout…' });
    try {
      if (validationErrors.length) return;
      setTransientPhase('PREPARING');
      setNotice({ key: `preparing-${workout.workoutId}`, message: 'Preparing version…' });
      const envelope = await publicationRepository.publishAuthenticated('workout', workout.workoutId, workout, [workout.discipline]);
      setNotice({ key: `queued-${envelope.versionId}`, message: navigator.onLine ? 'Saved and queued' : 'Queued — will send when connected' });
    } catch (error: unknown) {
      console.warn("Failed to publish", error instanceof Error ? error.message : 'Publication failed');
      setNotice({ key: `failed-${workout.workoutId}`, message: 'Workout could not be queued. Your draft is safe.' });
    } finally {
      setTransientPhase(null);
      publishingRef.current = false;
    }
  };

  const closePublishDialog = () => { setIsPublishModalOpen(false); requestAnimationFrame(() => publishButtonRef.current?.focus()); };
  const openPublishDialog = async () => {
    if (validationErrors.length || publishingRef.current) return;
    const checksum = await publicationRepository.generateChecksum(workout);
    setIdenticalVersion(publishedVersions.find(version => version.contentChecksum === checksum) ?? null);
    setIsPublishModalOpen(true);
  };

  useEffect(() => {
    if (!isPublishModalOpen) return;
    continueButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closePublishDialog(); }
      if (event.key === 'Tab') {
        const focusable = [continueButtonRef.current, document.getElementById('confirm-send-workout')].filter(Boolean) as HTMLElement[];
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isPublishModalOpen]);

  useEffect(() => {
    if (!deliveryPresentation?.versionId || !['SENT_TO_HUMANV1', 'AVAILABLE_IN_APPS', 'PARTIALLY_DELIVERED', 'CONFLICT', 'RETRY_REQUIRED'].includes(deliveryPresentation.phase)) return;
    const key = `delivery_notice_seen_${identity.humanUserId}_${deliveryPresentation.versionId}_${deliveryPresentation.phase}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    setNotice({ key, message: deliveryPresentation.title });
  }, [deliveryPresentation, identity.humanUserId]);
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(workout.blocks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setWorkout({ ...workout, blocks: items });
  };

  const addExercise = (exerciseId: string, name: string) => {
    const exercise = exercisesData.find(e => e.exerciseId === exerciseId);
    if (!exercise) return;

    // Auto-generate a prescription based on the primary metrics
    const defaultPrescriptions: MetricPrescription[] = exercise.metricProfile.primary.map((metricKey, idx) => {
      let unit = "count";
      let val = 10;
      if (metricKey === "duration") { unit = "s"; val = 60; }
      if (metricKey === "distance") { unit = "m"; val = 100; }
      if (metricKey === "external_load") { unit = "kg"; val = 20; }

      return {
        prescriptionId: uuidv4(),
        metricKey,
        targetValue: val,
        canonicalUnit: unit,
        position: idx
      };
    });

    const newBlock: ExerciseBlock = {
      blockId: uuidv4(),
      type: "EXERCISE",
      exerciseId,
      exerciseNameSnapshot: name,
      efforts: [
        {
          effortId: uuidv4(),
          effortType: "WORKING",
          prescriptions: defaultPrescriptions,
        },
      ],
    };
    if (exerciseTargetGroupId) {
      setWorkout({
        ...workout,
        blocks: workout.blocks.map((block) =>
          block.blockId === exerciseTargetGroupId && (block.type === "SUPERSET" || block.type === "CIRCUIT")
            ? { ...block, exercises: [...block.exercises, newBlock] }
            : block,
        ),
      });
    } else {
      setWorkout({ ...workout, blocks: [...workout.blocks, newBlock] });
    }
    setExerciseTargetGroupId(null);
    setIsExerciseDrawerOpen(false);
  };

  const openExercisePicker = (groupId: string | null = null) => {
    setExerciseTargetGroupId(groupId);
    setIsExerciseDrawerOpen(true);
  };

  const createAndSelectExercise = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const metrics = String(form.get("metrics") || "").split(",").map(value => value.trim()).filter(Boolean);
    const created = await crossAppRepository.savePrivateExercise(identity.humanUserId, {
      name: String(form.get("name")), category: String(form.get("category")), equipment: [], aliases: [],
      metricProfile: { primary: metrics, secondary: [], optional: [], unsupported: [] },
    });
    setExercisesData(items => [...items, created]);
    setIsCreateExerciseOpen(false);
    addExercise(created.exerciseId, created.name);
  };

  const removeGroupedExercise = (groupId: string, exerciseBlockId: string) => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.map((block) =>
        block.blockId === groupId && (block.type === "SUPERSET" || block.type === "CIRCUIT")
          ? { ...block, exercises: block.exercises.filter((exercise) => exercise.blockId !== exerciseBlockId) }
          : block,
      ),
    });
  };

  const moveGroupedExercise = (groupId: string, index: number, direction: "up" | "down") => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.map((block) => {
        if (block.blockId !== groupId || (block.type !== "SUPERSET" && block.type !== "CIRCUIT")) return block;
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= block.exercises.length) return block;
        const exercises = [...block.exercises];
        [exercises[index], exercises[targetIndex]] = [exercises[targetIndex], exercises[index]];
        return { ...block, exercises };
      }),
    });
  };

  const removeBlock = (id: string) => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.filter((b) => b.blockId !== id),
    });
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === workout.blocks.length - 1) return;

    const newBlocks = Array.from(workout.blocks);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // Swap
    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];

    setWorkout({ ...workout, blocks: newBlocks });
  };

  const addEffort = (blockId: string, parentBlockId?: string) => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.map(b => {
        if (parentBlockId && b.blockId === parentBlockId && (b.type === "SUPERSET" || b.type === "CIRCUIT")) {
          return {
            ...b,
            exercises: b.exercises.map(ex => {
              if (ex.blockId !== blockId) return ex;
              const lastEffort = ex.efforts[ex.efforts.length - 1];
              const newEffort = {
                ...lastEffort,
                effortId: uuidv4(),
                prescriptions: lastEffort.prescriptions.map(p => ({ ...p, prescriptionId: uuidv4() }))
              };
              return { ...ex, efforts: [...ex.efforts, newEffort] };
            })
          };
        }
        if (!parentBlockId && b.blockId === blockId && b.type === "EXERCISE") {
          const lastEffort = b.efforts[b.efforts.length - 1];
          const newEffort = {
            ...lastEffort,
            effortId: uuidv4(),
            prescriptions: lastEffort.prescriptions.map(p => ({ ...p, prescriptionId: uuidv4() }))
          };
          return { ...b, efforts: [...b.efforts, newEffort] };
        }
        return b;
      })
    });
  };

  const removeEffort = (blockId: string, effortId: string, parentBlockId?: string) => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.map(b => {
        if (parentBlockId && b.blockId === parentBlockId && (b.type === "SUPERSET" || b.type === "CIRCUIT")) {
          return {
            ...b,
            exercises: b.exercises.map(ex => {
              if (ex.blockId !== blockId) return ex;
              return { ...ex, efforts: ex.efforts.filter(e => e.effortId !== effortId) };
            })
          };
        }
        if (!parentBlockId && b.blockId === blockId && b.type === "EXERCISE") {
          return { ...b, efforts: b.efforts.filter(e => e.effortId !== effortId) };
        }
        return b;
      })
    });
  };

  const updateMetric = (blockId: string, effortId: string, prescriptionId: string, value: number, parentBlockId?: string) => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.map(b => {
        if (parentBlockId && b.blockId === parentBlockId && (b.type === "SUPERSET" || b.type === "CIRCUIT")) {
          return {
            ...b,
            exercises: b.exercises.map(ex => {
              if (ex.blockId !== blockId) return ex;
              return {
                ...ex,
                efforts: ex.efforts.map(e => {
                  if (e.effortId !== effortId) return e;
                  return {
                    ...e,
                    prescriptions: e.prescriptions.map(p => p.prescriptionId === prescriptionId ? { ...p, targetValue: value } : p)
                  };
                })
              };
            })
          };
        }
        if (!parentBlockId && b.blockId === blockId && b.type === "EXERCISE") {
          return {
            ...b,
            efforts: b.efforts.map(e => {
              if (e.effortId !== effortId) return e;
              return {
                ...e,
                prescriptions: e.prescriptions.map(p => p.prescriptionId === prescriptionId ? { ...p, targetValue: value } : p)
              };
            })
          };
        }
        return b;
      })
    });
  };

  const updateEffortType = (blockId: string, effortId: string, value: string, parentBlockId?: string) => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.map(b => {
        if (parentBlockId && b.blockId === parentBlockId && (b.type === "SUPERSET" || b.type === "CIRCUIT")) {
          return {
            ...b,
            exercises: b.exercises.map(ex => {
              if (ex.blockId !== blockId) return ex;
              return {
                ...ex,
                efforts: ex.efforts.map(e => e.effortId === effortId ? { ...e, effortType: value as Effort['effortType'] } : e)
              };
            })
          };
        }
        if (!parentBlockId && b.blockId === blockId && b.type === "EXERCISE") {
          return {
            ...b,
            efforts: b.efforts.map(e => e.effortId === effortId ? { ...e, effortType: value as Effort['effortType'] } : e)
          };
        }
        return b;
      })
    });
  };

  const renderExerciseBlock = (exBlock: ExerciseBlock, parentBlockId?: string) => (
    <div key={exBlock.blockId} className="space-y-2 mt-2 border-t border-hv-border pt-2">
      <div className="font-medium">{exBlock.exerciseNameSnapshot}</div>
      {exBlock.efforts.map((effort, eIdx) => (
        <div key={effort.effortId} className="flex flex-wrap items-center gap-2 md:gap-4 text-sm bg-hv-surface-2 p-2 rounded">
          <span className="w-4 md:w-6 text-hv-text-muted font-mono">{eIdx + 1}</span>
          <select
            className="bg-transparent text-hv-text-muted border-none outline-none focus:text-hv-text min-w-[80px]"
            value={effort.effortType}
            onChange={(e) => updateEffortType(exBlock.blockId, effort.effortId, e.target.value, parentBlockId)}
            aria-label={`Effort ${eIdx + 1} type`}
          >
            <option value="WARM_UP">Warm Up</option>
            <option value="WORKING">Working</option>
            <option value="DROP_SET">Drop Set</option>
            <option value="FAILURE">Failure</option>
            <option value="TIMED">Timed</option>
          </select>

          <div className="flex-1 flex flex-wrap gap-2 md:gap-4 items-center">
            {effort.prescriptions.map((p) => (
              <div key={p.prescriptionId} className="flex items-center bg-hv-bg rounded px-2 py-1 border border-hv-border focus-within:border-hv-primary" title={p.metricKey}>
                <span className="text-hv-text-muted mr-2 text-xs uppercase hidden sm:block">{p.metricKey.replace('_', ' ')}</span>
                <input
                  type="number"
                  className="bg-transparent w-16 outline-none text-right font-mono"
                  value={p.targetValue || p.minimumValue || ""}
                  onChange={(e) => updateMetric(exBlock.blockId, effort.effortId, p.prescriptionId, Number(e.target.value), parentBlockId)}
                  aria-label={`${p.metricKey} target`}
                />
                <span className="text-hv-text-muted ml-1 text-xs select-none">{p.canonicalUnit}</span>
              </div>
            ))}
          </div>

          <button onClick={() => removeEffort(exBlock.blockId, effort.effortId, parentBlockId)} className="text-hv-text-muted hover:text-hv-error ml-auto p-1" aria-label="Remove effort">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button onClick={() => addEffort(exBlock.blockId, parentBlockId)} className="text-sm text-hv-primary hover:text-hv-primary-hover flex items-center gap-1 mt-2 p-1">
        <Plus className="w-4 h-4" /> Add effort
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col md:flex-row relative">
      {/* Main Canvas */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
          <input
            type="text"
            className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-hv-border focus:border-hv-primary focus:outline-none py-1 w-full md:w-auto"
            value={workout.title}
            onChange={(e) => setWorkout({ ...workout, title: e.target.value })}
            aria-label="Workout Title"
          />
          <div className="flex items-center gap-2 self-end md:self-auto">
            <span className="text-xs text-hv-text-muted hidden md:inline-block">{saveStatus}</span>
            <button onClick={undo} disabled={!canUndo} className="p-2 text-hv-text-muted hover:text-hv-text disabled:opacity-50" aria-label="Undo">
              <Undo2 className="w-5 h-5" />
            </button>
            <button onClick={redo} disabled={!canRedo} className="p-2 text-hv-text-muted hover:text-hv-text disabled:opacity-50" aria-label="Redo">
              <Redo2 className="w-5 h-5" />
            </button>
            <button ref={publishButtonRef}
    onClick={() => void openPublishDialog()}
    disabled={validationErrors.length > 0 || transientPhase !== null}
    className={`px-4 py-2 rounded-md font-medium ${validationErrors.length > 0 ? 'bg-hv-surface-2 text-hv-text-muted cursor-not-allowed' : 'bg-hv-primary text-hv-background hover:bg-hv-primary-hover'}`}
>
    Send to my apps
</button>
{isPublishModalOpen && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closePublishDialog(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="send-dialog-title" aria-describedby="send-dialog-description" className="bg-hv-surface-1 p-6 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 id="send-dialog-title" className="text-xl font-bold mb-2 text-hv-text">Send to my apps</h2>
            <p id="send-dialog-description" className="mb-4 text-sm text-hv-text-muted">Review the immutable version that will be sent.</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-4 text-sm">
                <dt className="font-semibold">Workout</dt><dd>{workout.title}</dd>
                <dt className="font-semibold">Discipline</dt><dd>{workout.discipline}</dd>
                <dt className="font-semibold">Ordered blocks</dt><dd>{workout.blocks.length}</dd>
                <dt className="font-semibold">Exercises</dt><dd>{exerciseCount(workout.blocks)}</dd>
                <dt className="font-semibold">Catalogue release</dt><dd className="break-all">{workout.catalogueReleaseId}</dd>
                <dt className="font-semibold">Draft revision</dt><dd>{publishedVersions[0] ? `After published revision ${publishedVersions[0].revision}` : 'First publication'}</dd>
                <dt className="font-semibold">Destinations</dt><dd>{compatibleDestinations(workout).map(item => item.label).join(', ') || 'Any compatible HumanV1 app'}</dd>
                <dt className="font-semibold">Connection</dt><dd>{navigator.onLine ? 'Online' : 'Offline — safely queue on this device'}</dd>
            </dl>
            <p className="mb-3 text-sm">{identicalVersion ? `This content already exists as revision ${identicalVersion.revision}; sending again will reuse it without creating a duplicate.` : publishedVersions.length ? 'This creates a new immutable version.' : 'This creates the first immutable version.'}</p>
            <p className="mb-6 text-sm text-hv-text-muted">Your draft remains editable. Existing published versions are preserved.</p>
            <div className="flex justify-end gap-3">
                <button ref={continueButtonRef} onClick={closePublishDialog} className="px-4 py-2 text-hv-text-muted hover:text-hv-text rounded">Continue editing</button>
                <button id="confirm-send-workout" onClick={handlePublish} className="px-4 py-2 bg-hv-primary text-hv-background rounded hover:bg-hv-primary-hover font-medium">Send to my apps</button>
            </div>
        </div>
    </div>
)}
          </div>
        </div>

        <div className="flex gap-4 border-b border-hv-border mb-6">
          <button 
            className={`pb-2 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'builder' ? 'border-hv-primary text-hv-primary' : 'border-transparent text-hv-text-muted hover:text-hv-text'}`}
            onClick={() => setActiveTab('builder')}
          >
            Builder
          </button>
          <button 
            className={`pb-2 px-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'preview' ? 'border-hv-primary text-hv-primary' : 'border-transparent text-hv-text-muted hover:text-hv-text'}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
            {validationErrors.length > 0 && (
              <span className="bg-hv-error text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
                {validationErrors.length}
              </span>
            )}
          </button>
        </div>

        {validationErrors.length > 0 && activeTab === 'builder' && (
          <div className="mb-6 p-4 bg-hv-surface-2 border border-hv-error rounded-lg text-sm">
            <div className="flex items-center gap-2 text-hv-error font-medium mb-2">
              <AlertCircle className="w-4 h-4" />
              <span>Validation Errors</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-hv-text-muted">
              {validationErrors.map((err, idx) => (
                <li key={idx}>
                  <span className="font-semibold">{err.blockId ? `Block: ` : 'Workout: '}</span> 
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {notice && <div role="status" aria-live="polite" className="mb-4 flex items-center justify-between rounded-lg border border-hv-primary bg-hv-surface-1 p-3 text-sm"><span>{notice.message}</span><button aria-label="Dismiss delivery notification" onClick={() => setNotice(null)} className="rounded px-2 py-1">Dismiss</button></div>}
        {activeTab === 'builder' && <WorkoutDeliveryStatus delivery={deliveryPresentation} onRetry={() => void syncManager.syncPending()} />}

        {activeTab === 'preview' ? (
          <AthletePreview workout={workout} catalogue={exercisesData} delivery={deliveryPresentation} />
        ) : (
          <>
            <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="workout-blocks">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-4 mb-8"
                >
                  {workout.blocks.map((block, index) => (
                    <Draggable key={block.blockId} draggableId={block.blockId} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className="bg-hv-surface-1 border border-hv-border rounded-lg p-4 flex gap-2 md:gap-4 flex-col md:flex-row"
                      >
                        <div className="flex justify-between items-center md:hidden mb-2">
                           <div {...provided.dragHandleProps} className="text-hv-text-muted flex items-center justify-center cursor-grab active:cursor-grabbing p-1" aria-label="Drag handle">
                              <GripVertical className="w-5 h-5" />
                           </div>
                           <div className="flex gap-2">
                             <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} className="text-hv-text-muted hover:text-hv-text disabled:opacity-30 p-1" aria-label="Move block up">
                               <ChevronUp className="w-5 h-5" />
                             </button>
                             <button onClick={() => moveBlock(index, 'down')} disabled={index === workout.blocks.length - 1} className="text-hv-text-muted hover:text-hv-text disabled:opacity-30 p-1" aria-label="Move block down">
                               <ChevronDown className="w-5 h-5" />
                             </button>
                             <button onClick={() => removeBlock(block.blockId)} className="text-hv-error hover:text-red-400 p-1 rounded" aria-label="Remove exercise">
                                <Trash2 className="w-5 h-5" />
                             </button>
                           </div>
                        </div>

                        <div className="hidden md:flex flex-col gap-1 items-center justify-center">
                          <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} className="text-hv-text-muted hover:text-hv-text disabled:opacity-30 p-1" aria-label="Move block up">
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <div
                            {...provided.dragHandleProps}
                            className="text-hv-text-muted hover:text-hv-text flex items-center justify-center cursor-grab active:cursor-grabbing p-1"
                            aria-label="Drag handle"
                          >
                            <GripVertical className="w-5 h-5" />
                          </div>
                          <button onClick={() => moveBlock(index, 'down')} disabled={index === workout.blocks.length - 1} className="text-hv-text-muted hover:text-hv-text disabled:opacity-30 p-1" aria-label="Move block down">
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-4">
                            {block.type === "EXERCISE" ? block.exerciseNameSnapshot : block.type === "SUPERSET" ? "Superset" : block.type === "CIRCUIT" ? `Circuit (${block.rounds} Rounds)` : block.type}
                          </h3>
                          {block.type === "REST" && (
                            <div className="flex items-center gap-4 text-sm bg-hv-surface-2 p-2 rounded">
                              <span className="text-hv-text-muted">Rest for</span>
                              <div className="flex items-center bg-hv-bg rounded px-2 py-1 border border-hv-border focus-within:border-hv-primary">
                                <input
                                  type="number"
                                  className="bg-transparent w-12 outline-none text-right font-mono text-hv-text"
                                  value={block.durationSeconds || ""}
                                  onChange={(e) => {
                                    const updatedBlocks = workout.blocks.map(b => b.blockId === block.blockId ? { ...b, durationSeconds: Number(e.target.value) } : b);
                                    setWorkout({ ...workout, blocks: updatedBlocks as Block[] });
                                  }}
                                  aria-label="Rest duration in seconds"
                                />
                                <span className="text-hv-text-muted ml-1 text-xs select-none">s</span>
                              </div>
                            </div>
                          )}


                          {block.type === "SUPERSET" && (
                            <div className="space-y-4">
                              <p className="text-sm text-hv-text-muted">A superset groups multiple exercises performed sequentially with minimal rest.</p>
                              {block.exercises.map((exBlock, i) => (
                                <div key={exBlock.blockId} className="p-3 bg-hv-surface-2 rounded-lg border border-hv-border flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 font-medium">{exBlock.exerciseNameSnapshot}</div>
                                    <button onClick={() => moveGroupedExercise(block.blockId, i, "up")} disabled={i === 0} aria-label={`Move ${exBlock.exerciseNameSnapshot} up`} className="p-2 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                                    <button onClick={() => moveGroupedExercise(block.blockId, i, "down")} disabled={i === block.exercises.length - 1} aria-label={`Move ${exBlock.exerciseNameSnapshot} down`} className="p-2 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                                    <button onClick={() => removeGroupedExercise(block.blockId, exBlock.blockId)} aria-label={`Remove ${exBlock.exerciseNameSnapshot} from superset`} className="p-2 text-hv-error"><Trash2 className="w-4 h-4" /></button>
                                  </div>
                                  {renderExerciseBlock(exBlock, block.blockId)}
                                </div>
                              ))}
                              <button onClick={() => openExercisePicker(block.blockId)} className="text-sm text-hv-primary hover:text-hv-primary-hover flex items-center gap-1 p-2"><Plus className="w-4 h-4" /> Add exercise to superset</button>
                            </div>
                          )}
                          {block.type === "CIRCUIT" && (
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">Rounds:</span>
                                <input type="number" min={1} max={99} aria-label="Circuit rounds" className="w-16 bg-hv-bg border border-hv-border rounded px-2 py-1 text-sm" value={block.rounds} onChange={(e) => {
                                  const rounds = Math.max(1, Math.min(99, Number(e.target.value) || 1));
                                  const updated = workout.blocks.map(b => b.blockId === block.blockId && b.type === "CIRCUIT" ? { ...b, rounds } : b);
                                  setWorkout({ ...workout, blocks: updated });
                                }} />
                              </div>
                              <p className="text-sm text-hv-text-muted">A circuit repeats all exercises for the specified rounds.</p>
                              {block.exercises.map((exBlock, i) => (
                                <div key={exBlock.blockId} className="p-3 bg-hv-surface-2 rounded-lg border border-hv-border flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 font-medium">{exBlock.exerciseNameSnapshot}</div>
                                    <button onClick={() => moveGroupedExercise(block.blockId, i, "up")} disabled={i === 0} aria-label={`Move ${exBlock.exerciseNameSnapshot} up`} className="p-2 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                                    <button onClick={() => moveGroupedExercise(block.blockId, i, "down")} disabled={i === block.exercises.length - 1} aria-label={`Move ${exBlock.exerciseNameSnapshot} down`} className="p-2 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                                    <button onClick={() => removeGroupedExercise(block.blockId, exBlock.blockId)} aria-label={`Remove ${exBlock.exerciseNameSnapshot} from circuit`} className="p-2 text-hv-error"><Trash2 className="w-4 h-4" /></button>
                                  </div>
                                  {renderExerciseBlock(exBlock, block.blockId)}
                                </div>
                              ))}
                              <button onClick={() => openExercisePicker(block.blockId)} className="text-sm text-hv-primary hover:text-hv-primary-hover flex items-center gap-1 p-2"><Plus className="w-4 h-4" /> Add exercise to circuit</button>
                            </div>
                          )}

                          {block.type === "NOTE" && (
                            <div className="flex items-center gap-4 text-sm bg-hv-surface-2 p-2 rounded">
                              <textarea
                                className="bg-transparent outline-none w-full text-hv-text resize-none"
                                rows={2}
                                placeholder="Add notes..."
                                value={block.text || ""}
                                onChange={(e) => {
                                  const updatedBlocks = workout.blocks.map(b => b.blockId === block.blockId ? { ...b, text: e.target.value } : b);
                                  setWorkout({ ...workout, blocks: updatedBlocks as Block[] });
                                }}
                                aria-label="Note block text"
                              />
                            </div>
                          )}
                          {block.type === "EXERCISE" && (
                            <div className="space-y-2">
                              {renderExerciseBlock(block)}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeBlock(block.blockId)}
                          className="text-hv-error hover:text-red-400 p-2 h-fit rounded hidden md:block"
                          aria-label="Remove exercise"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>


        <div className="flex flex-col sm:flex-row gap-4 mt-8 flex-wrap">
          <button
            onClick={() => openExercisePicker()}
            className="flex-1 border-2 border-dashed border-hv-border hover:border-hv-primary text-hv-text-muted hover:text-hv-primary rounded-lg p-4 flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Add Exercise</span>
          </button>

          <button
            onClick={() => {
              const newBlock: Block = {
                blockId: uuidv4(),
                type: "SUPERSET",
                exercises: []
              };
              setWorkout({ ...workout, blocks: [...workout.blocks, newBlock] });
            }}
            className="flex-1 border-2 border-dashed border-hv-border hover:border-hv-primary text-hv-text-muted hover:text-hv-primary rounded-lg p-4 flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Add Superset</span>
          </button>

          <button
            onClick={() => {
              const newBlock: Block = {
                blockId: uuidv4(),
                type: "CIRCUIT",
                rounds: 3,
                exercises: []
              };
              setWorkout({ ...workout, blocks: [...workout.blocks, newBlock] });
            }}
            className="flex-1 border-2 border-dashed border-hv-border hover:border-hv-primary text-hv-text-muted hover:text-hv-primary rounded-lg p-4 flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Add Circuit</span>
          </button>

          <button
            onClick={() => {
              const newBlock: Block = {
                blockId: uuidv4(),
                type: "REST",
                durationSeconds: 60,
                recoveryType: "PASSIVE",
              };
              setWorkout({ ...workout, blocks: [...workout.blocks, newBlock] });
            }}
            className="flex-1 border-2 border-dashed border-hv-border hover:border-hv-primary text-hv-text-muted hover:text-hv-primary rounded-lg p-4 flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Add Rest</span>
          </button>

          <button
            onClick={() => {
              const newBlock: Block = {
                blockId: uuidv4(),
                type: "NOTE",
                text: "",
              };
              setWorkout({ ...workout, blocks: [...workout.blocks, newBlock] });
            }}
            className="flex-1 border-2 border-dashed border-hv-border hover:border-hv-primary text-hv-text-muted hover:text-hv-primary rounded-lg p-4 flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Add Note</span>
          </button>
        </div>
        </>
        )}
      </div>

      {/* Exercise Drawer */}
      {isExerciseDrawerOpen && (
        <ExercisePicker
          exercises={exercisesData}
          onSelect={addExercise}
          onClose={() => { setExerciseTargetGroupId(null); setIsExerciseDrawerOpen(false); }}
          onCreate={() => setIsCreateExerciseOpen(true)}
        />
      )}
      {isCreateExerciseOpen && <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"><form onSubmit={createAndSelectExercise} className="bg-hv-surface-1 border border-hv-border rounded-xl p-6 w-full max-w-md space-y-4"><h2 className="font-bold text-xl">Create your exercise</h2><p className="text-sm text-hv-text-muted">Private to your account. Your unsaved workout stays open.</p><input name="name" required placeholder="Exercise name" className="w-full p-2 bg-hv-bg border border-hv-border rounded"/><input name="category" required placeholder="Movement / category" className="w-full p-2 bg-hv-bg border border-hv-border rounded"/><input name="metrics" required placeholder="Metrics, e.g. duration,distance" className="w-full p-2 bg-hv-bg border border-hv-border rounded"/><div className="flex justify-end gap-2"><button type="button" onClick={() => setIsCreateExerciseOpen(false)}>Cancel</button><button className="bg-hv-primary text-white px-4 py-2 rounded">Save and select</button></div></form></div>}
    </div>
  );
}
