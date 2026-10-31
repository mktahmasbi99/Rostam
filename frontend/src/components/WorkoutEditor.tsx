import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { getRestartSnapshot } from "../lib/restartSafety";
import type { Exercise, ExerciseSet, Workout, WorkoutPayload } from "../lib/types";
import { workoutElapsed, workoutLocalTime, workoutTimeRange } from "../lib/workoutTime";
import { ExerciseHistory } from "./ExerciseHistory";
import { ExerciseImage } from "./ExerciseImage";
import { ExerciseNote } from "./ExerciseNote";
import { ExercisePicker } from "./ExercisePicker";
import { Modal } from "./Modal";
import { ReadState } from "./ReadState";
import { SetForm } from "./SetForm";
import { SetRow } from "./SetRow";
import { SetTable } from "./SetTable";

export function WorkoutDetailsForm({ workout, day, today, timezone, onSave, onClose }: {
  workout?: Workout; day: string; today: string; timezone: string;
  onSave: (payload: WorkoutPayload) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(workout?.name ?? "");
  const defaultStart = day === today
    ? `${day}T${workoutLocalTime(new Date().toISOString(), timezone).slice(11, 16)}`
    : `${day}T09:00`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  return <Modal title="Workout details" onClose={() => { if (!busy) onClose(); }}>
    <form className="workout-details" data-update-dirty="workout-details" onSubmit={(event) => {
      event.preventDefault();
      if (saving.current) return;
      saving.current = true;
      setBusy(true); setError("");
      const payload: WorkoutPayload = { name: name.trim() || "Workout" };
      if (!workout) payload.startedAt = defaultStart;
      void onSave(payload).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not save workout.")).finally(() => { saving.current = false; setBusy(false); });
    }}>
      <label>Workout name<input aria-label="Workout name" maxLength={100} placeholder="Workout" value={name} onChange={(event) => setName(event.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="draft-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save workout"}</button></div>
    </form>
  </Modal>;
}

function WorkoutTimeForm({ workout, timezone, onSave, onClose }: {
  workout: Workout; timezone: string;
  onSave: (payload: WorkoutPayload) => Promise<void>; onClose: () => void;
}) {
  const [start, setStart] = useState(workoutLocalTime(workout.startedAt, timezone).slice(11, 16));
  const [end, setEnd] = useState(workout.endedAt ? workoutLocalTime(workout.endedAt, timezone).slice(11, 16) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const startDate = workoutLocalTime(workout.startedAt, timezone).slice(0, 10);
  const endDate = workout.endedAt ? workoutLocalTime(workout.endedAt, timezone).slice(0, 10) : "";
  return <Modal title="Edit workout time" onClose={() => { if (!busy) onClose(); }}>
    <form className="workout-details" onSubmit={(event) => {
      event.preventDefault();
      if (saving.current) return;
      saving.current = true;
      setBusy(true); setError("");
      const payload: WorkoutPayload = { startedAt: `${startDate}T${start}` };
      if (workout.endedAt) payload.endedAt = `${endDate}T${end}`;
      void onSave(payload).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not save workout time.")).finally(() => { saving.current = false; setBusy(false); });
    }}>
      <p className="muted">Times use {timezone}. Dates follow the workout and its active day.</p>
      <label>Started<input aria-label="Workout start time" type="time" value={start} required onChange={(event) => setStart(event.target.value)} /></label>
      {workout.endedAt && <label>Ended<input aria-label="Workout end time" type="time" value={end} required onChange={(event) => setEnd(event.target.value)} /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="draft-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save time"}</button></div>
    </form>
  </Modal>;
}

export function WorkoutEditor({ id, today, timezone, onClose, onChanged }: {
  id: number; today: string; timezone: string; onClose: () => void; onChanged: () => void;
}) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [clockNow, setClockNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [picker, setPicker] = useState(false);
  const [details, setDetails] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [draft, setDraft] = useState<{ entryId: number; existing?: ExerciseSet } | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; action: () => void | Promise<void> } | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setWorkout(await api.workout(id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load workout."); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!workout || workout.endedAt) return;
    setClockNow(Date.now());
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [workout]);

  async function mutate(action: () => Promise<void>) {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError("");
    try { await action(); onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save workout."); }
    finally { writing.current = false; setBusy(false); }
  }
  function guardDraft(action: () => void | Promise<void>) {
    if (getRestartSnapshot().pendingWrites || writing.current) { setError("Wait for the current save to finish."); return; }
    if (getRestartSnapshot().dirty.length) {
      setConfirmation({ title: "Discard unsaved changes?", message: "Saved sets are safe. Unsaved values on this screen will be discarded.", action });
    } else void action();
  }
  const close = () => { if (!writing.current) guardDraft(onClose); };
  async function refreshSets() {
    setWorkout(await api.workout(id)); onChanged();
  }
  async function chooseExercise(exercise: Exercise) {
    const existing = workout?.exercises.find((entry) => entry.exercise.id === exercise.id);
    if (existing) {
      setPicker(false);
      requestAnimationFrame(() => document.getElementById(`workout-exercise-${existing.id}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }));
      setDraft({ entryId: existing.id }); setDraftKey((value) => value + 1);
      return;
    }
    await mutate(async () => {
      const next = await api.addWorkoutExercise(id, exercise.id);
      setWorkout(next); setPicker(false);
      const member = next.exercises.find((item) => item.exercise.id === exercise.id)!;
      setDraft({ entryId: member.id }); setDraftKey((value) => value + 1);
      requestAnimationFrame(() => document.getElementById(`workout-exercise-${member.id}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }));
    });
  }
  async function move(index: number, direction: number) {
    if (!workout) return;
    const ids = workout.exercises.map((item) => item.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    await mutate(async () => setWorkout(await api.orderWorkoutExercises(id, ids)));
  }
  return <Modal title={workout?.name ?? "Workout"} fullScreen onClose={close}>
    <div className="workout-editor">
      <ReadState loading={loading} error={error} hasData={Boolean(workout)} onRetry={() => void load()} loadingText="Loading workout…" />
      {workout && <>
        <header className="workout-overview"><div><span className="workout-status">{workout.endedAt ? "Recorded workout" : "Workout in progress"}</span><button type="button" className="workout-time-trigger" aria-label="Edit workout time" disabled={busy} onClick={() => guardDraft(() => { setDraft(null); setEditingTime(true); })}>{workoutTimeRange(workout.startedAt, workout.endedAt, timezone)}</button><span className="workout-elapsed" aria-label="Workout elapsed time">{workoutElapsed(workout.startedAt, workout.endedAt, clockNow)}</span><strong>{workout.exerciseCount} exercises · {workout.setCount} sets</strong></div><button className="icon-button" aria-label="Edit workout details" disabled={busy} onClick={() => guardDraft(() => { setDraft(null); setDetails(true); })}><Pencil /></button></header>
        <div className="workout-exercises">{workout.exercises.map((entry, index) => <section className="exercise-card workout-exercise" id={`workout-exercise-${entry.id}`} key={entry.id}>
          <header className="exercise-card-header"><ExerciseImage imageKey={entry.exercise.imageKey} name={entry.exercise.name} size="large" /><div className="exercise-card-main"><h3>{index + 1}. {entry.exercise.name}</h3><ExerciseHistory exercise={entry.exercise} day={workoutLocalTime(workout.startedAt, timezone).slice(0, 10)} /></div></header>
          <div className="workout-exercise-tools"><span>{entry.sets.length} {entry.sets.length === 1 ? "set" : "sets"}</span><button className="icon-button" aria-label={`Move ${entry.exercise.name} earlier`} disabled={busy || index === 0} onClick={() => void move(index, -1)}><ArrowUp /></button><button className="icon-button" aria-label={`Move ${entry.exercise.name} later`} disabled={busy || index === workout.exercises.length - 1} onClick={() => void move(index, 1)}><ArrowDown /></button><button className="icon-button" aria-label={`Remove ${entry.exercise.name}`} disabled={busy} onClick={() => {
            const action = () => mutate(async () => { await api.removeWorkoutExercise(id, entry.id, true); if (draft?.entryId === entry.id) setDraft(null); await refreshSets(); });
            if (entry.sets.length) setConfirmation({ title: "Remove exercise?", message: `Remove ${entry.exercise.name} and its ${entry.sets.length} saved sets?`, action });
            else guardDraft(action);
          }}><Trash2 /></button></div>
          <ExerciseNote exercise={entry.exercise} />
          <SetTable exercise={entry.exercise} editable>
            {entry.sets.map((set, setIndex) => draft?.existing?.id === set.id ? null : <div key={set.id} className="workout-numbered-set">{set.date !== workoutLocalTime(workout.startedAt, timezone).slice(0, 10) && <time className="workout-set-day">{set.date}</time>}<span className="workout-set-number" aria-label={`Set ${setIndex + 1}`}>{setIndex + 1}</span><SetRow exercise={entry.exercise} set={set} index={setIndex} onEdit={() => guardDraft(() => { setDraft({ entryId: entry.id, existing: set }); setDraftKey((value) => value + 1); })} onDelete={async () => { await api.deleteSet(set.id); await refreshSets(); }} /></div>)}
            {draft?.entryId === entry.id && <SetForm key={`${entry.id}-${draftKey}`} workout={{ id, entryId: entry.id, startedAt: workout.startedAt, endedAt: workout.endedAt, timezone }} exercise={entry.exercise} day={workoutLocalTime(workout.startedAt, timezone).slice(0, 10)} existing={draft.existing} onSaved={() => { const editing = Boolean(draft.existing); setDraft(editing ? null : { entryId: entry.id }); setDraftKey((value) => value + 1); void refreshSets().catch((caught) => setError(String(caught))); }} onCancel={() => setDraft(null)} onDelete={draft.existing ? async () => { await api.deleteSet(draft.existing!.id); setDraft(null); await refreshSets(); } : undefined} />}
            {draft?.entryId !== entry.id && <button className="add-set" disabled={busy || Boolean(entry.exercise.archivedAt)} onClick={() => guardDraft(() => { setDraft({ entryId: entry.id }); setDraftKey((value) => value + 1); })}><Plus />Add set</button>}
          </SetTable>
          {entry.exercise.archivedAt && <p className="muted">Restore this exercise in the library to add sets.</p>}
        </section>)}</div>
        {!workout.exercises.length && <div className="empty-state"><h3>Your workout starts here</h3><p>Add an exercise, log your sets, then move to the next exercise.</p></div>}
        <div className="workout-actions"><button disabled={busy} onClick={() => guardDraft(() => { setDraft(null); setPicker(true); })}><Plus />Add exercise</button>{!workout.endedAt && <button className="primary" disabled={busy || !workout.setCount} onClick={() => guardDraft(() => mutate(async () => { setDraft(null); setWorkout(await api.finishWorkout(id)); }))}><Check />Finish workout</button>}<button className="workout-delete" disabled={busy} onClick={() => setConfirmation({ title: workout.setCount ? "Delete workout?" : "Discard empty workout?", message: workout.setCount ? "This permanently deletes the workout and all its saved sets." : "This workout has no saved sets.", action: () => mutate(async () => { await api.deleteWorkout(id, true); onClose(); }) })}><Trash2 />{workout.setCount ? "Delete workout" : "Discard workout"}</button></div>
      </>}
    </div>
    {picker && <ExercisePicker day={today} today={today} presentIds={[]} onClose={() => setPicker(false)} onChoose={(exercise) => void chooseExercise(exercise)} />}
    {details && workout && <WorkoutDetailsForm workout={workout} day={today} today={today} timezone={timezone} onClose={() => setDetails(false)} onSave={async (payload) => { setWorkout(await api.updateWorkout(id, payload)); setDetails(false); onChanged(); }} />}
    {editingTime && workout && <WorkoutTimeForm workout={workout} timezone={timezone} onClose={() => setEditingTime(false)} onSave={async (payload) => { setWorkout(await api.updateWorkout(id, payload)); setEditingTime(false); onChanged(); }} />}
    {confirmation && <Modal title={confirmation.title} onClose={() => setConfirmation(null)}><p>{confirmation.message}</p><div className="draft-actions"><button onClick={() => setConfirmation(null)}>Cancel</button><button className="primary" onClick={() => { const action = confirmation.action; setConfirmation(null); void action(); }}>Confirm</button></div></Modal>}
  </Modal>;
}
