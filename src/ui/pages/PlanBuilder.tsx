import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { format, addDays, startOfWeek } from "date-fns";
import { draftRepository } from "../../repositories/DraftRepository";
import { Workout } from "../../domain/types";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Dumbbell, Plus, Trash2, Undo2, Redo2 } from "lucide-react";
import { useHistory } from "../../lib/useHistory";
import { HumanIdentity } from "../../domain/identity";
import { Plan } from "../../domain/types";

export default function PlanBuilder({ identity }: { identity: HumanIdentity }) {
  const [workoutsData, setWorkoutsData] = React.useState<Workout[]>([]);
  React.useEffect(() => { draftRepository.listWorkoutDrafts(identity.humanUserId).then(setWorkoutsData); }, [identity.humanUserId]);
  const [planId] = useState(() => uuidv4());
  
  const initialPlan: Plan = {
    schemaVersion: "1",
    planId,
    title: "New Plan",
    description: "",
    weeks: [{
      weekId: uuidv4(),
      weekNumber: 1,
      label: "Week 1",
      placements: []
    }]
  };

  const { state: plan, set: setPlan, reset, undo, redo, canUndo, canRedo } = useHistory<Plan>(initialPlan);
  const [availableWorkouts] = useState(workoutsData);
  const [saveStatus, setSaveStatus] = useState<"Saved" | "Saving..." | "Unsaved">("Saved");
  const [isLoading, setIsLoading] = useState(true);
  
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  useEffect(() => {
    let mounted = true;
    draftRepository.listPlanDrafts(identity.humanUserId).then((drafts) => {
      if (!mounted) return;
      if (drafts.length > 0) {
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
      draftRepository.savePlanDraft(identity.humanUserId, plan).then(() => {
        setSaveStatus("Saved");
      });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [plan, identity.humanUserId, isLoading]);

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
        workoutVersionId: `${workoutId}_v1`,
        preferredMinuteOfDay: null,
        reminderEnabled: false,
        notes: ""
      };
      
      const updatedWeeks = [...plan.weeks];
      updatedWeeks[0] = {
        ...updatedWeeks[0],
        placements: [...updatedWeeks[0].placements, newPlacement]
      };
      
      setPlan({ ...plan, weeks: updatedWeeks });
    } else if (source.droppableId.startsWith("day-") && destination.droppableId.startsWith("day-")) {
      const sourceDay = parseInt(source.droppableId.replace("day-", ""));
      const destDay = parseInt(destination.droppableId.replace("day-", ""));
      
      const updatedWeeks = [...plan.weeks];
      const sourcePlacements = [...updatedWeeks[0].placements];
      
      const movedItemIndex = sourcePlacements.findIndex(p => p.placementId === result.draggableId);
      if (movedItemIndex >= 0) {
        const [movedItem] = sourcePlacements.splice(movedItemIndex, 1);
        movedItem.dayOfWeek = destDay;
        sourcePlacements.push(movedItem);
        
        updatedWeeks[0] = { ...updatedWeeks[0], placements: sourcePlacements };
        setPlan({ ...plan, weeks: updatedWeeks });
      }
    }
  };

  const removePlacement = (placementId: string) => {
    const updatedWeeks = [...plan.weeks];
    updatedWeeks[0] = {
      ...updatedWeeks[0],
      placements: updatedWeeks[0].placements.filter(p => p.placementId !== placementId)
    };
    setPlan({ ...plan, weeks: updatedWeeks });
  };
  
  const addWorkoutToDay = (workoutId: string, dayOfWeek: number) => {
    const newPlacement = {
      placementId: uuidv4(),
      dayOfWeek,
      workoutId,
      workoutVersionId: `${workoutId}_v1`,
      preferredMinuteOfDay: null,
      reminderEnabled: false,
      notes: ""
    };
    const updatedWeeks = [...plan.weeks];
    updatedWeeks[0] = {
      ...updatedWeeks[0],
      placements: [...updatedWeeks[0].placements, newPlacement]
    };
    setPlan({ ...plan, weeks: updatedWeeks });
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
          <button className="bg-hv-surface-2 text-hv-text-muted px-4 py-2 rounded-md font-medium cursor-not-allowed" disabled>
            Publish Plan
          </button>
        </div>
      </div>
      
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Calendar Grid */}
          <div className="flex-1 p-4 md:p-8 overflow-y-auto">
            <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
              {days.map((day, idx) => {
                const dayOfWeekNumber = day.getDay() === 0 ? 7 : day.getDay();
                const placements = plan.weeks[0].placements.filter(p => p.dayOfWeek === dayOfWeekNumber);
                
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
                            if (!workout) return null;
                            
                            return (
                              <Draggable key={p.placementId} draggableId={p.placementId} index={pIdx}>
                                {(provided) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className="bg-hv-bg border border-hv-border p-3 rounded-md text-sm group relative"
                                  >
                                    <div className="font-semibold mb-1 line-clamp-1 pr-6">{workout.title}</div>
                                    <div className="text-xs text-hv-text-muted">{workout.discipline}</div>
                                    <button 
                                      onClick={() => removePlacement(p.placementId)}
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
                            
                            {/* Mobile-friendly Add buttons when drag is hard */}
                            <div className="hidden group-hover:flex md:hidden gap-1">
                              <button onClick={() => addWorkoutToDay(workout.workoutId, 1)} className="text-xs bg-hv-surface-2 p-1 rounded" aria-label="Add to Monday">Mon</button>
                              <button onClick={() => addWorkoutToDay(workout.workoutId, 3)} className="text-xs bg-hv-surface-2 p-1 rounded" aria-label="Add to Wednesday">Wed</button>
                              <button onClick={() => addWorkoutToDay(workout.workoutId, 5)} className="text-xs bg-hv-surface-2 p-1 rounded" aria-label="Add to Friday">Fri</button>
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
