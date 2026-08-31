import React from 'react';
import { Workout, Block, ExerciseBlock, CircuitBlock, SupersetBlock, RestBlock } from "../../domain/types";
import { Exercise } from "../../domain/catalogue";

export function AthletePreview({ workout, catalogue }: { workout: Workout; catalogue: Exercise[] }) {
  let stepCounter = 1;

  const renderPrescriptions = (efforts: any[]) => {
    return efforts.map((effort, idx) => (
      <div key={effort.effortId} className="flex gap-4 text-sm text-hv-text">
        <span className="w-6 text-hv-text-muted font-mono">{idx + 1}</span>
        <span className="w-20 text-hv-text-muted">{effort.effortType}</span>
        <div className="flex gap-4 flex-wrap">
          {effort.prescriptions.map((p: any) => (
            <span key={p.prescriptionId}>
              {p.targetValue ?? p.minimumValue ?? p.textValue ?? "-"} {p.canonicalUnit}
            </span>
          ))}
        </div>
      </div>
    ));
  };

  const renderExercise = (ex: ExerciseBlock) => (
    <div key={ex.blockId} className="pl-4 border-l-2 border-hv-border py-2 space-y-2">
      <div className="font-semibold text-lg">{ex.exerciseNameSnapshot}</div>
      {ex.notes && <div className="text-sm italic text-hv-text-muted">{ex.notes}</div>}
      <div className="space-y-1 bg-hv-surface-1 p-2 rounded">
        {renderPrescriptions(ex.efforts)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-8">
      <div className="mb-8 border-b border-hv-border pb-4">
        <h2 className="text-3xl font-bold">{workout.title}</h2>
        <div className="text-hv-text-muted text-sm mt-2">Discipline: {workout.discipline}</div>
      </div>

      {workout.blocks.map((block, i) => {
        const stepNum = stepCounter++;
        return (
          <div key={block.blockId} className="flex gap-4 items-start">
            <div className="w-8 h-8 rounded-full bg-hv-surface-2 flex items-center justify-center font-bold text-hv-text shrink-0 mt-1">
              {stepNum}
            </div>
            <div className="flex-1 space-y-2">
              {block.type === "EXERCISE" && renderExercise(block)}
              
              {block.type === "SUPERSET" && (
                <div className="space-y-4">
                  <div className="font-bold text-xl text-hv-primary">Superset</div>
                  {block.notes && <div className="text-sm italic text-hv-text-muted">{block.notes}</div>}
                  <div className="space-y-4">
                    {block.exercises.map(renderExercise)}
                  </div>
                </div>
              )}

              {block.type === "CIRCUIT" && (
                <div className="space-y-4">
                  <div className="font-bold text-xl text-hv-primary">Circuit &times; {block.rounds} Rounds</div>
                  {block.notes && <div className="text-sm italic text-hv-text-muted">{block.notes}</div>}
                  <div className="space-y-4">
                    {block.exercises.map(renderExercise)}
                  </div>
                </div>
              )}

              {block.type === "REST" && (
                <div className="py-2 text-hv-text-muted flex items-center gap-2">
                  <span className="font-semibold">Rest</span>
                  <span>{block.durationSeconds} seconds</span>
                  {block.recoveryType !== "PASSIVE" && <span className="text-xs border border-hv-border px-1 rounded">{block.recoveryType}</span>}
                </div>
              )}

              {block.type === "NOTE" && (
                <div className="bg-hv-surface-2 p-3 rounded-lg border-l-4 border-hv-primary italic text-sm">
                  {block.text}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
