import { ChevronLeft, ChevronRight, ClipboardList, Clock3, Dumbbell, Pill, Plus, Trash2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { workoutTimeRange } from "../lib/workoutTime";
import { api } from "../lib/api";
import { artwork } from "../artwork";
import { formatDay, formatExerciseTotal } from "../lib/format";
import type { DayData, DaySection, Exercise, ExerciseSet, Rotation } from "../lib/types";
import { useSetDeletion } from "../lib/useSetDeletion";
import { ExerciseImage } from "./ExerciseImage";
import { SetTable } from "./SetTable";
import { SetRow } from "./SetRow";
import { ActivityEntryCard } from "./ActivityEntry";
import { Modal } from "./Modal";
import { ReadState } from "./ReadState";

const Supplements = lazy(() => import("./Supplements").then((module) => ({ default: module.Supplements })));
const SupplementLibrary = lazy(() => import("./Supplements").then((module) => ({ default: module.SupplementLibrary })));
const WorkoutEditor = lazy(() => import("./WorkoutEditor").then((module) => ({ default: module.WorkoutEditor })));
const WorkoutDetailsForm = lazy(() => import("./WorkoutEditor").then((module) => ({ default: module.WorkoutDetailsForm })));
const ExerciseNote = lazy(() => import("./ExerciseNote").then((module) => ({ default: module.ExerciseNote })));
const DailyJournal = lazy(() => import("./DailyJournal").then((module) => ({ default: module.DailyJournal })));
const ExercisePicker = lazy(() => import("./ExercisePicker").then((module) => ({ default: module.ExercisePicker })));
const SetForm = lazy(() => import("./SetForm").then((module) => ({ default: module.SetForm })));
const ExerciseHistory = lazy(() => import("./ExerciseHistory").then((module) => ({ default: module.ExerciseHistory })));
const ActivityPicker = lazy(() => import("./ActivityPicker").then((module) => ({ default: module.ActivityPicker })));

interface Props {
  day: string;
  today: string;
  timezone?: string;
  viewingOffline?: boolean;
  onOpenCalendar: () => void;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onChooseDay?: (day: string) => void;
}

function DayExerciseCard({ section, day, onChooseDay, onRemove, children }: {
  section: DaySection;
  day: string;
  onChooseDay?: Props["onChooseDay"];
  onRemove?: () => Promise<void>;
  children: ReactNode;
}) {
  const { exercise, sets, total } = section;
  const { deleting, error, remove } = useSetDeletion(onRemove);
  return <section className={onRemove ? "exercise-card pending-card" : "exercise-card"}>
    <header className={`exercise-card-header${exercise.hasHistory ? " has-history" : ""}`}>
      <ExerciseImage imageKey={exercise.imageKey} name={exercise.name} size="large" />
      <div className="exercise-card-main">
        <div className="exercise-card-title-row">
          <h2 className="entry-kind-title"><Dumbbell className="entry-kind-icon" aria-hidden="true" /><span>{exercise.name}</span></h2>
          <Suspense fallback={null}><ExerciseHistory exercise={exercise} day={day} onChooseDay={onChooseDay} /></Suspense>
        </div>
        <strong className="daily-total">{sets.length ? formatExerciseTotal(exercise, total, sets) : "No sets recorded"}</strong>
      </div>
      {onRemove && <button type="button" className="history-button remove-day-exercise" aria-label={`Remove ${exercise.name} from this day`} title="Remove from this day" disabled={deleting} onClick={remove}><Trash2 /></button>}
    </header>
    <Suspense fallback={null}><ExerciseNote exercise={exercise} /></Suspense>
    <SetTable exercise={exercise} editable>{children}</SetTable>
    {error && <p className="set-delete-error" role="alert">{error}</p>}
  </section>;
}

export function DayPage({ day, today, timezone = "Europe/Warsaw", onOpenCalendar, onPreviousDay, onNextDay, onChooseDay, viewingOffline = false }: Props) {
  const [data, setData] = useState<DayData>({ date: day, sections: [] });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [openedWorkout, setOpenedWorkout] = useState<{ id: number; browseOnly: boolean } | null>(null);
  const [workoutDetailsOpen, setWorkoutDetailsOpen] = useState(false);
  const [startingWorkout, setStartingWorkout] = useState(false);
  const [workoutError, setWorkoutError] = useState("");
  const startingWorkoutRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [supplementLibraryOpen, setSupplementLibraryOpen] = useState(false);
  const [rotationPrompt, setRotationPrompt] = useState<{ exercise: Exercise; rotation: Rotation } | null>(null);
  const [rotationPromptBusy, setRotationPromptBusy] = useState(false);
  const [rotationPromptError, setRotationPromptError] = useState("");
  const [exerciseChoiceError, setExerciseChoiceError] = useState("");
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [editingSet, setEditingSet] = useState<ExerciseSet | null>(null);
  const latestLoad = useRef(0);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const loadId = ++latestLoad.current;
    setLoading(true);
    setError("");
    try {
      const next = await api.day(day, signal);
      if (signal?.aborted || loadId !== latestLoad.current) return;
      setData(next);
      setLoaded(true);
    } catch (caught) {
      if (signal?.aborted || loadId !== latestLoad.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load this day.");
    } finally {
      if (!signal?.aborted && loadId === latestLoad.current) setLoading(false);
    }
  }, [day]);

  useEffect(() => { if (viewingOffline) void load(); }, [load, viewingOffline]);

  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener("rostam-workout-refresh", refresh);
    return () => window.removeEventListener("rostam-workout-refresh", refresh);
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    setRotationPrompt(null);
    setRotationPromptError("");
    setExerciseChoiceError("");
    setAddingTo(null);
    setEditingSet(null);
    setAddMenuOpen(false);
    setSupplementLibraryOpen(false);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (addMenuOpen) addMenuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus({ preventScroll: true });
  }, [addMenuOpen]);

  function handleAddMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(addMenuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setAddMenuOpen(false);
      addTriggerRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (items.length === 0) {
        setAddMenuOpen(true);
        return;
      }
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
        currentIndex < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1) :
          (currentIndex + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      items[nextIndex]?.focus();
    }
  }

  function openExercisePicker() {
    setAddMenuOpen(false);
    setPickerOpen(true);
  }

  function openActivityPicker() {
    setAddMenuOpen(false);
    setActivityPickerOpen(true);
  }

  async function saved() {
    setAddingTo(null);
    setEditingSet(null);
    await load();
  }

  async function addExerciseToDay(exercise: Exercise) {
    await api.addDayExercise(day, exercise.id);
    setAddingTo(exercise.id);
    await load();
  }

  async function chooseExercise(exercise: Exercise) {
    setExerciseChoiceError("");
    setRotationPromptError("");
    setAddingTo(null);
    setEditingSet(null);
    try {
      if (day === today) {
        const rotations = await api.rotations();
        const activeRotation = rotations.find((rotation) => rotation.active);
        if (activeRotation && !activeRotation.members.some((member) => member.exercise.id === exercise.id)) {
          setPickerOpen(false);
          addTriggerRef.current?.focus();
          setRotationPrompt({ exercise, rotation: activeRotation });
          return;
        }
      }
      setPickerOpen(false);
      addTriggerRef.current?.focus();
      await addExerciseToDay(exercise);
    } catch (caught) {
      setPickerOpen(false);
      addTriggerRef.current?.focus();
      setExerciseChoiceError(caught instanceof Error ? caught.message : "Could not save the exercise.");
    }
  }

  async function confirmExercise(addToRotation: boolean) {
    if (!rotationPrompt || rotationPromptBusy) return;
    setRotationPromptBusy(true);
    setRotationPromptError("");
    try {
      if (addToRotation) {
        const exerciseIds = rotationPrompt.rotation.members.map((member) => member.exercise.id);
        await api.setRotationMembers(rotationPrompt.rotation.id, [...exerciseIds, rotationPrompt.exercise.id]);
      }
      await addExerciseToDay(rotationPrompt.exercise);
      setRotationPrompt(null);
    } catch (caught) {
      setRotationPromptError(caught instanceof Error ? caught.message : "Could not save the exercise.");
    } finally {
      setRotationPromptBusy(false);
    }
  }

  async function removeSet(set: ExerciseSet) {
    await api.deleteSet(set.id);
    await load();
  }

  async function startWorkout() {
    if (day < today) {
      setAddMenuOpen(false);
      setWorkoutDetailsOpen(true);
      return;
    }
    if (startingWorkoutRef.current) return;
    startingWorkoutRef.current = true; setStartingWorkout(true); setWorkoutError(""); setAddMenuOpen(false);
    try { const workout = await api.createWorkout({}); setOpenedWorkout({ id: workout.id, browseOnly: viewingOffline }); void load(); }
    catch (caught) { setWorkoutError(caught instanceof Error ? caught.message : "Could not start workout."); }
    finally { startingWorkoutRef.current = false; setStartingWorkout(false); }
  }

  const presentIds = data.sections.map((section) => section.exercise.id);

  return (
    <main className="page day-page">
      <header className="day-header">
        <button className="day-navigation" aria-label="Previous day" title="Previous day" onClick={onPreviousDay}><ChevronLeft /></button>
        <div><h1><button className="day-title" aria-label="Choose a day" onClick={onOpenCalendar}>{formatDay(day, today)}</button></h1></div>
        {day < today && <button className="day-navigation" aria-label="Next day" title="Next day" onClick={onNextDay}><ChevronRight /></button>}
      </header>

      {loaded && <div className="day-journal-actions"><Suspense fallback={<span className="deferred-loading" role="status">Loading journal…</span>}><DailyJournal day={day} today={today} note={data.dailyNote ?? null} photoCount={data.photoCount ?? 0} onChanged={() => void load()} /></Suspense></div>}

      <ReadState loading={loading} error={error} hasData={loaded} onRetry={() => void load()} loadingText="Loading sets…" />

      {loaded && data.date === day && (day === today || Boolean(data.supplements?.length)) &&
        <Suspense fallback={null}><Supplements key={day} cards={data.supplements ?? []} day={day} today={today} timezone={timezone} onChanged={() => void load()} /></Suspense>}
      {viewingOffline && <button className="secondary" onClick={() => setSupplementLibraryOpen(true)}>Browse supplements</button>}
      {supplementLibraryOpen && <Suspense fallback={<div role="status">Loading supplement library…</div>}>
        <SupplementLibrary day={day} today={today} timezone={timezone} onClose={() => setSupplementLibraryOpen(false)} onChanged={() => void load()} />
      </Suspense>}

      {loaded && !loading && !error && data.sections.length === 0 && !(data.activities?.length) && !(data.workouts?.length) && !data.supplements?.length && (!viewingOffline || (!data.dailyNote && !data.photoCount)) && <div className="empty-state"><picture><source type="image/webp" srcSet={artwork.logo.webp} sizes="76px" /><img className="app-logo empty-logo" src={artwork.logo.src} srcSet={artwork.logo.png} sizes="76px" alt="" /></picture><h2>{viewingOffline ? "No entries in this offline copy." : "No activity recorded"}</h2>{!viewingOffline && <p>Add an exercise, activity, or workout.</p>}</div>}

      {workoutError && <p className="error" role="alert">{workoutError}</p>}
      {data.activeWorkout && !data.workouts?.some((item) => item.id === data.activeWorkout?.id) && <button className="workout-resume-banner" onClick={() => setOpenedWorkout({ id: data.activeWorkout!.id, browseOnly: viewingOffline })}>{viewingOffline ? "View" : "Resume"} {data.activeWorkout.name} · workout in progress</button>}
      {!!data.workouts?.length && <section className="workout-day-list" aria-label="Workouts">{data.workouts.map((workout) => <button className="workout-summary-card" key={workout.id} onClick={() => setOpenedWorkout({ id: workout.id, browseOnly: viewingOffline })}><div><span className="workout-status">{workout.endedAt ? "Workout" : "In progress"}</span><h2 className="entry-kind-title"><ClipboardList className="entry-kind-icon" aria-hidden="true" /><span>{workout.name}</span></h2><p>{workoutTimeRange(workout.startedAt, workout.endedAt, timezone)}</p><span>{workout.exerciseCount} exercises · {workout.setCount} sets</span></div><span className="workout-open-label">{workout.endedAt || viewingOffline ? "View" : "Resume"}<ChevronRight /></span></button>)}</section>}
      {openedWorkout && <Suspense fallback={<div role="status">Loading workout…</div>}><WorkoutEditor id={openedWorkout.id} browseOnly={openedWorkout.browseOnly} today={today} timezone={timezone} onClose={() => { setOpenedWorkout(null); void load(); }} onChanged={() => void load()} /></Suspense>}
      {workoutDetailsOpen && <Suspense fallback={null}><WorkoutDetailsForm day={day} today={today} timezone={timezone} onClose={() => setWorkoutDetailsOpen(false)} onSave={async (payload) => { const workout = await api.createWorkout(payload); setWorkoutDetailsOpen(false); setOpenedWorkout({ id: workout.id, browseOnly: viewingOffline }); void load(); }} /></Suspense>}

      {!!data.activities?.length && <section className="activity-card"><h2>Timed activities</h2><div className="activity-entry-list">{data.activities.map((entry) => <ActivityEntryCard key={entry.id} entry={entry} activities={data.activities ?? []} timezone={timezone} onChanged={() => void load()} />)}</div></section>}

      {viewingOffline && Boolean(data.sections.length) && <p id="offline-day-sets" className="empty-copy">Connect to Rostam to add sets from Today.</p>}
      {loaded && <div className="exercise-sections">
        {data.sections.map((section) => <DayExerciseCard key={section.exercise.id} section={section} day={day} onChooseDay={onChooseDay}
          onRemove={viewingOffline || section.sets.length ? undefined : async () => {
            await api.removeDayExercise(day, section.exercise.id);
            setAddingTo((current) => current === section.exercise.id ? null : current);
            await load();
          }}>
            {section.sets.map((set, index) => editingSet?.id === set.id ? <Suspense key={set.id} fallback={<div className="deferred-loading" role="status">Loading set editor…</div>}><SetForm exercise={section.exercise} day={day} existing={set} readOnly={viewingOffline} onDelete={() => removeSet(set)} onSaved={() => void saved()} onCancel={() => setEditingSet(null)} /></Suspense> : <SetRow key={set.id} exercise={section.exercise} set={set} index={index} onEdit={viewingOffline ? undefined : () => { setAddingTo(null); setEditingSet(set); }} onDelete={viewingOffline ? undefined : () => removeSet(set)} />)}
            {addingTo === section.exercise.id ? <Suspense fallback={<div className="deferred-loading" role="status">Loading set editor…</div>}><SetForm exercise={section.exercise} day={day} readOnly={viewingOffline} onSaved={() => void saved()} onCancel={() => setAddingTo(null)} /></Suspense> : <button className="add-set" aria-label="Add set" title="Add set" disabled={viewingOffline} aria-describedby={viewingOffline ? "offline-day-sets" : undefined} onClick={() => { setEditingSet(null); setAddingTo(section.exercise.id); }}><Plus /></button>}
        </DayExerciseCard>)}
      </div>}
      {exerciseChoiceError && <p className="error-panel exercise-choice-error" role="alert">Could not add this exercise: {exerciseChoiceError}</p>}
      {rotationPrompt && <Suspense fallback={null}><Modal title="Add this exercise to your active rotation?" onClose={() => { if (!rotationPromptBusy) setRotationPrompt(null); }}><div className="rotation-choice-dialog"><p>{rotationPrompt.exercise.name}</p>{rotationPromptError && <p className="error" role="alert">{rotationPromptError}</p>}<div className="draft-actions"><button type="button" disabled={rotationPromptBusy} onClick={() => void confirmExercise(false)}>Just record it</button><button type="button" className="primary" disabled={rotationPromptBusy} onClick={() => void confirmExercise(true)}>{rotationPromptBusy ? "Adding…" : "Add to rotation"}</button></div></div></Modal></Suspense>}
      {pickerOpen && <Suspense fallback={<div className="deferred-loading" role="status">Loading exercise picker…</div>}><ExercisePicker day={day} today={today} presentIds={presentIds} onClose={() => { setPickerOpen(false); addTriggerRef.current?.focus(); }} onChoose={(exercise) => void chooseExercise(exercise)} /></Suspense>}
      {activityPickerOpen && <Suspense fallback={<div className="deferred-loading" role="status">Loading activity picker…</div>}><ActivityPicker day={day} timezone={timezone} onClose={() => { setActivityPickerOpen(false); addTriggerRef.current?.focus(); }} onStarted={() => { setActivityPickerOpen(false); addTriggerRef.current?.focus(); void load(); }} /></Suspense>}
      <div className={`day-add-actions${addMenuOpen ? " menu-open" : ""}`} ref={addMenuRef} onKeyDown={handleAddMenuKeyDown}>
        {!viewingOffline && addMenuOpen && <div id="day-add-menu" className="day-add-menu" role="menu" aria-label="Add to day">
          {day === today && <button className="day-add-menu-item" role="menuitem" aria-label="Supplement" onClick={() => {
            setAddMenuOpen(false);
            addTriggerRef.current?.focus();
            setSupplementLibraryOpen(true);
          }}><span className="day-add-menu-icon" aria-hidden="true"><Pill /></span><span><strong>Supplement</strong><small>Add and manage supplements</small></span></button>}
          <button className="day-add-menu-item" role="menuitem" disabled={startingWorkout} onClick={() => void startWorkout()}><span className="day-add-menu-icon" aria-hidden="true"><ClipboardList /></span><span><strong>Start workout</strong><small>{day === today ? "Exercises and sets in one session" : "Record a workout for this day"}</small></span></button>
          <button className="day-add-menu-item" role="menuitem" onClick={openActivityPicker}><span className="day-add-menu-icon" aria-hidden="true"><Clock3 /></span><span><strong>Add activity</strong><small>BJJ, walking, and other activities</small></span></button>
          <button className="day-add-menu-item" role="menuitem" onClick={openExercisePicker}><span className="day-add-menu-icon" aria-hidden="true"><Dumbbell /></span><span><strong>Add exercise</strong><small>Sets throughout the day</small></span></button>
        </div>}
        <button ref={addTriggerRef} disabled={viewingOffline} className="add-exercise" aria-label={addMenuOpen ? "Close add menu" : "Add to day"} aria-haspopup="menu" aria-expanded={addMenuOpen} aria-controls="day-add-menu" onClick={() => setAddMenuOpen((open) => !open)}><Plus /></button>
      </div>
    </main>
  );
}
