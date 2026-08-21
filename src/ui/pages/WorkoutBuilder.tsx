import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { v4 as uuidv4 } from "uuid";
import { Workout, Block, ExerciseBlock, Effort } from "../../domain/types";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import exercisesData from "../../fixtures/exercises.json";

export default function WorkoutBuilder() {
  const [workout, setWorkout] = useState<Workout>({
    schemaVersion: "humanv1.workout/1",
    workoutId: uuidv4(),
    title: "New Workout",
    discipline: "STRENGTH",
    catalogueReleaseId: "fixture_catalogue_v1",
    tags: [],
    blocks: [],
  });

  const [isExerciseDrawerOpen, setIsExerciseDrawerOpen] = useState(false);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(workout.blocks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setWorkout({ ...workout, blocks: items });
  };

  const addExercise = (exerciseId: string, name: string) => {
    const newBlock: ExerciseBlock = {
      blockId: uuidv4(),
      type: "EXERCISE",
      exerciseId,
      exerciseNameSnapshot: name,
      efforts: [
        {
          effortId: uuidv4(),
          effortType: "WORKING",
          prescriptions: [
            {
              prescriptionId: uuidv4(),
              metricKey: "repetition_count",
              targetValue: 10,
              canonicalUnit: "count",
            },
          ],
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

  return (
    <div className="flex h-full">
      {/* Main Canvas */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <input
            type="text"
            className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-hv-border focus:border-hv-primary focus:outline-none py-1"
            value={workout.title}
            onChange={(e) => setWorkout({ ...workout, title: e.target.value })}
          />
          <button className="bg-hv-primary text-white px-4 py-2 rounded-md hover:bg-hv-primary-hover font-medium">
            Publish
          </button>
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
                        className="bg-hv-surface-1 border border-hv-border rounded-lg p-4 flex gap-4"
                      >
                        <div
                          {...provided.dragHandleProps}
                          className="text-hv-text-muted hover:text-hv-text flex items-center justify-center cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-2">
                            {block.type === "EXERCISE" ? block.exerciseNameSnapshot : block.type}
                          </h3>
                          {block.type === "EXERCISE" && (
                            <div className="space-y-2">
                              {block.efforts.map((effort, eIdx) => (
                                <div key={effort.effortId} className="flex items-center gap-4 text-sm bg-hv-surface-2 p-2 rounded">
                                  <span className="w-6 text-hv-text-muted">{eIdx + 1}</span>
                                  <span className="w-24 text-hv-text-muted">{effort.effortType}</span>
                                  <div className="flex-1 flex gap-4">
                                    {effort.prescriptions.map((p) => (
                                      <div key={p.prescriptionId} className="flex gap-1">
                                        <span className="text-hv-text">{p.targetValue || p.minimumValue}</span>
                                        <span className="text-hv-text-muted">{p.canonicalUnit}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeBlock(block.blockId)}
                          className="text-hv-error hover:text-red-400 p-2 h-fit rounded"
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

        <button
          onClick={() => setIsExerciseDrawerOpen(true)}
          className="w-full border-2 border-dashed border-hv-border hover:border-hv-primary text-hv-text-muted hover:text-hv-primary rounded-lg p-4 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Add Exercise</span>
        </button>
      </div>

      {/* Exercise Drawer */}
      {isExerciseDrawerOpen && (
        <div className="w-80 border-l border-hv-border bg-hv-surface-1 h-full flex flex-col">
          <div className="p-4 border-b border-hv-border flex justify-between items-center">
            <h2 className="font-bold">Library</h2>
            <button onClick={() => setIsExerciseDrawerOpen(false)} className="text-hv-text-muted hover:text-hv-text">
              Close
            </button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto space-y-2">
            {exercisesData.map((ex) => (
              <button
                key={ex.exerciseId}
                onClick={() => addExercise(ex.exerciseId, ex.name)}
                className="w-full text-left p-3 rounded-md hover:bg-hv-surface-2 border border-transparent hover:border-hv-border transition-colors"
              >
                <div className="font-semibold">{ex.name}</div>
                <div className="text-xs text-hv-text-muted mt-1">{ex.category}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
