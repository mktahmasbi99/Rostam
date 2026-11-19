import { getOfflineRecord } from "./offlineLedger";
import type { ActivityEntry, BodyMeasurement, DailyNote, Exercise, ExerciseHistorySession, PhotoGroup, Rotation, WorkoutSummary } from "./types";

function statusMatches(item: { archivedAt?: string | null }, status: string | null) {
  return status === "all" || Boolean(item.archivedAt) === (status === "archived");
}

function paginate<T>(items: T[], limit: number) {
  const page = items.slice(0, limit);
  return { page, cursor: items.length > limit ? page.at(-1) : undefined };
}

export async function readOfflineApi(path: string): Promise<unknown> {
  const url = new URL(path, location.origin);
  const params = url.searchParams;
  const beforeDate = params.get("beforeDate");
  const beforeId = Number(params.get("beforeId"));
  const limit = (fallback: number) => Number(params.get("limit")) || fallback;
  const dateFilter = <T extends { date: string }>(entries: T[]) => beforeDate
    ? entries.filter((entry) => entry.date < beforeDate) : entries;

  if (url.pathname === "/api/activities") {
    return getOfflineRecord(`${url.pathname}?status=${params.get("status") ?? "active"}`);
  }
  switch (url.pathname) {
    case "/api/exercises": {
      const exercises = await getOfflineRecord<Exercise[]>(url.pathname);
      const query = (params.get("query") ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
      const measurement = params.get("measurementType");
      return exercises?.filter((exercise) => statusMatches(exercise, params.get("status")) &&
        (!measurement || exercise.measurementType === measurement) &&
        exercise.name.normalize("NFKC").toLowerCase().includes(query));
    }
    case "/api/rotations": {
      const rotations = await getOfflineRecord<Rotation[]>(url.pathname);
      return rotations?.filter((rotation) => statusMatches(rotation, params.get("status")));
    }
    case "/api/notes":
    case "/api/photos": {
      const items = await getOfflineRecord<(DailyNote | PhotoGroup)[]>(url.pathname);
      if (items) {
        const { page, cursor } = paginate(dateFilter(items), limit(url.pathname === "/api/notes" ? 30 : 20));
        return { items: page, nextBeforeDate: cursor?.date ?? null };
      }
      return undefined;
    }
    case "/api/workouts": {
      const items = await getOfflineRecord<WorkoutSummary[]>(url.pathname);
      if (items) {
        const { page, cursor } = paginate(items.filter((item) => !beforeId || item.id < beforeId), limit(20));
        return { items: page, nextBeforeId: cursor?.id ?? null };
      }
      return undefined;
    }
    case "/api/body-measurements": {
      const items = await getOfflineRecord<BodyMeasurement[]>(url.pathname);
      if (items) {
        const filtered = items.filter((item) => !beforeDate || item.date < beforeDate ||
          (item.date === beforeDate && item.id < beforeId));
        const { page, cursor } = paginate(filtered, limit(50));
        return { items: page, nextBeforeDate: cursor?.date ?? null, nextBeforeId: cursor?.id ?? null };
      }
      return undefined;
    }
    case "/api/activity-notes": {
      const items = await getOfflineRecord<ActivityEntry[]>(url.pathname);
      if (items) {
        const activityId = Number(params.get("activityId"));
        const filtered = items.filter((item) => !activityId || item.activityId === activityId);
        const cursorIndex = filtered.findIndex((item) => item.id === beforeId);
        const beforeTime = Date.parse(params.get("beforeStartedAt") ?? "");
        const older = cursorIndex >= 0 ? filtered.slice(cursorIndex + 1) : filtered.filter((item) =>
          !beforeId || Date.parse(item.startedAt) < beforeTime ||
          (Date.parse(item.startedAt) === beforeTime && item.id < beforeId));
        const { page, cursor } = paginate(older, limit(30));
        return { items: page, nextBeforeStartedAt: cursor?.startedAt ?? null, nextBeforeId: cursor?.id ?? null };
      }
      return undefined;
    }
  }

  const record = await getOfflineRecord(url.pathname);
  if (/^\/api\/exercises\/\d+\/history$/.test(url.pathname) && Array.isArray(record)) {
    const { page, cursor } = paginate(dateFilter(record as ExerciseHistorySession[]), limit(10));
    return { sessions: page, nextBeforeDate: cursor?.date ?? null };
  }
  if (record !== undefined) return record;
  if (!/^\/api\/(days\/\d{4}-\d{2}-\d{2}(?:\/photos)?|calendar\/\d{4}-\d{2})$/.test(url.pathname)) return undefined;
  if (!(await getOfflineRecord("/api/config"))) return undefined;
  if (url.pathname.endsWith("/photos")) return [];
  const date = url.pathname.split("/").at(-1);
  return url.pathname.startsWith("/api/calendar/") ? { month: date, activeDates: [] } : { date, sections: [] };
}
