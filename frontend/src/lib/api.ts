import type { Activity, ActivityEntry, ActivityNotePage, Backup, BackupSettings, BodyMeasurement, BodyMeasurementPage, BodyMeasurementPayload, Config, DailyNotePage, DailyPhoto, DayData, Exercise, ExerciseCreatePayload, ExerciseHistoryPage, ExerciseRecommendations, ExerciseUpdatePayload, MeasurementTrends, PhotoPage, Profile, ProfilePayload, RestoreResult, Rotation, RotationRecommendation, SetPayload } from "./types";
import { trackWrite } from "./restartSafety";
import { reportServerReachability, reportUncertainWrite, requireReachableServer, ServerConnectionError } from "./connectivity";

async function request<T>(path: string, init?: RequestInit, options: { clearDraftOnSuccess?: boolean } = {}): Promise<T> {
  const isWrite = Boolean(init?.method && !["GET", "HEAD"].includes(init.method.toUpperCase()));
  if (isWrite) requireReachableServer();
  const operation = () => fetch(path, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
    cache: "no-store",
  });
  let response: Response;
  try {
    response = isWrite
    ? await trackWrite(operation, options.clearDraftOnSuccess !== false)
    : await operation();
    reportServerReachability("reachable");
  } catch (caught) {
    if (init?.signal?.aborted) throw caught;
    if (!(caught instanceof TypeError)) throw caught;
    reportServerReachability("disconnected");
    if (isWrite) {
      reportUncertainWrite();
      throw new ServerConnectionError("Connection lost while saving. The change may have reached Rostam; reconnect and refresh the data before deciding whether to retry.");
    }
    throw new ServerConnectionError("Could not reach Rostam. Check the server connection and retry.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  rotations: (status: "active" | "archived" | "all" = "active") => request<Rotation[]>(`/api/rotations?status=${status}`),
  createRotation: (name: string) => request<Rotation>("/api/rotations", json("POST", { name })),
  renameRotation: (id: number, name: string) => request<Rotation>(`/api/rotations/${id}`, json("PATCH", { name })),
  deleteRotation: (id: number) => request<void>(`/api/rotations/${id}`, { method: "DELETE" }),
  archiveRotation: (id: number) => request<Rotation>(`/api/rotations/${id}/archive`, { method: "POST" }),
  restoreRotation: (id: number) => request<Rotation>(`/api/rotations/${id}/restore`, { method: "POST" }),
  setRotationMembers: (id: number, exerciseIds: number[]) => request<Rotation>(`/api/rotations/${id}/members`, json("PUT", { exerciseIds })),
  activateRotation: (id: number, firstPosition: number) => request<Rotation>(`/api/rotations/${id}/activate`, json("POST", { firstPosition })),
  rotationRecommendations: (days: number) => request<RotationRecommendation[]>(`/api/rotation-recommendations?days=${days}`),
  deactivateRotation: (id: number) => request<Rotation>(`/api/rotations/${id}/deactivate`, { method: "POST" }),
  skipRotation: (id: number) => request<Rotation>(`/api/rotations/${id}/skip-today`, { method: "POST" }),
  undoRotationSkip: (id: number) => request<Rotation>(`/api/rotations/${id}/skip-today`, { method: "DELETE" }),
  config: () => request<Config>("/api/config"),
  profile: () => request<Profile>("/api/profile"),
  updateProfile: (payload: ProfilePayload) => request<Profile>("/api/profile", json("PUT", payload)),
  bodyMeasurements: (options: { beforeDate?: string; beforeId?: number; limit?: number } = {}) => {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
    return request<BodyMeasurementPage>(`/api/body-measurements?${params}`);
  },
  bodyMeasurementTrends: () => request<MeasurementTrends>("/api/body-measurements/trends"),
  createBodyMeasurement: (payload: BodyMeasurementPayload) => request<BodyMeasurement>("/api/body-measurements", json("POST", payload)),
  updateBodyMeasurement: (id: number, payload: BodyMeasurementPayload) => request<BodyMeasurement>(`/api/body-measurements/${id}`, json("PATCH", payload)),
  deleteBodyMeasurement: (id: number) => request<void>(`/api/body-measurements/${id}`, { method: "DELETE" }),
  day: (day: string, signal?: AbortSignal) =>
    request<DayData>(`/api/days/${day}`, { signal }),
  activities: (status: "active" | "archived" = "active") => request<Activity[]>(`/api/activities?status=${status}`),
  createActivity: (name: string) => request<Activity>("/api/activities", json("POST", { name })),
  updateActivityDefinition: (id: number, name: string) => request<Activity>(`/api/activities/${id}`, json("PATCH", { name })),
  archiveActivity: (id: number) => request<Activity>(`/api/activities/${id}/archive`, { method: "POST" }),
  restoreActivity: (id: number) => request<Activity>(`/api/activities/${id}/restore`, { method: "POST" }),
  deleteActivityDefinition: (id: number, confirmation: string) => request<void>(`/api/activities/${id}`, json("DELETE", { confirmation })),
  startActivity: (id: number, startedAt: string) => request<ActivityEntry>(`/api/activities/${id}/entries`, json("POST", { startedAt })),
  finishActivity: (id: number, startedAt: string, endedAt: string, note: string) => request<ActivityEntry>(`/api/activity-entries/${id}`, json("PATCH", { startedAt, endedAt, note })),
  updateActivity: (id: number, startedAt: string, endedAt: string, note: string) => request<ActivityEntry>(`/api/activity-entries/${id}`, json("PUT", { startedAt, endedAt, note })),
  updateActivityNote: (id: number, note: string) => request<ActivityEntry>(`/api/activity-entries/${id}/note`, json("PUT", { note })),
  deleteActivity: (id: number) => request<void>(`/api/activity-entries/${id}`, { method: "DELETE" }),
  activityNotes: (options: { beforeStartedAt?: string; beforeId?: number; limit?: number } = {}) => {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
    return request<ActivityNotePage>(`/api/activity-notes?${params}`);
  },
  calendar: (month: string, signal?: AbortSignal) =>
    request<{ month: string; activeDates: string[] }>(`/api/calendar/${month}`, { signal }),
  exerciseHistory: (id: number, options: { beforeDate?: string; limit?: number } = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (options.beforeDate) params.set("beforeDate", options.beforeDate);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    return request<ExerciseHistoryPage>(`/api/exercises/${id}/history?${params}`, { signal });
  },
  exercises: (status = "active", query = "", measurementType = "", signal?: AbortSignal) => {
    const params = new URLSearchParams({ status, query });
    if (measurementType) params.set("measurementType", measurementType);
    return request<Exercise[]>(`/api/exercises?${params}`, { signal });
  },
  exerciseRecommendations: (day: string, options: { query?: string; measurementType?: string; muscleGroup?: string; muscleRole?: string; includePaused?: boolean; sort?: string } = {}) => {
    const params = new URLSearchParams({ day });
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== "" && value !== false) params.set(key, String(value));
    });
    return request<ExerciseRecommendations>(`/api/exercise-recommendations?${params}`);
  },
  createExercise: (payload: ExerciseCreatePayload) =>
    request<Exercise>("/api/exercises", json("POST", payload)),
  updateExercise: (id: number, payload: ExerciseUpdatePayload) =>
    request<Exercise>(`/api/exercises/${id}`, json("PATCH", payload)),
  uploadExerciseImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ imageKey: string }>("/api/exercise-images", { method: "POST", body: form }, { clearDraftOnSuccess: false });
  },
  updateRecommendationPause: (id: number, period: "week" | "month" | "six_months" | "year" | "forever" | "resume") =>
    request<Exercise>(`/api/exercises/${id}/recommendation-pause`, json("PUT", { period })),
  updateExerciseNote: (id: number, body: string) =>
    request<Exercise>(`/api/exercises/${id}/note`, json("PUT", { body })),
  updateDailyNote: (day: string, body: string) => request<{ date: string; dailyNote: string | null }>(`/api/days/${day}/note`, json("PUT", { body })),
  deleteDailyNote: (day: string) => request<void>(`/api/days/${day}/note`, { method: "DELETE" }),
  dailyNotes: (options: { beforeDate?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
    return request<DailyNotePage>(`/api/notes?${params}`);
  },
  dayPhotos: (day: string, signal?: AbortSignal) => request<DailyPhoto[]>(`/api/days/${day}/photos`, { signal }),
  photos: (options: { beforeDate?: string; limit?: number; signal?: AbortSignal } = {}) => {
    const params = new URLSearchParams();
    if (options.beforeDate) params.set("beforeDate", options.beforeDate);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    return request<PhotoPage>(`/api/photos?${params}`, { signal: options.signal });
  },
  uploadPhotos: (day: string, files: File[]) => { const form = new FormData(); files.forEach((file) => form.append("files", file)); return request<DailyPhoto[]>(`/api/days/${day}/photos`, { method: "POST", body: form }); },
  deletePhoto: (id: number) => request<void>(`/api/photos/${id}`, { method: "DELETE" }),
  archiveExercise: (id: number) =>
    request<Exercise>(`/api/exercises/${id}/archive`, json("POST")),
  restoreExercise: (id: number) =>
    request<Exercise>(`/api/exercises/${id}/restore`, json("POST")),
  deleteExercise: (id: number, confirmation: string) =>
    request<void>(`/api/exercises/${id}`, json("DELETE", { confirmation })),
  prefill: (id: number, day: string, time?: string) => {
    const params = new URLSearchParams({ day });
    if (time) params.set("time", time);
    return request<SetPayload & { source: string }>(`/api/exercises/${id}/prefill?${params}`);
  },
  addSet: (day: string, exerciseId: number, payload: SetPayload) =>
    request(`/api/days/${day}/exercises/${exerciseId}/sets`, json("POST", payload)),
  updateSet: (id: number, payload: SetPayload) =>
    request(`/api/sets/${id}`, json("PATCH", payload)),
  deleteSet: (id: number) => request<void>(`/api/sets/${id}`, json("DELETE")),
  backups: () => request<Backup[]>("/api/backups"),
  createBackup: () => request<Backup>("/api/backups/on-demand", json("POST")),
  backupSettings: () => request<BackupSettings>("/api/backups/settings"),
  updateBackupSettings: (payload: BackupSettings) => request<BackupSettings>("/api/backups/settings", json("PUT", payload)),
  deleteBackup: (id: string) =>
    request<void>(`/api/backups/${encodeURIComponent(id)}`, json("DELETE")),
  restoreBackup: (id: string, confirmation: string) =>
    request<RestoreResult>(`/api/backups/${encodeURIComponent(id)}/restore`, json("POST", { confirmation })),
  restoreUploadedBackup: (file: File, confirmation: string) => {
    const form = new FormData();
    form.append("confirmation", confirmation);
    form.append("file", file);
    return request<RestoreResult>("/api/backups/restore-upload", { method: "POST", body: form });
  },
  importLegacy: (file: File, confirmation: string) => {
    const form = new FormData();
    form.append("confirmation", confirmation);
    form.append("file", file);
    return request<RestoreResult>("/api/backups/import-legacy", { method: "POST", body: form });
  },
};
