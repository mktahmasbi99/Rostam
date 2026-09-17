import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatDay, formatDuration, formatMeasurement, formatResistance } from "../lib/format";
import type { DayData, Exercise, ExerciseSet } from "../lib/types";
import { ExerciseImage } from "./ExerciseImage";
import { ExerciseNote } from "./ExerciseNote";
import { DailyJournal } from "./DailyJournal";
import { ExercisePicker } from "./ExercisePicker";
import { SetForm } from "./SetForm";

function shiftDay(day: string, amount: number): string {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

interface Props {
  day: string;
  today: string;
  onDayChange: (day: string) => void;
}

export function DayPage({ day, today, onDayChange }: Props) {
  const [data, setData] = useState<DayData>({ date: day, sections: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingExercise, setPendingExercise] = useState<Exercise | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [editingSet, setEditingSet] = useState<ExerciseSet | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.day(day));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this day.");
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    setPendingExercise(null);
    setAddingTo(null);
    setEditingSet(null);
    void load();
  }, [load]);

  async function saved() {
    setPendingExercise(null);
    setAddingTo(null);
    setEditingSet(null);
    await load();
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

  function total(exercise: Exercise, amount: number): string {
    return exercise.measurementType === "repetitions" ? `${amount} reps` : formatDuration(amount);
  }

  const presentIds = data.sections.map((section) => section.exercise.id);

  return (
    <main className="page day-page">
      <header className="day-header">
        <button className="date-arrow" aria-label="Previous day" onClick={() => onDayChange(shiftDay(day, -1))}><ChevronLeft /></button>
        <div><h1>{formatDay(day, today)}</h1>{day !== today && <time>{day}</time>}</div>
        <button className="date-arrow" aria-label="Next day" disabled={day >= today} onClick={() => onDayChange(shiftDay(day, 1))}><ChevronRight /></button>
      </header>

      <div className="day-actions">
        {!loading && !error && <DailyJournal day={day} today={today} note={data.dailyNote ?? null} photoCount={data.photoCount ?? 0} onChanged={() => void load()} />}
        <button className="add-exercise" aria-label="Add exercise" title="Add exercise" onClick={() => setPickerOpen(true)}><Plus /></button>
      </div>

      {error && <div className="error-panel" role="alert"><p>{error}</p><button onClick={() => void load()}>Retry</button></div>}
      {loading && <p className="loading">Loading sets…</p>}
      {!loading && !error && data.sections.length === 0 && !pendingExercise && <div className="empty-state"><img className="app-logo empty-logo" src="/rostam-logo.png" alt="" /><h2>No sets recorded</h2><p>Use the plus button above when movement finds you today.</p></div>}

      <div className="exercise-sections">
        {data.sections.map((section) => <section className="exercise-card" key={`${day}-${section.exercise.id}`}>
          <header className="exercise-card-header"><ExerciseImage imageKey={section.exercise.imageKey} name={section.exercise.name} size="large" /><div><h2>{section.exercise.name}</h2><strong className="daily-total">{total(section.exercise, section.total)}</strong></div></header>
          <ExerciseNote exercise={section.exercise} />
          <div className="set-list">
            {section.sets.map((set, index) => editingSet?.id === set.id ? <SetForm key={set.id} exercise={section.exercise} day={day} existing={set} onSaved={() => void saved()} onCancel={() => setEditingSet(null)} /> : <div className="set-row" key={set.id}>
              <span className="set-number">{index + 1}</span>
              <time>{set.time}</time>
              <strong>{formatMeasurement(set)}</strong>
              <span className="resistance-label">{formatResistance(set)}</span>
              <div className="row-actions"><button className="icon-button" aria-label={`Edit set ${index + 1}`} onClick={() => { setAddingTo(null); setEditingSet(set); }}><Pencil /></button><button className="icon-button danger" aria-label={`Delete set ${index + 1}`} onClick={() => void removeSet(section.exercise, set)}><Trash2 /></button></div>
            </div>)}
          </div>
          {addingTo === section.exercise.id ? <SetForm exercise={section.exercise} day={day} onSaved={() => void saved()} onCancel={() => setAddingTo(null)} /> : <button className="add-set" onClick={() => { setEditingSet(null); setAddingTo(section.exercise.id); }}><Plus />Add set</button>}
        </section>)}

        {pendingExercise && <section className="exercise-card pending-card"><header className="exercise-card-header"><ExerciseImage imageKey={pendingExercise.imageKey} name={pendingExercise.name} size="large" /><div><h2>{pendingExercise.name}</h2><span className="daily-total">New today</span></div></header><ExerciseNote exercise={pendingExercise} /><SetForm exercise={pendingExercise} day={day} onSaved={() => void saved()} onCancel={() => setPendingExercise(null)} /></section>}
      </div>
      {pickerOpen && <ExercisePicker presentIds={[...presentIds, ...(pendingExercise ? [pendingExercise.id] : [])]} onClose={() => setPickerOpen(false)} onChoose={(exercise) => { setPickerOpen(false); setPendingExercise(exercise); setAddingTo(null); setEditingSet(null); }} />}
    </main>
  );
}
