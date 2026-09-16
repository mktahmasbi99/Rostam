import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";
import { ExerciseEditor } from "./ExerciseEditor";
import { ExerciseImage } from "./ExerciseImage";
import { Modal } from "./Modal";

export function ExercisesPage() {
  const [active, setActive] = useState<Exercise[]>([]);
  const [archived, setArchived] = useState<Exercise[]>([]);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [activeItems, archivedItems] = await Promise.all([api.exercises("active"), api.exercises("archived")]);
      setActive(activeItems);
      setArchived(archivedItems);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load exercises.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function archiveExercise(exercise: Exercise) {
    if (!window.confirm(`Archive ${exercise.name}? Its history will remain available.`)) return;
    await api.archiveExercise(exercise.id); await load();
  }

  async function remove(exercise: Exercise) {
    const confirmation = window.prompt(`Type DELETE to permanently remove ${exercise.name}.`);
    if (confirmation === null) return;
    try { await api.deleteExercise(exercise.id, confirmation); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete exercise."); }
  }

  return <main className="page exercises-page">
    <header className="section-title card-heading"><div><h1>Exercises</h1><p>Manage the exercise library, fixed equipment, and defaults.</p></div><button className="primary" onClick={() => setCreating(true)}><Plus />New</button></header>
    {error && <p className="error-panel" role="alert">{error}</p>}
    <section className="management-section"><h2>Active</h2><div className="management-list">{active.map((exercise) => <article key={exercise.id} className="management-row"><ExerciseImage imageKey={exercise.imageKey} name={exercise.name} /><div><strong>{exercise.name}</strong><small>{exercise.measurementType === "repetitions" ? "Repetitions" : "Duration"}</small></div><div className="row-actions"><button className="icon-button" aria-label={`Edit ${exercise.name}`} onClick={() => setEditing(exercise)}><Pencil /></button><button className="icon-button" aria-label={`Archive ${exercise.name}`} onClick={() => void archiveExercise(exercise)}><Archive /></button>{!exercise.hasHistory && <button className="icon-button danger" aria-label={`Delete ${exercise.name}`} onClick={() => void remove(exercise)}><Trash2 /></button>}</div></article>)}</div></section>
    <section className="management-section"><h2>Archived</h2>{archived.length === 0 ? <p className="empty-copy">No archived exercises.</p> : <div className="management-list">{archived.map((exercise) => <article key={exercise.id} className="management-row"><ExerciseImage imageKey={exercise.imageKey} name={exercise.name} /><div><strong>{exercise.name}</strong><small>History preserved</small></div><button className="icon-button" aria-label={`Restore ${exercise.name}`} onClick={async () => { await api.restoreExercise(exercise.id); await load(); }}><RotateCcw /></button></article>)}</div>}</section>
    {editing && <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)} wide><ExerciseEditor exercise={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /></Modal>}
    {creating && <Modal title="New exercise" onClose={() => setCreating(false)} wide><ExerciseEditor onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} /></Modal>}
  </main>;
}
