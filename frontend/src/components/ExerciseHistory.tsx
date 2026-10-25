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
  useEffect(() => {
    if (!exercise.hasHistory) { setPrevious(null); return; }
    const controller = new AbortController();
    api.exerciseHistory(exercise.id, { beforeDate: day, limit: 1 }, controller.signal).then((result) => setPrevious(result.sessions[0] ?? null)).catch(() => { if (!controller.signal.aborted) setPrevious(null); });
    return () => controller.abort();
  }, [day, exercise.id, exercise.hasHistory]);
  return <>
    {exercise.hasHistory && <button className="history-button" aria-label={`History for ${exercise.name}`} title="History" onClick={() => setOpen(true)}><HistoryIcon /></button>}
    {previous && <span className="previous-session">Last session · {dateLabel(previous.date)} · {formatExerciseTotal(exercise, previous.total, previous.sets)}{weightLabel(previous) ? ` · ${weightLabel(previous)}` : ""}</span>}
    {open && <Suspense fallback={<span className="deferred-loading" role="status">Loading history…</span>}><ExerciseHistoryDialog exercise={exercise} onClose={() => setOpen(false)} onChooseDay={onChooseDay} /></Suspense>}
  </>;
}
