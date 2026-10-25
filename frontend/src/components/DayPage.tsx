import { ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { artwork } from "../artwork";
import { formatDay, formatExerciseTotal } from "../lib/format";
import type { DayData, Exercise, ExerciseSet, Rotation } from "../lib/types";
import { ExerciseImage } from "./ExerciseImage";
import { SetRow } from "./SetRow";
import { ActivityEntryCard } from "./ActivityEntry";
import { ReadState } from "./ReadState";

const ExerciseNote = lazy(() => import("./ExerciseNote").then((module) => ({ default: module.ExerciseNote })));
const DailyJournal = lazy(() => import("./DailyJournal").then((module) => ({ default: module.DailyJournal })));
const ExercisePicker = lazy(() => import("./ExercisePicker").then((module) => ({ default: module.ExercisePicker })));
const SetForm = lazy(() => import("./SetForm").then((module) => ({ default: module.SetForm })));
const ExerciseHistory = lazy(() => import("./ExerciseHistory").then((module) => ({ default: module.ExerciseHistory })));
const ActivityPicker = lazy(() => import("./ActivityPicker").then((module) => ({ default: module.ActivityPicker })));
const Modal = lazy(() => import("./Modal").then((module) => ({ default: module.Modal })));

interface Props {
  day: string;
  today: string;
  timezone?: string;
  onOpenCalendar: () => void;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onChooseDay?: (day: string) => void;
}

export function DayPage({ day, today, timezone = "Europe/Warsaw", onOpenCalendar, onPreviousDay, onNextDay, onChooseDay }: Props) {
  const [data, setData] = useState<DayData>({ date: day, sections: [] });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [pendingExercise, setPendingExercise] = useState<Exercise | null>(null);
  const [rotationPrompt, setRotationPrompt] = useState<{ exercise: Exercise; rotation: Rotation } | null>(null);
  const [rotationPromptBusy, setRotationPromptBusy] = useState(false);
  const [rotationPromptError, setRotationPromptError] = useState("");
  const [exerciseChoiceError, setExerciseChoiceError] = useState("");
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [editingSet, setEditingSet] = useState<ExerciseSet | null>(null);
  const latestLoad = useRef(0);

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

  useEffect(() => {
    const controller = new AbortController();
    setPendingExercise(null);
    setRotationPrompt(null);
    setRotationPromptError("");
    setExerciseChoiceError("");
    setAddingTo(null);
    setEditingSet(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function saved() {
    setPendingExercise(null);
    setAddingTo(null);
    setEditingSet(null);
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
          setRotationPrompt({ exercise, rotation: activeRotation });
          return;
        }
      }
      setPickerOpen(false);
      setPendingExercise(exercise);
    } catch (caught) {
      setPickerOpen(false);
      setExerciseChoiceError(caught instanceof Error ? caught.message : "Could not check the active rotation.");
    }
  }

  async function addExerciseToRotation() {
    if (!rotationPrompt || rotationPromptBusy) return;
    setRotationPromptBusy(true);
    setRotationPromptError("");
    try {
      const exerciseIds = rotationPrompt.rotation.members.map((member) => member.exercise.id);
      await api.setRotationMembers(rotationPrompt.rotation.id, [...exerciseIds, rotationPrompt.exercise.id]);
      setPendingExercise(rotationPrompt.exercise);
      setRotationPrompt(null);
    } catch (caught) {
      setRotationPromptError(caught instanceof Error ? caught.message : "Could not update the active rotation.");
    } finally {
      setRotationPromptBusy(false);
    }
  }

  async function removeSet(exercise: Exercise, set: ExerciseSet) {
    if (!window.confirm(`Delete the ${exercise.name} set recorded at ${set.time}? This cannot be undone.`)) return;
    try {
      await api.deleteSet(set.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete set.");
    }
  }

  const presentIds = data.sections.map((section) => section.exercise.id);

  return (
    <main className="page day-page">
      <header className="day-header">
        <button className="day-navigation" aria-label="Previous day" title="Previous day" onClick={onPreviousDay}><ChevronLeft /></button>
        <div><h1><button className="day-title" aria-label="Choose a day" onClick={onOpenCalendar}>{formatDay(day, today)}</button></h1></div>
        {day < today && <button className="day-navigation" aria-label="Next day" title="Next day" onClick={onNextDay}><ChevronRight /></button>}
      </header>

      <div className="day-actions">
        {loaded && <Suspense fallback={<span className="deferred-loading" role="status">Loading journal…</span>}><DailyJournal day={day} today={today} note={data.dailyNote ?? null} photoCount={data.photoCount ?? 0} onChanged={() => void load()} /></Suspense>}
        <div className="day-add-actions"><button className="secondary" onClick={() => setActivityPickerOpen(true)}><Clock3 />Add activity</button><button className="add-exercise" aria-label="Add exercise" title="Add exercise" onClick={() => setPickerOpen(true)}><Plus /></button></div>
      </div>

      <ReadState loading={loading} error={error} hasData={loaded} onRetry={() => void load()} loadingText="Loading sets…" />
      {loaded && !loading && !error && data.sections.length === 0 && !(data.activities?.length) && !pendingExercise && <div className="empty-state"><picture><source type="image/webp" srcSet={artwork.logo.webp} sizes="76px" /><img className="app-logo empty-logo" src={artwork.logo.src} srcSet={artwork.logo.png} sizes="76px" alt="" /></picture><h2>No activity recorded</h2><p>Add an exercise or start a timed activity.</p></div>}

      {!!data.activities?.length && <section className="activity-card"><h2>Timed activities</h2><div className="activity-entry-list">{data.activities.map((entry) => <ActivityEntryCard key={entry.id} entry={entry} activities={data.activities ?? []} timezone={timezone} onChanged={() => void load()} />)}</div></section>}

      {loaded && <div className="exercise-sections">
        {data.sections.map((section) => <section className="exercise-card" key={`${day}-${section.exercise.id}`}>
          <header className="exercise-card-header"><ExerciseImage imageKey={section.exercise.imageKey} name={section.exercise.name} size="large" /><div className="exercise-card-main"><div className="exercise-card-title-row"><h2>{section.exercise.name}</h2><Suspense fallback={null}><ExerciseHistory exercise={section.exercise} day={day} onChooseDay={onChooseDay} /></Suspense></div><strong className="daily-total">{formatExerciseTotal(section.exercise, section.total, section.sets)}</strong></div></header>
          <Suspense fallback={null}><ExerciseNote exercise={section.exercise} /></Suspense>
          <div className="set-list">
            {section.sets.map((set, index) => editingSet?.id === set.id ? <Suspense key={set.id} fallback={<div className="deferred-loading" role="status">Loading set editor…</div>}><SetForm exercise={section.exercise} day={day} existing={set} onSaved={() => void saved()} onCancel={() => setEditingSet(null)} /></Suspense> : <SetRow key={set.id} set={set} index={index} onEdit={() => { setAddingTo(null); setEditingSet(set); }} onDelete={() => void removeSet(section.exercise, set)} />)}
          </div>
          {addingTo === section.exercise.id ? <Suspense fallback={<div className="deferred-loading" role="status">Loading set editor…</div>}><SetForm exercise={section.exercise} day={day} onSaved={() => void saved()} onCancel={() => setAddingTo(null)} /></Suspense> : <button className="add-set" aria-label="Add set" title="Add set" onClick={() => { setEditingSet(null); setAddingTo(section.exercise.id); }}><Plus /></button>}
        </section>)}

        {pendingExercise && <section className="exercise-card pending-card"><header className="exercise-card-header"><ExerciseImage imageKey={pendingExercise.imageKey} name={pendingExercise.name} size="large" /><div className="exercise-card-main"><div className="exercise-card-title-row"><h2>{pendingExercise.name}</h2><Suspense fallback={null}><ExerciseHistory exercise={pendingExercise} day={day} onChooseDay={onChooseDay} /></Suspense></div><span className="daily-total">New today</span></div></header><Suspense fallback={null}><ExerciseNote exercise={pendingExercise} /></Suspense><Suspense fallback={<div className="deferred-loading" role="status">Loading set editor…</div>}><SetForm exercise={pendingExercise} day={day} onSaved={() => void saved()} onCancel={() => setPendingExercise(null)} /></Suspense></section>}
      </div>}
      {exerciseChoiceError && <p className="error-panel exercise-choice-error" role="alert">Could not add this exercise: {exerciseChoiceError}</p>}
      {rotationPrompt && <Suspense fallback={null}><Modal title="Add this exercise to your active rotation?" onClose={() => { if (!rotationPromptBusy) setRotationPrompt(null); }}><div className="rotation-choice-dialog"><p>{rotationPrompt.exercise.name}</p>{rotationPromptError && <p className="error" role="alert">{rotationPromptError}</p>}<div className="draft-actions"><button type="button" disabled={rotationPromptBusy} onClick={() => { setPendingExercise(rotationPrompt.exercise); setRotationPrompt(null); }}>Just record it</button><button type="button" className="primary" disabled={rotationPromptBusy} onClick={() => void addExerciseToRotation()}>{rotationPromptBusy ? "Adding…" : "Add to rotation"}</button></div></div></Modal></Suspense>}
      {pickerOpen && <Suspense fallback={<div className="deferred-loading" role="status">Loading exercise picker…</div>}><ExercisePicker day={day} today={today} presentIds={[...presentIds, ...(pendingExercise ? [pendingExercise.id] : [])]} onClose={() => setPickerOpen(false)} onChoose={(exercise) => void chooseExercise(exercise)} /></Suspense>}
      {activityPickerOpen && <Suspense fallback={<div className="deferred-loading" role="status">Loading activity picker…</div>}><ActivityPicker day={day} timezone={timezone} onClose={() => setActivityPickerOpen(false)} onStarted={() => { setActivityPickerOpen(false); void load(); }} /></Suspense>}
    </main>
  );
}
