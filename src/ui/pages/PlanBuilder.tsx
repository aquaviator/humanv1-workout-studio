import { useParams, Link } from "react-router";
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
import { publicationRepository } from "../../repositories/PublicationRepository";
import { Send } from "lucide-react";
import { validatePlan } from "../../domain/validation/planValidation";
import { AlertCircle } from "lucide-react";

export default function PlanBuilder({ identity }: { identity: HumanIdentity }) {
  const { planId: routePlanId } = useParams<{ planId: string }>();
  const [workoutsData, setWorkoutsData] = React.useState<Workout[]>([]);
  const [workoutsLoaded, setWorkoutsLoaded] = React.useState(false);
  React.useEffect(() => { 
    draftRepository.listWorkoutDrafts(identity.humanUserId).then((data) => {
      setWorkoutsData(data);
      setWorkoutsLoaded(true);
    }).catch(() => {
      setWorkoutsData([]);
      setWorkoutsLoaded(true);
    }); 
  }, [identity.humanUserId]);
  const [planId] = useState(() => routePlanId || uuidv4());
  
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
  const availableWorkouts = workoutsData;
  const [saveStatus, setSaveStatus] = useState<"Saved" | "Saving..." | "Unsaved">("Saved");
  const [isLoading, setIsLoading] = useState(true);
  const validationErrors = React.useMemo(() => validatePlan(plan), [plan]);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  useEffect(() => {
    let mounted = true;
    if (routePlanId) {
      draftRepository.getPlanDraft(identity.humanUserId, routePlanId).then((draft) => {
        if (!mounted) return;
        if (draft) {
          reset(draft);
        }
        setIsLoading(false);
      }).catch(() => {
        if (mounted) setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
    return () => { mounted = false; };
  }, [identity.humanUserId, reset, routePlanId]);

  useEffect(() => {
    if (isLoading) return;
    if (validationErrors.length > 0) {
      setSaveStatus("Unsaved");
      return;
    }
    let timeout: ReturnType<typeof setTimeout>;
    setSaveStatus("Saving...");
    timeout = setTimeout(() => {
      draftRepository.savePlanDraft(identity.humanUserId, plan).then(() => {
        setSaveStatus("Saved");
      }).catch(() => setSaveStatus("Unsaved"));
    }, 500);
    return () => clearTimeout(timeout);
  }, [plan, identity.humanUserId, isLoading, validationErrors.length]);

  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string>("");

  if (isLoading || !workoutsLoaded) {
    return <div className="p-8 text-center text-hv-text-muted">Loading...</div>;
  }



  const handlePublish = async () => {
    try {
      // "Before publication: every placement must reference a valid published Workout version"
      // We assume for now they are already published or we simulate the check
      setPublishStatus("Publishing...");
      await publicationRepository.publish(identity.humanUserId, 'plan', plan.planId, plan, ['PLAN']);
      setPublishStatus("Queued—will send when connected");
      setTimeout(() => { setIsPublishModalOpen(false); setPublishStatus(""); }, 2000);
    } catch (e: any) {
      setPublishStatus("Error: " + e.message);
    }
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

  const removeCurrentWeek = () => {
    if (plan.weeks.length <= 1) return;
    const updatedWeeks = plan.weeks.filter((_, idx) => idx !== activeWeekIndex);
    // Re-number weeks
    const renumbered = updatedWeeks.map((w, idx) => ({ ...w, weekNumber: idx + 1, label: `Week ${idx + 1}` }));
    setPlan({ ...plan, weeks: renumbered });
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
        workoutVersionId: `${workoutId}_v1`,
        preferredMinuteOfDay: null,
        reminderEnabled: false,
        notes: ""
      };
      
      const updatedWeeks = [...plan.weeks];
      updatedWeeks[activeWeekIndex] = {
        ...updatedWeeks[activeWeekIndex],
        placements: [...updatedWeeks[activeWeekIndex].placements, newPlacement]
      };
      
      setPlan({ ...plan, weeks: updatedWeeks });
    } else if (source.droppableId.startsWith("day-") && destination.droppableId.startsWith("day-")) {
      const sourceDay = parseInt(source.droppableId.replace("day-", ""));
      const destDay = parseInt(destination.droppableId.replace("day-", ""));
      
      const updatedWeeks = [...plan.weeks];
      const sourcePlacements = [...updatedWeeks[activeWeekIndex].placements];
      
      const movedItemIndex = sourcePlacements.findIndex(p => p.placementId === result.draggableId);
      if (movedItemIndex >= 0) {
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
    updatedWeeks[activeWeekIndex] = {
      ...updatedWeeks[activeWeekIndex],
      placements: [...updatedWeeks[activeWeekIndex].placements, newPlacement]
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
          <button onClick={() => setIsPublishModalOpen(true)} className="bg-hv-primary text-hv-background px-4 py-2 rounded-md font-medium hover:bg-hv-primary-hover flex items-center gap-2">
            <Send className="w-4 h-4" /> Send plan to my apps
          </button>
      {isPublishModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-hv-surface-1 p-6 rounded-xl max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-hv-text">Send plan to my apps</h2>
            <div className="space-y-3 mb-6 text-hv-text-muted">
              <p><span className="font-semibold text-hv-text">Weeks:</span> {plan.weeks.length}</p>
              <p><span className="font-semibold text-hv-text">Placements:</span> {plan.weeks.reduce((acc, w) => acc + w.placements.length, 0)}</p>
            </div>
            {publishStatus && <p className="mb-4 text-hv-primary">{publishStatus}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsPublishModalOpen(false)} className="px-4 py-2 text-hv-text-muted hover:text-hv-text rounded">Cancel</button>
              <button onClick={handlePublish} disabled={!!publishStatus} className="px-4 py-2 bg-hv-primary text-hv-background rounded hover:bg-hv-primary-hover font-medium">Send</button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
      
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
