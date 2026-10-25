import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatExerciseTotal } from "../lib/format";
import type { Exercise, ExerciseHistorySession } from "../lib/types";
import { Modal } from "./Modal";
import { SetRow } from "./SetRow";
import { ReadState } from "./ReadState";

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
function SessionBlock({ session, exercise, onChooseDay }: { session: ExerciseHistorySession; exercise: Exercise; onChooseDay?: (day: string) => void }) {
  return <section className="history-session"><header className="history-session-header"><button className="history-date" onClick={() => onChooseDay?.(session.date)}>{dateLabel(session.date)}</button><strong>{formatExerciseTotal(exercise, session.total, session.sets)}{weightLabel(session) ? ` · ${weightLabel(session)}` : ""}</strong></header><div className="set-list history-set-list">{session.sets.map((set, index) => <SetRow key={set.id} set={set} index={index} />)}</div></section>;
}

export function ExerciseHistoryDialog({ exercise, onClose, onChooseDay }: { exercise: Exercise; onClose: () => void; onChooseDay?: (day: string) => void }) {
  const [sessions, setSessions] = useState<ExerciseHistorySession[]>([]);
  const [nextBeforeDate, setNextBeforeDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const failedCursor = useRef<string | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);
  const loadHistory = useCallback(async (beforeDate?: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true); setError("");
    try {
      const result = await api.exerciseHistory(exercise.id, { beforeDate, limit: 10 }, current.signal);
      if (current.signal.aborted) return;
      setSessions((current) => beforeDate ? [...current, ...result.sessions] : result.sessions);
      setNextBeforeDate(result.nextBeforeDate);
      setLoaded(true);
      failedCursor.current = undefined;
    } catch (caught) { if (!current.signal.aborted) { failedCursor.current = beforeDate; setError(caught instanceof Error ? caught.message : "Could not load exercise history."); } }
    finally { if (!current.signal.aborted) setLoading(false); }
  }, [exercise.id]);
  useEffect(() => { void loadHistory(); return () => controller.current?.abort(); }, [loadHistory]);
  return <Modal title={`${exercise.name} history`} onClose={onClose} wide>
    <ReadState loading={loading} error={error} hasData={loaded} onRetry={() => void loadHistory(failedCursor.current)} loadingText="Loading history…" />
    {loaded && !error && !sessions.length && <p className="empty-copy">No history yet.</p>}
    <div className="history-sessions">{sessions.map((session) => <SessionBlock key={session.date} session={session} exercise={exercise} onChooseDay={(day) => { onClose(); onChooseDay?.(day); }} />)}</div>
    {nextBeforeDate && !loading && <button className="secondary history-load-more" onClick={() => void loadHistory(nextBeforeDate)}>Load older</button>}
  </Modal>;
}
