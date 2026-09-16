import type { Backup, Config, DayData, Exercise, ExerciseCreatePayload, ExerciseUpdatePayload, RestoreResult, SetPayload } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
    cache: "no-store",
  });
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
  config: () => request<Config>("/api/config"),
  day: (day: string) => request<DayData>(`/api/days/${day}`),
  calendar: (month: string) =>
    request<{ month: string; activeDates: string[] }>(`/api/calendar/${month}`),
  exercises: (status = "active", query = "", measurementType = "") => {
    const params = new URLSearchParams({ status, query });
    if (measurementType) params.set("measurementType", measurementType);
    return request<Exercise[]>(`/api/exercises?${params}`);
  },
  createExercise: (payload: ExerciseCreatePayload) =>
    request<Exercise>("/api/exercises", json("POST", payload)),
  updateExercise: (id: number, payload: ExerciseUpdatePayload) =>
    request<Exercise>(`/api/exercises/${id}`, json("PATCH", payload)),
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
};
