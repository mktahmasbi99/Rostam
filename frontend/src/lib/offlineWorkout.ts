import { api, ApiError } from "./api";
import { trackWrite } from "./restartSafety";
import type { SetPayload, Workout } from "./types";

interface WorkoutSnapshot {
  workout: Workout;
  timezone: string;
}

export interface PendingWorkoutSet {
  operationId: string;
  ledgerGeneration: string;
  workoutId: number;
  workoutName: string;
  entryId: number;
  exerciseName: string;
  payload: SetPayload & { occurredAt: string };
  timezone: string;
  error?: string;
}

export const supportsOfflineWorkout = typeof indexedDB !== "undefined" && typeof crypto.randomUUID === "function";

const listeners = new Set<() => void>();
let view = { snapshot: undefined as WorkoutSnapshot | undefined, pending: [] as PendingWorkoutSet[] };
let reading = 0;
let connection: Promise<IDBDatabase> | undefined;
let syncing: Promise<void> | undefined;
let syncRequested = false;
let snapshotRevision = 0;
const channel = typeof window.BroadcastChannel === "undefined" ? undefined : new window.BroadcastChannel("rostam-workout");

export function subscribeOfflineWorkout(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflineWorkout() { return view; }

function openDatabase(): Promise<IDBDatabase> {
  if (!supportsOfflineWorkout) return Promise.reject(new Error("Offline workout storage is unavailable."));
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("rostam-workout", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("activeWorkout");
      request.result.createObjectStore("pendingSets", { keyPath: "operationId" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      db.onclose = () => { connection = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export async function readOfflineWorkout(): Promise<void> {
  const revision = ++reading;
  const db = await openDatabase();
  const transaction = db.transaction(["activeWorkout", "pendingSets"]);
  const snapshot = transaction.objectStore("activeWorkout").get("active");
  const pending = transaction.objectStore("pendingSets").getAll();
  await finish(transaction);
  if (revision !== reading) return;
  view = { snapshot: snapshot.result, pending: pending.result };
  for (const listener of listeners) listener();
}

channel?.addEventListener("message", () => { void readOfflineWorkout().catch(() => {}); });

function finish(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Local save interrupted."));
  });
}

function notify() {
  channel?.postMessage(null);
  return readOfflineWorkout().catch(() => {});
}

export function cacheActiveWorkout(workout: Workout | null, timezone: string) {
  return storeSnapshot(workout, timezone, ++snapshotRevision);
}

export async function refreshActiveWorkout(ledgerGeneration: string, timezone: string) {
  const revision = ++snapshotRevision;
  const workout = await api.activeWorkout();
  if (!workout || workout.ledgerGeneration === ledgerGeneration) {
    await storeSnapshot(workout, timezone, revision);
  }
}

async function storeSnapshot(workout: Workout | null, timezone: string, revision: number): Promise<void> {
  const db = await openDatabase();
  if (revision !== snapshotRevision) return;
  const transaction = db.transaction("activeWorkout", "readwrite", { durability: "strict" });
  const store = transaction.objectStore("activeWorkout");
  if (workout?.ledgerGeneration && !workout.endedAt) {
    store.put({ workout, timezone } satisfies WorkoutSnapshot, "active");
  } else {
    store.delete("active");
  }
  await finish(transaction);
  await notify();
}

export async function savePendingSet(set: Omit<PendingWorkoutSet, "operationId">): Promise<void> {
  await trackWrite(async () => {
    try {
      const db = await openDatabase();
      const transaction = db.transaction("pendingSets", "readwrite", { durability: "strict" });
      transaction.objectStore("pendingSets").add({ ...set, operationId: crypto.randomUUID() });
      await finish(transaction);
    } catch {
      throw new Error("Could not save this set on this device. Your input is still open.");
    }
  }, false);
  await notify();
}

async function updatePendingSet(operationId: string, error?: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction("pendingSets", "readwrite", { durability: "strict" });
  const store = transaction.objectStore("pendingSets");
  if (error) {
    const request = store.get(operationId);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, error });
    };
  } else {
    store.delete(operationId);
  }
  await finish(transaction);
  await notify();
}

export function discardPendingSet(operationId: string) { return updatePendingSet(operationId); }

export function syncWorkoutSets(): Promise<void> {
  syncRequested = true;
  syncing ??= (async () => {
    while (syncRequested) {
      syncRequested = false;
      await readOfflineWorkout();
      for (const set of view.pending) {
        if (set.error) continue;
        try {
          const saved = await api.syncWorkoutSet(set.workoutId, set.entryId, {
            ...set.payload, operationId: set.operationId, ledgerGeneration: set.ledgerGeneration,
          });
          if (saved.operationId !== set.operationId) break;
        } catch (error) {
          if (!(error instanceof ApiError) || ![400, 404, 409, 410, 422].includes(error.status)) break;
          await updatePendingSet(set.operationId, error.message);
          continue;
        }
        await updatePendingSet(set.operationId);
      }
    }
  })().finally(() => { syncing = undefined; });
  return syncing;
}
