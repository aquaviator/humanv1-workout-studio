import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { v4 as uuidv4 } from "uuid";
import { Workout, Block, ExerciseBlock, Effort, MetricPrescription } from "../../domain/types";
import { GripVertical, Plus, Trash2, Undo2, Redo2, Save, ChevronUp, ChevronDown } from "lucide-react";
import { catalogueRepository } from "../../repositories/FirebaseCatalogueRepository";
import { Exercise } from "../../domain/catalogue";
import { ExercisePicker } from "../components/ExercisePicker";
import { useHistory } from "../../lib/useHistory";
import { draftRepository } from "../../repositories/DraftRepository";
import { HumanIdentity } from "../../domain/identity";

export default function WorkoutBuilder({ identity }: { identity: HumanIdentity }) {
  const [exercisesData, setExercisesData] = React.useState<Exercise[]>([]);
  React.useEffect(() => { catalogueRepository.getExercises().then(setExercisesData); }, []);
  const [workoutId] = useState(() => uuidv4());

  const { state: workout, set: setWorkout, reset, undo, redo, canUndo, canRedo } = useHistory<Workout>({
    schemaVersion: "humanv1.workout/1",
    workoutId,
    title: "New Workout",
    discipline: "STRENGTH",
    catalogueReleaseId: "fixture_catalogue_v1",
    tags: [],
    blocks: [],
  });

  const [isExerciseDrawerOpen, setIsExerciseDrawerOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"Saved" | "Saving..." | "Unsaved">("Saved");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    draftRepository.listWorkoutDrafts(identity.humanUserId).then((drafts) => {
      if (!mounted) return;
      if (drafts.length > 0) {
        // Sort by updatedAt descending (which means we should grab the draft envelope, but since list returns Workout[], we just take the last one or maybe we should just use the first)
        reset(drafts[0]);
      }
      setIsLoading(false);
    });
    return () => { mounted = false; };
  }, [identity.humanUserId, reset]);

  useEffect(() => {
    if (isLoading) return;
    let timeout: ReturnType<typeof setTimeout>;
    setSaveStatus("Saving...");
    timeout = setTimeout(() => {
      draftRepository.saveWorkoutDraft(identity.humanUserId, workout).then(() => {
        setSaveStatus("Saved");
      });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [workout, identity.humanUserId]);

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
    setWorkout({ ...workout, blocks: [...workout.blocks, newBlock] });
    setIsExerciseDrawerOpen(false);
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

  const addEffort = (blockId: string) => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.map(b => {
        if (b.blockId !== blockId || b.type !== "EXERCISE") return b;
        const lastEffort = b.efforts[b.efforts.length - 1];
        const newEffort = {
          ...lastEffort,
          effortId: uuidv4(),
          prescriptions: lastEffort.prescriptions.map(p => ({ ...p, prescriptionId: uuidv4() }))
        };
        return { ...b, efforts: [...b.efforts, newEffort] };
      })
    });
  };

  const removeEffort = (blockId: string, effortId: string) => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.map(b => {
        if (b.blockId !== blockId || b.type !== "EXERCISE") return b;
        return { ...b, efforts: b.efforts.filter(e => e.effortId !== effortId) };
      })
    });
  };

  const updateMetric = (blockId: string, effortId: string, prescriptionId: string, value: number) => {
    setWorkout({
      ...workout,
      blocks: workout.blocks.map(b => {
        if (b.blockId !== blockId || b.type !== "EXERCISE") return b;
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
      })
    });
  };

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
            <button className="bg-hv-surface-2 text-hv-text-muted px-4 py-2 rounded-md cursor-not-allowed font-medium" disabled>
              Publish
            </button>
          </div>
        </div>

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
                              {block.exercises && block.exercises.map((exBlock, i) => (
                                <div key={exBlock.blockId} className="p-3 bg-hv-surface-2 rounded-lg border border-hv-border">
                                  <div className="font-medium mb-2">{exBlock.exerciseNameSnapshot}</div>
                                  <div className="text-sm text-hv-text-muted">{exBlock.efforts.length} effort(s)</div>
                                </div>
                              ))}
                              <div className="text-sm text-hv-primary">Select an exercise from the library and drag it here (TBD in v1.1)</div>
                            </div>
                          )}
                          {block.type === "CIRCUIT" && (
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">Rounds:</span>
                                <input type="number" className="w-16 bg-hv-bg border border-hv-border rounded px-2 py-1 text-sm" value={block.rounds || 3} onChange={(e) => {
                                  const updated = workout.blocks.map(b => b.blockId === block.blockId ? { ...b, rounds: Number(e.target.value) } : b);
                                  setWorkout({ ...workout, blocks: updated as any[] });
                                }} />
                              </div>
                              <p className="text-sm text-hv-text-muted">A circuit repeats all exercises for the specified rounds.</p>
                              {block.exercises && block.exercises.map((exBlock, i) => (
                                <div key={exBlock.blockId} className="p-3 bg-hv-surface-2 rounded-lg border border-hv-border">
                                  <div className="font-medium mb-2">{exBlock.exerciseNameSnapshot}</div>
                                  <div className="text-sm text-hv-text-muted">{exBlock.efforts.length} effort(s)</div>
                                </div>
                              ))}
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
                              {block.efforts.map((effort, eIdx) => (
                                <div key={effort.effortId} className="flex flex-wrap items-center gap-2 md:gap-4 text-sm bg-hv-surface-2 p-2 rounded">
                                  <span className="w-4 md:w-6 text-hv-text-muted font-mono">{eIdx + 1}</span>
                                  <select
                                    className="bg-transparent text-hv-text-muted border-none outline-none focus:text-hv-text min-w-[80px]"
                                    value={effort.effortType}
                                    onChange={(e) => {
                                      const updatedEfforts = [...block.efforts];
                                      updatedEfforts[eIdx].effortType = e.target.value as any;
                                      const updatedBlocks = workout.blocks.map(b => b.blockId === block.blockId ? { ...b, efforts: updatedEfforts } : b);
                                      setWorkout({ ...workout, blocks: updatedBlocks as Block[] });
                                    }}
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
                                      <div key={p.prescriptionId} className="flex items-center bg-hv-bg rounded px-2 py-1 border border-hv-border focus-within:border-hv-primary">
                                        <input
                                          type="number"
                                          className="bg-transparent w-12 outline-none text-right font-mono"
                                          value={p.targetValue || p.minimumValue || ""}
                                          onChange={(e) => updateMetric(block.blockId, effort.effortId, p.prescriptionId, Number(e.target.value))}
                                          aria-label={`${p.metricKey} target`}
                                        />
                                        <span className="text-hv-text-muted ml-1 text-xs select-none">{p.canonicalUnit}</span>
                                      </div>
                                    ))}
                                  </div>

                                  <button onClick={() => removeEffort(block.blockId, effort.effortId)} className="text-hv-text-muted hover:text-hv-error ml-auto p-1" aria-label="Remove effort">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button onClick={() => addEffort(block.blockId)} className="text-sm text-hv-primary hover:text-hv-primary-hover flex items-center gap-1 mt-2 p-1">
                                <Plus className="w-4 h-4" /> Add effort
                              </button>
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
            onClick={() => setIsExerciseDrawerOpen(true)}
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
</div>

      {/* Exercise Drawer */}
      {isExerciseDrawerOpen && (
        <ExercisePicker
          exercises={exercisesData}
          onSelect={addExercise}
          onClose={() => setIsExerciseDrawerOpen(false)}
        />
      )}
    </div>
  );
}
