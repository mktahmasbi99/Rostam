import { History as HistoryIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatExerciseTotal } from "../lib/format";
import type { Exercise, ExerciseHistorySession } from "../lib/types";

const ExerciseHistoryDialog = lazy(() => import("./ExerciseHistoryDialog").then((module) => ({ default: module.ExerciseHistoryDialog })));
interface Props { exercise: Exercise; day: string; onChooseDay?: (day: string) => void }
function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
function weightLabel(session: ExerciseHistorySession): string {
  const bodyweight = session.sets.some((set) => set.resistanceKind === "bodyweight");
  const weights = [...new Set(session.sets.filter((set) => set.resistanceKind === "external" && set.weightKg !== null).map((set) => set.weightKg as string))].sort((a, b) => Number(a) - Number(b));
  if (!weights.length) return bodyweight ? "Bodyweight" : "";
  const value = weights.length === 1 ? `${weights[0]} kg` : `${weights[0]}–${weights.at(-1)} kg`;
  return bodyweight ? `Bodyweight + ${value}` : value;
}
export function ExerciseHistory({ exercise, day, onChooseDay }: Props) {
  const [previous, setPrevious] = useState<ExerciseHistorySession | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [previousError, setPreviousError] = useState("");
  const [retryPrevious, setRetryPrevious] = useState(0);
  useEffect(() => {
    if (!exercise.hasHistory) { setPrevious(null); setLoadingPrevious(false); setPreviousError(""); return; }
    const controller = new AbortController();
    setLoadingPrevious(true);
    setPreviousError("");
    api.exerciseHistory(exercise.id, { beforeDate: day, limit: 1 }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setPrevious(result.sessions[0] ?? null); })
      .catch((caught) => { if (!controller.signal.aborted) setPreviousError(caught instanceof Error ? caught.message : "Could not load the previous session."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingPrevious(false); });
    return () => controller.abort();
  }, [day, exercise.id, exercise.hasHistory, retryPrevious]);
  return <>
    {exercise.hasHistory && <button className="history-button" aria-label={`History for ${exercise.name}`} title="History" onClick={() => setOpen(true)}><HistoryIcon /></button>}
    {exercise.hasHistory && loadingPrevious && !previous && <small className="previous-session" role="status">Loading previous session…</small>}
    {exercise.hasHistory && previousError && <button className="previous-session-error" title={previousError} onClick={() => setRetryPrevious((value) => value + 1)}>Previous session unavailable · Retry</button>}
    {previous && <span className="previous-session">Last session · {dateLabel(previous.date)} · {formatExerciseTotal(exercise, previous.total, previous.sets)}{weightLabel(previous) ? ` · ${weightLabel(previous)}` : ""}</span>}
    {open && <Suspense fallback={<span className="deferred-loading" role="status">Loading history…</span>}><ExerciseHistoryDialog exercise={exercise} onClose={() => setOpen(false)} onChooseDay={onChooseDay} /></Suspense>}
  </>;
}
