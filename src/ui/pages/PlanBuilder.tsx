import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { format, addDays, startOfWeek } from "date-fns";
import plansData from "../../fixtures/plans.json";
import workoutsData from "../../fixtures/workouts.json";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Dumbbell } from "lucide-react";

export default function PlanBuilder() {
  const [plan, setPlan] = useState(plansData[0]);
  const [availableWorkouts] = useState(workoutsData);
  
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const onDragEnd = (result: DropResult) => {
    // Handle drop logic to assign workouts to days
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-8 pb-4 flex justify-between items-center border-b border-hv-border">
        <div>
          <input
            type="text"
            className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-hv-border focus:border-hv-primary focus:outline-none py-1"
            value={plan.title}
            onChange={(e) => setPlan({ ...plan, title: e.target.value })}
          />
          <p className="text-hv-text-muted mt-1">{plan.description}</p>
        </div>
        <button className="bg-hv-primary text-white px-4 py-2 rounded-md hover:bg-hv-primary-hover font-medium">
          Publish Plan
        </button>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar Grid */}
        <div className="flex-1 p-8 overflow-y-auto">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {days.map((day, idx) => {
                const dayOfWeekNumber = day.getDay() === 0 ? 7 : day.getDay();
                // Just showing week 1 for simplicity in this fixture builder
                const placements = plan.weeks[0].placements.filter(p => p.dayOfWeek === dayOfWeekNumber);
                
                return (
                  <div key={day.toISOString()} className="flex-1 min-w-[200px] flex flex-col bg-hv-surface-1 border border-hv-border rounded-lg overflow-hidden">
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
                                    className="bg-hv-bg border border-hv-border p-3 rounded-md text-sm"
                                  >
                                    <div className="font-semibold mb-1 line-clamp-1">{workout.title}</div>
                                    <div className="text-xs text-hv-text-muted">{workout.discipline}</div>
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
          </DragDropContext>
        </div>
        
        {/* Workout Library Sidebar */}
        <div className="w-80 border-l border-hv-border bg-hv-surface-1 p-4 flex flex-col">
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
                          {...provided.dragHandleProps}
                          className="bg-hv-bg border border-hv-border p-3 rounded-md mb-2 cursor-grab flex items-center gap-3"
                        >
                          <Dumbbell className="w-4 h-4 text-hv-text-muted" />
                          <div>
                            <div className="font-semibold text-sm line-clamp-1">{workout.title}</div>
                            <div className="text-xs text-hv-text-muted">{workout.discipline}</div>
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
    </div>
  );
}
