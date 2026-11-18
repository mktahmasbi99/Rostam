import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../lib/api";
import { getServerReachability, getWriteOutcomeUncertain, subscribeServerReachability } from "../lib/connectivity";
import { cacheActiveWorkout, getOfflineWorkout, savePendingSet, subscribeOfflineWorkout, supportsOfflineWorkout, syncWorkoutSets } from "../lib/offlineWorkout";
import { DialogControlsContext } from "./dialogContext";
import { PendingWorkoutSets } from "./PendingWorkoutSets";
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
  const historical = !workout && day < today;
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(`${day}T10:00`);
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
      if (!workout) payload.startedAt = start;
      if (historical) payload.endedAt = end;
      void onSave(payload).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not save workout.")).finally(() => { saving.current = false; setBusy(false); });
    }}>
      <label>Workout name<input aria-label="Workout name" maxLength={100} placeholder="Workout" value={name} onChange={(event) => setName(event.target.value)} /></label>
      {historical && <><p className="muted">Times use {timezone}.</p><label>Started<input aria-label="Workout start time" type="datetime-local" value={start} required onChange={(event) => setStart(event.target.value)} /></label><label>Ended<input aria-label="Workout end time" type="datetime-local" value={end} min={start} required onChange={(event) => setEnd(event.target.value)} /></label></>}
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

export function WorkoutEditor({ id, today, timezone, onClose, onChanged, initialWorkout }: {
  initialWorkout?: Workout; id: number; today: string; timezone: string; onClose: () => void; onChanged: () => void;
}) {
  const [workout, setWorkout] = useState<Workout | null>(initialWorkout ?? null);
  const reachability = useSyncExternalStore(subscribeServerReachability, getServerReachability, getServerReachability);
  const uncertain = useSyncExternalStore(subscribeServerReachability, getWriteOutcomeUncertain, getWriteOutcomeUncertain);
  const { pending } = useSyncExternalStore(subscribeOfflineWorkout, getOfflineWorkout, getOfflineWorkout);
  const offline = reachability !== "reachable";
  const readOnly = offline || uncertain;
  const queueGeneration = supportsOfflineWorkout ? workout?.ledgerGeneration : undefined;
  const canQueue = Boolean(queueGeneration && !uncertain && (!offline || !workout?.endedAt));
  const setOperations = pending.filter((set) => set.workoutId === id && set.ledgerGeneration === workout?.ledgerGeneration);
  const loadVersion = useRef(0);
  const [clockNow, setClockNow] = useState(0);
  const [loading, setLoading] = useState(!initialWorkout);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [picker, setPicker] = useState(false);
  const [details, setDetails] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [draft, setDraft] = useState<{ entryId: number; existing?: ExerciseSet } | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; action: () => void | Promise<void> } | null>(null);
  const load = useCallback(async (background = false) => {
    const version = ++loadVersion.current;
    if (!background) { setLoading(true); setError(""); }
    try {
      const next = await api.workout(id);
      if (version !== loadVersion.current) return;
      if (background && getRestartSnapshot().dirty.length) {
        setWorkout((current) => {
          if (!current || current.ledgerGeneration !== next.ledgerGeneration) return current;
          const exercises = current.exercises.map((entry) => ({
            ...entry, sets: next.exercises.find((item) => item.id === entry.id)?.sets ?? entry.sets,
          }));
          return { ...current, exercises, setCount: exercises.reduce((total, entry) => total + entry.sets.length, 0) };
        });
        return;
      }
      setWorkout(next);
      if (next.ledgerGeneration && !next.endedAt) void cacheActiveWorkout(next, timezone).catch(() => {});
    } catch (caught) {
      if (!background && version === loadVersion.current) setError(caught instanceof Error ? caught.message : "Could not load workout.");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [id, timezone]);
  useEffect(() => { if (!initialWorkout) void load(); }, [load, initialWorkout]);
  useEffect(() => {
    const refresh = () => {
      if (getServerReachability() === "reachable" && !writing.current && !details && !editingTime && !picker) void load(true);
    };
    window.addEventListener("rostam-workout-refresh", refresh);
    return () => window.removeEventListener("rostam-workout-refresh", refresh);
  }, [load, details, editingTime, picker]);
  useEffect(() => {
    if (!workout || workout.endedAt) return;
    setClockNow(Date.now());
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [workout]);

  async function mutate(action: () => Promise<void>) {
    if (writing.current || readOnly) return;
    ++loadVersion.current;
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
    await load(); onChanged();
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
      if (next.ledgerGeneration && !next.endedAt) await cacheActiveWorkout(next, timezone).catch(() => {});
      setWorkout(next); setPicker(false);
      const member = next.exercises.find((item) => item.exercise.id === exercise.id)!;
      setDraft({ entryId: member.id }); setDraftKey((value) => value + 1);
      requestAnimationFrame(() => document.getElementById(`workout-exercise-${member.id}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }));
    });
  }
  function updateWorkout(next: Workout) {
    setWorkout(next);
    if (next.ledgerGeneration && !next.endedAt) void cacheActiveWorkout(next, timezone).catch(() => {});
  }
  async function move(index: number, direction: number) {
    if (!workout) return;
    const ids = workout.exercises.map((item) => item.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    await mutate(async () => updateWorkout(await api.orderWorkoutExercises(id, ids)));
  }
  return <DialogControlsContext.Provider value={false}><Modal title={workout?.name ?? "Workout"} fullScreen onClose={close}>
    <div className="workout-editor">
      <ReadState loading={loading} error={error} hasData={Boolean(workout)} onRetry={() => void load()} loadingText="Loading workout…" />
      {workout && <>
        {uncertain && <div className="workout-exercise-tools" role="alert">
          <p>A save result is uncertain. Reload Rostam to reconcile the server data.</p>
          <button className="secondary" onClick={() => window.location.reload()}>Reload to reconcile</button>
        </div>}
        {offline && !uncertain && <div className="workout-exercise-tools">
          <p role="status">{canQueue ? "Offline · You can log sets in this workout." : "Offline · Workout changes are paused."}</p>
          <button className="secondary" onClick={() => window.dispatchEvent(new Event("rostam-check-connection"))}>Check connection</button>
        </div>}
        <PendingWorkoutSets sets={setOperations.filter((operation) =>
          !workout.exercises.some((entry) => entry.sets.some((set) => set.operationId === operation.operationId))
        )} />
        <header className="workout-overview"><div><span className="workout-status">{workout.endedAt ? "Recorded workout" : "Workout in progress"}</span><button type="button" className="workout-time-trigger" aria-label="Edit workout time" disabled={busy || readOnly} onClick={() => guardDraft(() => { setDraft(null); setEditingTime(true); })}>{workoutTimeRange(workout.startedAt, workout.endedAt, timezone)}</button><span className="workout-elapsed" aria-label="Workout elapsed time">{workoutElapsed(workout.startedAt, workout.endedAt, clockNow)}</span><strong>{workout.exerciseCount} exercises · {workout.setCount} sets</strong></div><button className="icon-button" aria-label="Edit workout details" disabled={busy || readOnly} onClick={() => guardDraft(() => { setDraft(null); setDetails(true); })}><Pencil /></button></header>
        <div className="workout-exercises">{workout.exercises.map((entry, index) => <section className="exercise-card workout-exercise" id={`workout-exercise-${entry.id}`} key={entry.id}>
          <header className="exercise-card-header"><ExerciseImage imageKey={entry.exercise.imageKey} name={entry.exercise.name} size="large" /><div className="exercise-card-main"><h3>{index + 1}. {entry.exercise.name}</h3>{!offline && <ExerciseHistory exercise={entry.exercise} day={workoutLocalTime(workout.startedAt, timezone).slice(0, 10)} />}</div></header>
          <div className="workout-exercise-tools"><span>{entry.sets.length} {entry.sets.length === 1 ? "set" : "sets"}</span><button className="icon-button" aria-label={`Move ${entry.exercise.name} earlier`} disabled={busy || readOnly || index === 0} onClick={() => void move(index, -1)}><ArrowUp /></button><button className="icon-button" aria-label={`Move ${entry.exercise.name} later`} disabled={busy || readOnly || index === workout.exercises.length - 1} onClick={() => void move(index, 1)}><ArrowDown /></button><button className="icon-button" aria-label={`Remove ${entry.exercise.name}`} disabled={busy || readOnly} onClick={() => {
            const action = () => mutate(async () => { await api.removeWorkoutExercise(id, entry.id, true); if (draft?.entryId === entry.id) setDraft(null); await refreshSets(); });
            if (entry.sets.length) setConfirmation({ title: "Remove exercise?", message: `Remove ${entry.exercise.name} and its ${entry.sets.length} saved sets?`, action });
            else guardDraft(action);
          }}><Trash2 /></button></div>
          <DialogControlsContext.Provider value={readOnly}>
            <fieldset className="dialog-content-controls" disabled={readOnly}><ExerciseNote exercise={entry.exercise} /></fieldset>
          </DialogControlsContext.Provider>
          <SetTable exercise={entry.exercise} editable>
            {entry.sets.map((set, setIndex) => draft?.existing?.id === set.id ? null : <div key={set.id} className="workout-numbered-set">{set.date !== workoutLocalTime(workout.startedAt, timezone).slice(0, 10) && <time className="workout-set-day">{set.date}</time>}<span className="workout-set-number" aria-label={`Set ${setIndex + 1}`}>{setIndex + 1}</span><SetRow exercise={entry.exercise} set={set} index={setIndex} onEdit={readOnly ? undefined : () => guardDraft(() => { setDraft({ entryId: entry.id, existing: set }); setDraftKey((value) => value + 1); })} onDelete={readOnly ? undefined : async () => { await api.deleteSet(set.id); await refreshSets(); }} /></div>)}
            {draft?.entryId === entry.id && <fieldset className="dialog-content-controls" disabled={readOnly && (Boolean(draft.existing) || !canQueue)}>
              <SetForm key={`${entry.id}-${draftKey}`} workout={{ id, entryId: entry.id, startedAt: workout.startedAt, endedAt: workout.endedAt, timezone }}
                exercise={entry.exercise} day={workoutLocalTime(workout.startedAt, timezone).slice(0, 10)} existing={draft.existing}
                offline={offline} prefillVersion={entry.sets.length} saveWorkoutSet={queueGeneration ? async (payload) => {
                  await savePendingSet({ ledgerGeneration: queueGeneration, workoutId: id, workoutName: workout.name,
                    entryId: entry.id, exerciseName: entry.exercise.name, payload, timezone });
                  if (getServerReachability() === "reachable") {
                    void syncWorkoutSets().then(() => { void load(true); onChanged(); }).catch(() => {});
                  }
                } : undefined}
                onSaved={() => {
                  const editing = Boolean(draft.existing);
                  setDraft(editing ? null : { entryId: entry.id });
                  setDraftKey((value) => value + 1);
                  if (editing || !queueGeneration) void refreshSets();
                }}
                onCancel={() => setDraft(null)} onDelete={draft.existing ? async () => { await api.deleteSet(draft.existing!.id); setDraft(null); await refreshSets(); } : undefined} />
            </fieldset>}
            {draft?.entryId !== entry.id && <button className="add-set" disabled={busy || (readOnly && !canQueue) || Boolean(entry.exercise.archivedAt)} onClick={() => guardDraft(() => { setDraft({ entryId: entry.id }); setDraftKey((value) => value + 1); })}><Plus />Add set</button>}
          </SetTable>
          {entry.exercise.archivedAt && <p className="muted">Restore this exercise in the library to add sets.</p>}
        </section>)}</div>
        {!workout.exercises.length && <div className="empty-state"><h3>Your workout starts here</h3><p>Add an exercise, log your sets, then move to the next exercise.</p></div>}
        <div className="workout-actions"><button disabled={busy || readOnly} onClick={() => guardDraft(() => { setDraft(null); setPicker(true); })}><Plus />Add exercise</button>{!workout.endedAt && <button className="primary" disabled={busy || readOnly || !workout.setCount || setOperations.some((set) => !set.error)} onClick={() => guardDraft(() => mutate(async () => { setDraft(null); setWorkout(await api.finishWorkout(id)); void cacheActiveWorkout(null, timezone).catch(() => {}); }))}><Check />Finish workout</button>}<button className="workout-delete" disabled={busy || readOnly} onClick={() => setConfirmation({ title: workout.setCount ? "Delete workout?" : "Discard empty workout?", message: workout.setCount ? "This permanently deletes the workout and all its saved sets." : "This workout has no saved sets.", action: () => mutate(async () => { await api.deleteWorkout(id, true); if (!workout.endedAt) void cacheActiveWorkout(null, timezone).catch(() => {}); onClose(); }) })}><Trash2 />{workout.setCount ? "Delete workout" : "Discard workout"}</button></div>
      </>}
    </div>
    <DialogControlsContext.Provider value={readOnly}>
    {picker && <ExercisePicker day={today} today={today} presentIds={[]} onClose={() => setPicker(false)} onChoose={(exercise) => void chooseExercise(exercise)} />}
    {details && workout && <WorkoutDetailsForm workout={workout} day={today} today={today} timezone={timezone} onClose={() => setDetails(false)} onSave={async (payload) => { updateWorkout(await api.updateWorkout(id, payload)); setDetails(false); onChanged(); }} />}
    {editingTime && workout && <WorkoutTimeForm workout={workout} timezone={timezone} onClose={() => setEditingTime(false)} onSave={async (payload) => { updateWorkout(await api.updateWorkout(id, payload)); setEditingTime(false); onChanged(); }} />}
    </DialogControlsContext.Provider>
    {confirmation && <Modal title={confirmation.title} onClose={() => setConfirmation(null)}><p>{confirmation.message}</p><div className="draft-actions"><button onClick={() => setConfirmation(null)}>Cancel</button><button className="primary" onClick={() => { const action = confirmation.action; setConfirmation(null); void action(); }}>Confirm</button></div></Modal>}
  </Modal></DialogControlsContext.Provider>;
}
