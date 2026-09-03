import { del, get, keys, set } from "idb-keyval";
import { collection, doc, getDocs, runTransaction } from "firebase/firestore";
import { db } from "../config/firebase";
import { Exercise, PrivateExercise } from "../domain/catalogue";
import { Effort, Plan, PlanPlacement, Workout } from "../domain/types";

type CloudDoc = Record<string, unknown>;
type Reader = (owner: string, collectionName: string) => Promise<CloudDoc[]>;
type Writer = (owner: string, collectionName: string, id: string, value: CloudDoc) => Promise<void>;
export interface CrossAppConflict { owner: string; collectionName: string; id: string; base: CloudDoc; studio: CloudDoc; app: CloudDoc; resolvedRevision?: number }
interface PendingWrite { owner: string; collectionName: string; id: string; value: CloudDoc; base: CloudDoc }

const PRIVATE_PREFIX = "private_";
const clientId = "WORKOUT_STUDIO";
const localKey = (owner: string, type: string, id: string) => `crossapp_${owner}_${type}_${id}`;
const pendingKey = (owner: string, collectionName: string, id: string) => `crossapp_pending_${owner}_${collectionName}_${id}`;
const conflictKey = (owner: string, collectionName: string, id: string) => `crossapp_conflict_${owner}_${collectionName}_${id}`;
const asNumber = (value: unknown, fallback = 0) => typeof value === "number" ? value : fallback;
const asString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asStrings = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const defaultRead: Reader = async (owner, collectionName) => {
  const snapshot = await getDocs(collection(db, "users", owner, collectionName));
  return snapshot.docs.map(item => ({ ...item.data(), __id: item.id }));
};

const defaultWrite: Writer = async (owner, collectionName, id, value) => {
  const ref = doc(db, "users", owner, collectionName, id);
  await runTransaction(db, async transaction => {
    const current = await transaction.get(ref);
    if (current.exists()) {
      const remote = current.data();
      if (remote.humanUserId !== owner) throw new Error("OWNERSHIP_CONFLICT");
      const remoteRevision = asNumber(remote.revision);
      const nextRevision = asNumber(value.revision);
      if (remoteRevision > nextRevision) throw new Error("REVISION_CONFLICT");
      if (remoteRevision === nextRevision && JSON.stringify(remote) !== JSON.stringify(value)) throw new Error("REVISION_COLLISION");
      if (remoteRevision === nextRevision) return;
    }
    transaction.set(ref, value);
  });
};

export function safeThreeWayMerge(base: CloudDoc, studio: CloudDoc, app: CloudDoc): CloudDoc {
  const merged: CloudDoc = { ...base };
  for (const key of new Set([...Object.keys(base), ...Object.keys(studio), ...Object.keys(app)])) {
    const before = JSON.stringify(base[key]); const studioValue = JSON.stringify(studio[key]); const appValue = JSON.stringify(app[key]);
    const studioChanged = studioValue !== before; const appChanged = appValue !== before;
    if (studioChanged && appChanged && studioValue !== appValue) throw new Error(`OVERLAPPING_CONFLICT:${key}`);
    merged[key] = studioChanged ? studio[key] : appChanged ? app[key] : base[key];
  }
  return merged;
}

export class CrossAppRepository {
  constructor(private read: Reader = defaultRead, private write: Writer = defaultWrite, private online = () => navigator.onLine) {}

  private async durableWrite(owner: string, collectionName: string, id: string, value: CloudDoc, base: CloudDoc = {}): Promise<boolean> {
    const pending: PendingWrite = { owner, collectionName, id, value, base };
    await set(pendingKey(owner, collectionName, id), pending);
    if (!this.online()) return false;
    try { await this.write(owner, collectionName, id, value); await del(pendingKey(owner, collectionName, id)); return true; }
    catch (error) {
      if (error instanceof Error && error.message.includes("REVISION")) {
        const app = (await this.read(owner, collectionName)).find(item => asString(item.globalId, asString(item.__id)) === id) || {};
        await set(conflictKey(owner, collectionName, id), { owner, collectionName, id, base, studio: value, app } satisfies CrossAppConflict);
      }
      throw error;
    }
  }

  async replayPending(owner: string): Promise<number> {
    if (!this.online()) return 0;
    let applied = 0;
    const prefix = `crossapp_pending_${owner}_`;
    for (const key of (await keys()).filter(key => typeof key === "string" && key.startsWith(prefix))) {
      const pending = await get<PendingWrite>(key as string); if (!pending || pending.owner !== owner) continue;
      await this.durableWrite(owner, pending.collectionName, pending.id, pending.value, pending.base); applied++;
    }
    return applied;
  }

  async listConflicts(owner: string): Promise<CrossAppConflict[]> {
    const prefix = `crossapp_conflict_${owner}_`; const result: CrossAppConflict[] = [];
    for (const key of (await keys()).filter(key => typeof key === "string" && key.startsWith(prefix))) { const item = await get<CrossAppConflict>(key as string); if (item?.owner === owner && !item.resolvedRevision) result.push(item); }
    return result;
  }

  async resolveConflict(conflict: CrossAppConflict, strategy: "KEEP_STUDIO" | "KEEP_APP" | "MERGE"): Promise<void> {
    const key = conflictKey(conflict.owner, conflict.collectionName, conflict.id);
    const stored = await get<CrossAppConflict>(key);
    if (stored?.resolvedRevision) return;
    const selected = strategy === "KEEP_STUDIO" ? conflict.studio : strategy === "KEEP_APP" ? conflict.app : safeThreeWayMerge(conflict.base, conflict.studio, conflict.app);
    const revision = Math.max(asNumber(conflict.studio.revision), asNumber(conflict.app.revision)) + 1;
    await this.write(conflict.owner, conflict.collectionName, conflict.id, { ...selected, globalId: conflict.id, humanUserId: conflict.owner, revision, updatedAt: Date.now() });
    await set(key, { ...conflict, resolvedRevision: revision }); await del(pendingKey(conflict.owner, conflict.collectionName, conflict.id));
  }

  private assertPrivateId(id: string) {
    if (!id.startsWith(PRIVATE_PREFIX) || !/^private_[a-zA-Z0-9_-]{8,}$/.test(id)) throw new Error("INVALID_PRIVATE_EXERCISE_ID");
  }

  private mapPrivate(owner: string, raw: CloudDoc): PrivateExercise | null {
    const id = asString(raw.globalId, asString(raw.__id));
    const documentId = asString(raw.__id, id);
    const sourceLocalId = asString(raw.id);
    const studioShape = (id.startsWith(PRIVATE_PREFIX) || id.startsWith("custom_")) && sourceLocalId === id;
    const androidShape = /^exercise_[a-zA-Z0-9_-]{8,}$/.test(id) && /^custom_[a-zA-Z0-9_-]{8,}$/.test(sourceLocalId);
    if (documentId !== id || (!studioShape && !androidShape) || raw.humanUserId !== owner || raw.isCustom !== true) return null;
    const deletedAt = typeof raw.deletedAt === "number" ? raw.deletedAt : null;
    const capabilities = raw.capabilities as CloudDoc | undefined;
    return {
      exerciseId: id,
      name: asString(raw.name),
      description: asString(raw.description) || undefined,
      category: asString(raw.category, "Other"),
      equipment: asStrings(raw.equipment),
      aliases: [],
      metricProfile: {
        primary: asStrings(capabilities?.primary), secondary: asStrings(capabilities?.secondary),
        optional: asStrings(capabilities?.optional), unsupported: asStrings(capabilities?.unsupported),
      },
      primaryMuscles: asStrings(raw.primaryMuscles), muscleArea: asStrings(raw.muscleArea),
      modalitySuitability: asStrings(raw.modalitySuitability), source: "PRIVATE",
      provenance: { ownerHumanUserId: owner, originApplication: asString(raw.originApplication, "HUMAN_STRENGTH"), revision: asNumber(raw.revision, 1), schemaVersion: asNumber(raw.schemaVersion, 1), archived: deletedAt !== null, sourceLocalId },
      createdAt: asNumber(raw.createdAt), updatedAt: asNumber(raw.updatedAt), deletedAt,
      originDeviceId: asString(raw.originDeviceId), syncState: deletedAt ? "Archived" : "Synced",
    };
  }

  async listPrivateExercises(owner: string, includeArchived = true): Promise<PrivateExercise[]> {
    const prefix = `crossapp_${owner}_exercise_`;
    const cached: PrivateExercise[] = [];
    for (const key of (await keys()).filter(key => typeof key === "string" && key.startsWith(prefix))) {
      const value = await get<PrivateExercise>(key as string); if (value) cached.push(value);
    }
    if (!this.online()) return cached.filter(item => includeArchived || !item.deletedAt);
    try {
      const remote = (await this.read(owner, "customExercises")).map(item => this.mapPrivate(owner, item)).filter((item): item is PrivateExercise => Boolean(item));
      for (const item of remote) await set(localKey(owner, "exercise", item.exerciseId), item);
      return remote.filter(item => includeArchived || !item.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
    } catch { return cached.map(item => ({ ...item, syncState: "Retry required" as const })).filter(item => includeArchived || !item.deletedAt); }
  }

  async savePrivateExercise(owner: string, input: Partial<PrivateExercise> & Pick<PrivateExercise, "name" | "category" | "metricProfile">): Promise<PrivateExercise> {
    const id = input.exerciseId || `${PRIVATE_PREFIX}${crypto.randomUUID().replaceAll("-", "")}`;
    const existing = await get<PrivateExercise>(localKey(owner, "exercise", id));
    const sourceLocalId = existing?.provenance.sourceLocalId || input.provenance?.sourceLocalId || id;
    const importedAndroidRecord = /^exercise_[a-zA-Z0-9_-]{8,}$/.test(id) && /^custom_[a-zA-Z0-9_-]{8,}$/.test(sourceLocalId) && (existing?.provenance.ownerHumanUserId || input.provenance?.ownerHumanUserId) === owner;
    if (!importedAndroidRecord) this.assertPrivateId(id);
    const now = Date.now();
    const value: PrivateExercise = {
      exerciseId: id, name: input.name.trim(), description: input.description?.trim(), category: input.category,
      equipment: input.equipment || [], aliases: [], metricProfile: input.metricProfile,
      primaryMuscles: input.primaryMuscles || [], muscleArea: input.muscleArea || [], modalitySuitability: input.modalitySuitability || [],
      source: "PRIVATE", provenance: { ownerHumanUserId: owner, originApplication: clientId, revision: (existing?.provenance.revision || input.provenance?.revision || 0) + 1, schemaVersion: 1, archived: false, sourceLocalId },
      createdAt: existing?.createdAt || now, updatedAt: now, deletedAt: null, originDeviceId: clientId,
      syncState: this.online() ? "Queued" : "Local draft",
    };
    if (!value.name) throw new Error("NAME_REQUIRED");
    await set(localKey(owner, "exercise", id), value);
    const cloud: CloudDoc = {
      schemaVersion: 1, globalId: id, id: sourceLocalId, humanUserId: owner, name: value.name, description: value.description || null,
      category: value.category, equipment: value.equipment, primaryMuscles: value.primaryMuscles || [], muscleArea: value.muscleArea || [],
      modalitySuitability: value.modalitySuitability || [], capabilities: value.metricProfile, isCustom: true,
      createdAt: value.createdAt, updatedAt: value.updatedAt, revision: value.provenance.revision, deletedAt: null,
      originApplication: clientId, originDeviceId: clientId, lastSyncedAt: now,
    };
    if (this.online()) {
      try { await this.durableWrite(owner, "customExercises", id, cloud, existing ? { ...cloud, revision: existing.provenance.revision, updatedAt: existing.updatedAt } : {}); value.syncState = "Synced"; }
      catch (error) { value.syncState = error instanceof Error && error.message.includes("REVISION") ? "Conflict" : "Retry required"; }
      await set(localKey(owner, "exercise", id), value);
    } else await this.durableWrite(owner, "customExercises", id, cloud);
    return value;
  }

  async setPrivateExerciseArchived(owner: string, id: string, archived: boolean): Promise<PrivateExercise> {
    const current = (await this.listPrivateExercises(owner, true)).find(item => item.exerciseId === id);
    if (!current) throw new Error("PRIVATE_EXERCISE_NOT_FOUND");
    const sourceLocalId = current.provenance.sourceLocalId || id;
    const importedAndroidRecord = /^exercise_[a-zA-Z0-9_-]{8,}$/.test(id) && /^custom_[a-zA-Z0-9_-]{8,}$/.test(sourceLocalId) && current.provenance.ownerHumanUserId === owner;
    if (!importedAndroidRecord) this.assertPrivateId(id);
    const deletedAt = archived ? Date.now() : null;
    const saved: PrivateExercise = { ...current, updatedAt: Date.now(), deletedAt, provenance: { ...current.provenance, revision: current.provenance.revision + 1, archived }, syncState: archived ? "Archived" : (this.online() ? "Queued" : "Local draft") };
    await set(localKey(owner, "exercise", id), saved);
    const cloud = { schemaVersion: 1, globalId: id, id: sourceLocalId, humanUserId: owner, name: saved.name, description: saved.description || null, category: saved.category, equipment: saved.equipment, primaryMuscles: saved.primaryMuscles || [], muscleArea: saved.muscleArea || [], modalitySuitability: saved.modalitySuitability || [], capabilities: saved.metricProfile, isCustom: true, createdAt: saved.createdAt, updatedAt: saved.updatedAt, revision: saved.provenance.revision, deletedAt, originApplication: clientId, originDeviceId: clientId, lastSyncedAt: Date.now() };
    await this.durableWrite(owner, "customExercises", id, cloud);
    return saved;
  }

  async listAppWorkouts(owner: string): Promise<Workout[]> {
    if (!this.online()) return [];
    const [templates, exercises, sets] = await Promise.all([this.read(owner, "templates"), this.read(owner, "templateExercises"), this.read(owner, "templateSets")]);
    return templates.filter(t => t.humanUserId === owner && t.deletedAt == null).map(template => {
      const templateId = asString(template.globalId, asString(template.__id));
      const children = exercises.filter(item => item.humanUserId === owner && item.templateGlobalId === templateId && item.deletedAt == null).sort((a, b) => asNumber(a.position) - asNumber(b.position));
      return {
        schemaVersion: "humanv1.workout/1", workoutId: templateId, title: asString(template.name, "Workout"), discipline: "STRENGTH" as const,
        catalogueReleaseId: "cross_app", tags: ["HUMAN_STRENGTH"],
        blocks: children.map(child => {
          const childId = asString(child.globalId, asString(child.__id));
          const childSets = sets.filter(item => item.humanUserId === owner && item.templateExerciseGlobalId === childId && item.deletedAt == null).sort((a, b) => asNumber(a.position) - asNumber(b.position));
          const efforts: Effort[] = childSets.map((item, index) => ({ effortId: asString(item.globalId, `${childId}_${index}`), effortType: (asString(item.setType, "WORKING") as Effort["effortType"]), restAfterSeconds: asNumber(child.restSeconds, 90), notes: asString(item.notes) || undefined, prescriptions: [
            ...(typeof item.targetRepsMin === "number" ? [{ prescriptionId: `${asString(item.globalId)}_reps`, metricKey: "repetitions", minimumValue: asNumber(item.targetRepsMin), maximumValue: asNumber(item.targetRepsMax, asNumber(item.targetRepsMin)), canonicalUnit: "count" }] : []),
            ...(typeof item.targetWeight === "number" ? [{ prescriptionId: `${asString(item.globalId)}_load`, metricKey: "external_load", targetValue: asNumber(item.targetWeight), canonicalUnit: "kg" }] : []),
            ...(typeof item.targetDurationSeconds === "number" ? [{ prescriptionId: `${asString(item.globalId)}_duration`, metricKey: "duration", targetValue: asNumber(item.targetDurationSeconds), canonicalUnit: "s" }] : []),
            ...(typeof item.targetDistance === "number" ? [{ prescriptionId: `${asString(item.globalId)}_distance`, metricKey: "distance", targetValue: asNumber(item.targetDistance), canonicalUnit: "m" }] : []),
          ] }));
          return { blockId: childId, type: "EXERCISE" as const, exerciseId: asString(child.exerciseId), exerciseNameSnapshot: asString((child.extensions as CloudDoc)?.exerciseNameSnapshot, asString(child.exerciseId)), notes: asString(child.notes) || undefined, efforts: efforts.length ? efforts : [{ effortId: `${childId}_open`, effortType: "OPEN", prescriptions: [] }] };
        }),
      };
    });
  }

  async saveAppWorkout(owner: string, workout: Workout): Promise<void> {
    const now = Date.now();
    const existing = this.online() ? (await this.read(owner, "templates")).find(item => item.globalId === workout.workoutId) : undefined;
    const revision = asNumber(existing?.revision) + 1 || 1;
    const exerciseBlocks = workout.blocks.flatMap(block => block.type === "EXERCISE" ? [block] : block.type === "SUPERSET" || block.type === "CIRCUIT" ? block.exercises : []);
    const createdAt = asNumber(existing?.createdAt, now);
    await this.durableWrite(owner, "templates", workout.workoutId, { schemaVersion: 1, globalId: workout.workoutId, name: workout.title, exerciseIdsJson: JSON.stringify(exerciseBlocks.map(block => block.exerciseId)), humanUserId: owner, createdAt, updatedAt: now, revision, deletedAt: null, originDeviceId: clientId, originApplication: clientId, extensions: { canonicalWorkout: workout } }, existing || {});
    for (const [position, block] of exerciseBlocks.entries()) {
      const childId = block.blockId;
      await this.durableWrite(owner, "templateExercises", childId, { schemaVersion: 1, globalId: childId, templateId: 0, templateGlobalId: workout.workoutId, exerciseId: block.exerciseId, position, restSeconds: block.efforts[0]?.restAfterSeconds ?? 90, notes: block.notes ?? null, supersetGroupId: null, humanUserId: owner, createdAt, updatedAt: now, revision, deletedAt: null, originDeviceId: clientId, originApplication: clientId, extensions: { exerciseNameSnapshot: block.exerciseNameSnapshot } });
      for (const [setPosition, effort] of block.efforts.entries()) {
        const setId = effort.effortId;
        const metric = (key: string) => effort.prescriptions.find(item => item.metricKey === key);
        await this.durableWrite(owner, "templateSets", setId, { schemaVersion: 1, globalId: setId, templateExerciseId: 0, templateExerciseGlobalId: childId, position: setPosition + 1, setType: effort.effortType, targetRepsMin: metric("repetitions")?.minimumValue ?? metric("repetitions")?.targetValue ?? null, targetRepsMax: metric("repetitions")?.maximumValue ?? metric("repetitions")?.targetValue ?? null, targetWeight: metric("external_load")?.targetValue ?? null, targetRpe: metric("rpe")?.targetValue ?? null, targetDurationSeconds: metric("duration")?.targetValue ?? null, targetDistance: metric("distance")?.targetValue ?? null, tempo: metric("tempo")?.textValue ?? null, notes: effort.notes ?? null, humanUserId: owner, createdAt, updatedAt: now, revision, deletedAt: null, originDeviceId: clientId, originApplication: clientId });
      }
    }
  }

  async listAppPlans(owner: string): Promise<Plan[]> {
    if (!this.online()) return [];
    const [plans, occurrences] = await Promise.all([this.read(owner, "trainingPlans"), this.read(owner, "plannedWorkouts")]);
    return plans.filter(p => p.humanUserId === owner && p.deletedAt == null).map(raw => {
      const id = asString(raw.globalId, asString(raw.__id));
      const linked = occurrences.filter(item => item.humanUserId === owner && item.seriesId === id && item.deletedAt == null);
      const placements: PlanPlacement[] = linked.map(item => ({ placementId: asString(item.globalId, asString(item.__id)), dayOfWeek: ((asNumber(item.scheduledEpochDay) + 3) % 7) + 1, workoutId: asString(item.templateGlobalId), workoutVersionId: asString((item.extensions as CloudDoc)?.workoutVersionId, `editable:${asString(item.templateGlobalId)}`), preferredMinuteOfDay: typeof item.preferredMinuteOfDay === "number" ? item.preferredMinuteOfDay : null, reminderEnabled: item.reminderEnabled === true, notes: asString((item.extensions as CloudDoc)?.notes) }));
      return { schemaVersion: "humanv1.plan/1", planId: id, title: asString(raw.routineName, "Plan"), description: "Synced from Human Strength", weeks: [{ weekId: `${id}_week_1`, weekNumber: 1, label: "Schedule", placements }] };
    });
  }

  async saveAppPlan(owner: string, plan: Plan): Promise<void> {
    const now = Date.now();
    const existing = this.online() ? (await this.read(owner, "trainingPlans")).find(item => item.globalId === plan.planId) : undefined;
    const revision = asNumber(existing?.revision) + 1 || 1;
    const placements = plan.weeks.flatMap(week => week.placements);
    const first = placements[0];
    await this.durableWrite(owner, "trainingPlans", plan.planId, { schemaVersion: 1, globalId: plan.planId, humanUserId: owner, templateGlobalId: first?.workoutId || "", routineName: plan.title, firstEpochDay: Math.floor(Date.now() / 86400000), preferredMinuteOfDay: first?.preferredMinuteOfDay ?? null, weekdaysMask: placements.reduce((mask, item) => mask | (1 << Math.max(0, item.dayOfWeek - 1)), 0), recurrenceEndEpochDay: null, createdAt: asNumber(existing?.createdAt, now), updatedAt: now, revision, deletedAt: null, originDeviceId: clientId, originApplication: clientId, extensions: { canonicalPlan: plan } }, existing || {});
    for (const [weekIndex, week] of plan.weeks.entries()) for (const placement of week.placements) {
      const scheduledEpochDay = Math.floor(Date.now() / 86400000) + weekIndex * 7 + Math.max(0, placement.dayOfWeek - 1);
      await this.durableWrite(owner, "plannedWorkouts", placement.placementId, { schemaVersion: 1, globalId: placement.placementId, humanUserId: owner, seriesId: plan.planId, templateGlobalId: placement.workoutId, routineName: plan.title, scheduledEpochDay, originalEpochDay: scheduledEpochDay, preferredMinuteOfDay: placement.preferredMinuteOfDay, status: "PLANNED", completedAt: null, linkedSessionId: null, reminderEnabled: placement.reminderEnabled, detachedFromSeries: false, createdAt: now, updatedAt: now, revision, deletedAt: null, originDeviceId: clientId, originApplication: clientId, extensions: { workoutVersionId: placement.workoutVersionId, notes: placement.notes } });
    }
  }
}

export const crossAppRepository = new CrossAppRepository();
export const markCatalogueSource = (exercise: Exercise): Exercise => ({ ...exercise, source: "HUMANV1_CATALOGUE" });
