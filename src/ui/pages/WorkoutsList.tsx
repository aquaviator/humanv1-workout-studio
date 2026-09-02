import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { HumanIdentity } from "../../domain/identity";
import { Workout, Block, Effort, ExerciseBlock, SupersetBlock, CircuitBlock } from "../../domain/types";
import { draftRepository, DraftEnvelope } from "../../repositories/DraftRepository";
import { syncManager } from "../../repositories/SyncManager";
import { workoutLibraryRepository, WorkoutLibraryItem } from "../../repositories/WorkoutLibraryRepository";
import { v4 as uuidv4 } from "uuid";
import { Trash2, Copy, Edit2, RotateCcw, Search, Clock, SortAsc, Archive } from "lucide-react";
import { cn } from "../../lib/utils";

export default function WorkoutsList({ identity }: { identity: HumanIdentity }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<WorkoutLibraryItem[]>([]);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDiscipline, setFilterDiscipline] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"updatedAt" | "title" | "duration">("updatedAt");
  const [showArchived, setShowArchived] = useState(false);

  const loadData = async () => {
    try {
      const result = await workoutLibraryRepository.list(identity.humanUserId);
      setItems(result.items);
      setOffline(result.offline);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    void syncManager.syncDown(identity.humanUserId, ["workout"]).finally(loadData);
    const interval = setInterval(loadData, 5000);
    const refresh = () => void loadData();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    const unsubscribe = syncManager.subscribe(refresh);
    return () => { clearInterval(interval); window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); unsubscribe(); };
  }, [identity.humanUserId]);

  const handleDuplicate = async (workout: Workout) => {
    const newWorkoutId = uuidv4();
    
    // deeply duplicate with new stable IDs
    const duplicateBlock = (b: Block): Block => {
      const newBlock = JSON.parse(JSON.stringify(b)) as Block;
      newBlock.blockId = uuidv4();
      if (newBlock.type === "EXERCISE") {
        newBlock.efforts.forEach(e => {
          e.effortId = uuidv4();
          e.prescriptions.forEach(p => p.prescriptionId = uuidv4());
        });
      } else if (newBlock.type === "SUPERSET" || newBlock.type === "CIRCUIT") {
        newBlock.exercises = newBlock.exercises.map(ex => duplicateBlock(ex) as ExerciseBlock);
      }
      return newBlock;
    };

    const newWorkout: Workout = {
      ...workout,
      workoutId: newWorkoutId,
      title: `${workout.title} (Copy)`,
      blocks: workout.blocks.map(duplicateBlock)
    };
    await draftRepository.saveWorkoutDraft(identity.humanUserId, newWorkout);
    loadData();
  };

  const handleRename = async (envelope: DraftEnvelope<Workout>) => {
    const newTitle = prompt("New title:", envelope.payload.title);
    if (newTitle && newTitle.trim() !== "") {
      const updated = { ...envelope.payload, title: newTitle.trim() };
      await draftRepository.saveWorkoutDraft(identity.humanUserId, updated);
      loadData();
    }
  };

  const handleArchive = async (workoutId: string) => {
    await draftRepository.deleteWorkoutDraft(identity.humanUserId, workoutId);
    loadData();
  };

  const handleRestore = async (envelope: DraftEnvelope<Workout>) => {
    const updatedEnv = { ...envelope, deletedAt: null };
    // DraftRepository doesn't have a direct saveEnvelope, we just save the payload and it will bump revision
    await draftRepository.saveWorkoutDraft(identity.humanUserId, envelope.payload);
    loadData();
  };

  const filtered = items.filter(item => {
    if (item.draft?.deletedAt && !showArchived) return false;
    if (!item.draft?.deletedAt && showArchived) return false;
    if (filterDiscipline !== "ALL" && item.workout.discipline !== filterDiscipline) return false;
    if (search && !item.workout.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === "updatedAt") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (sortBy === "title") return a.workout.title.localeCompare(b.workout.title);
    if (sortBy === "duration") return (b.workout.estimatedDurationSeconds || 0) - (a.workout.estimatedDurationSeconds || 0);
    return 0;
  });

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Workouts</h1>
        <Link to="/workouts/new" className="bg-hv-primary text-white px-4 py-2 rounded-md hover:bg-hv-primary-hover font-medium">
          Create Workout
        </Link>
      </div>
      {offline && <div role="status" className="mb-4 rounded-md border border-hv-warning px-3 py-2 text-sm text-hv-warning">Offline — showing the last verified cloud status.</div>}
      {loadError && <div role="alert" className="mb-4 rounded-md border border-hv-error px-3 py-2 text-sm text-hv-error">Workout status could not be loaded. Retry required.</div>}

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-hv-text-muted" />
          <input 
            type="text" 
            placeholder="Search workouts..." 
            className="w-full bg-hv-surface-1 border border-hv-border rounded-md pl-9 pr-4 py-2 focus:outline-none focus:border-hv-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="bg-hv-surface-1 border border-hv-border rounded-md px-4 py-2 focus:outline-none"
          value={filterDiscipline}
          onChange={(e) => setFilterDiscipline(e.target.value)}
        >
          <option value="ALL">All Disciplines</option>
          <option value="STRENGTH">Strength</option>
          <option value="CARDIO">Cardio</option>
          <option value="HIIT">HIIT</option>
          <option value="CIRCUIT">Circuit</option>
          <option value="TABATA">Tabata</option>
          <option value="HYBRID">Hybrid</option>
          <option value="MOBILITY">Mobility</option>
        </select>
        <select 
          className="bg-hv-surface-1 border border-hv-border rounded-md px-4 py-2 focus:outline-none"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "updatedAt" | "title" | "duration")}
        >
          <option value="updatedAt">Last Updated</option>
          <option value="title">Title (A-Z)</option>
          <option value="duration">Estimated Duration</option>
        </select>
        <button 
          onClick={() => setShowArchived(!showArchived)}
          className={cn("px-4 py-2 rounded-md border", showArchived ? "bg-hv-surface-2 border-hv-border" : "bg-transparent border-hv-border hover:bg-hv-surface-2")}
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto">
        {filtered.map(item => {
          const workout = item.workout;
          const env = item.draft;
          const statusText = item.state === "DOWNLOADED" ? "Downloaded by Human Strength" :
            item.state === "SENT" ? "Sent to your apps" : item.state === "RETRY_REQUIRED" ? "Retry required" :
            item.state.charAt(0) + item.state.slice(1).toLowerCase();
          return (
            <div key={workout.workoutId} className="bg-hv-surface-1 border border-hv-border p-4 rounded-lg flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h2 
                  className="font-semibold cursor-pointer hover:text-hv-primary" 
                  onClick={() => env && !env.deletedAt && navigate(`/workouts/${workout.workoutId}`)}
                >
                  {workout.title}
                </h2>
                <div className="flex gap-2">
                  {env && !env.deletedAt && (
                    <>
                      <button onClick={() => handleRename(env)} className="text-hv-text-muted hover:text-hv-text" aria-label="Rename">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDuplicate(workout)} className="text-hv-text-muted hover:text-hv-text" aria-label="Duplicate">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleArchive(workout.workoutId)} className="text-hv-text-muted hover:text-hv-error" aria-label="Archive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {env?.deletedAt && (
                    <button onClick={() => handleRestore(env)} className="text-hv-text-muted hover:text-hv-primary" aria-label="Restore">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {item.latestVersion && <div className="mb-2 text-xs text-hv-text-muted">Latest published revision {item.latestVersion.revision} · {item.versions.length} immutable version{item.versions.length === 1 ? "" : "s"}</div>}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs bg-hv-surface-2 px-2 py-1 rounded text-hv-text-muted uppercase tracking-wider font-semibold">
                  {workout.discipline}
                </span>
                <span className="text-xs text-hv-text-muted flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {Math.round((workout.estimatedDurationSeconds || 0) / 60)} min
                </span>
              </div>
              <p className="text-sm text-hv-text-muted line-clamp-2 mt-auto mb-3">
                {workout.description || "No description provided."}
              </p>
              <div className="flex justify-between items-center mt-2 border-t border-hv-border pt-2 text-xs">
                <span className="text-hv-text-muted">
                  Updated {new Date(item.updatedAt).toLocaleDateString()}
                </span>
                <span className={cn(
                  "font-medium",
                  item.state === "DOWNLOADED" || item.state === "SENT" ? "text-hv-primary" :
                  item.state === "CONFLICT" || item.state === "RETRY_REQUIRED" ? "text-hv-error" :
                  item.state === "QUEUED" ? "text-hv-warning" : "text-hv-text-muted"
                )}>
                  {statusText}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-hv-text-muted">
          <Archive className="w-12 h-12 mb-4 opacity-20" />
          <p>No workouts found.</p>
        </div>
      )}
    </div>
  );
}
