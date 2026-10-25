import { Archive, MoreVertical, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Exercise, MeasurementType } from "../lib/types";
import { useOutsideClick } from "../lib/useOutsideClick";
import { equipmentLabels, exerciseMuscleLabel } from "../lib/format";
import { ExerciseEditor } from "./ExerciseEditor";
import { ExerciseImage } from "./ExerciseImage";
import { Modal } from "./Modal";

export function ExercisesPage() {
  const [active, setActive] = useState<Exercise[]>([]);
  const [archived, setArchived] = useState<Exercise[]>([]);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [viewing, setViewing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"" | MeasurementType>("");
  const [error, setError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setOpenMenuId(null), []);
  useOutsideClick(menuRef, openMenuId !== null, closeMenu);

  const load = useCallback(async () => {
    setError("");
    try {
      const [activeItems, archivedItems] = await Promise.all([
        api.exercises("active", query, filter),
        api.exercises("archived", query, filter),
      ]);
      setActive(activeItems);
      setArchived(archivedItems);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load exercises.");
    }
  }, [filter, query]);

  useEffect(() => { void load(); }, [load]);

  async function archiveExercise(exercise: Exercise) {
    if (!window.confirm(`Archive ${exercise.name}? Its history will remain available.`)) return;
    await api.archiveExercise(exercise.id); await load();
  }

  async function remove(exercise: Exercise) {
    const confirmation = window.prompt(
      `Permanently delete ${exercise.name}? This will delete all workout history for this exercise.\n\nArchiving is safer and keeps its history.\n\nType DELETE to continue.`,
    );
    if (confirmation === null) return;
    try { await api.deleteExercise(exercise.id, confirmation); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete exercise."); }
    finally { setOpenMenuId(null); }
  }

  function actionsMenu(exercise: Exercise, archivedExercise = false) {
    const isOpen = openMenuId === exercise.id;
    return <div className="exercise-actions-menu" ref={isOpen ? menuRef : null}>
      <button className="icon-button" aria-label={`More actions for ${exercise.name}`} aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setOpenMenuId(isOpen ? null : exercise.id)}><MoreVertical /></button>
      {isOpen && <div className="exercise-actions-popover" role="menu">
        {archivedExercise ? <button className="icon-button" aria-label={`Restore ${exercise.name}`} title="Restore" role="menuitem" onClick={async () => { await api.restoreExercise(exercise.id); setOpenMenuId(null); await load(); }}><RotateCcw /></button> : <button className="icon-button" aria-label={`Archive ${exercise.name}`} title="Archive" role="menuitem" onClick={() => { setOpenMenuId(null); void archiveExercise(exercise); }}><Archive /></button>}
        <button className="icon-button danger" aria-label={`Delete ${exercise.name} permanently`} title="Delete permanently" role="menuitem" onClick={() => void remove(exercise)}><Trash2 /></button>
      </div>}
    </div>;
  }

  function exerciseRow(exercise: Exercise, archivedExercise = false) {
    const measurement = exercise.measurementType === "repetitions" ? "Reps" : exercise.measurementType === "duration" ? "Duration" : "Timed reps";
    return <article key={exercise.id} className="management-row exercise-library-row">
      <button className="exercise-row-main" aria-label={`View ${exercise.name}`} onClick={() => setViewing(exercise)}>
        <ExerciseImage imageKey={exercise.imageKey} name={exercise.name} />
        <span><strong>{exercise.name}</strong><small>{measurement}</small></span>
      </button>
      <div className="row-actions">
        {!archivedExercise && <button className="icon-button" aria-label={`Edit ${exercise.name}`} onClick={() => setEditing(exercise)}><Pencil /></button>}
        {actionsMenu(exercise, archivedExercise)}
      </div>
    </article>;
  }

  return <main className="page exercises-page">
    <header className="section-title card-heading"><div><h1>Exercises</h1><p>Manage the exercise library, fixed equipment, and defaults.</p></div></header>
    {error && <p className="error-panel" role="alert">{error}</p>}
    <label className="search-box"><Search /><span className="sr-only">Search exercises</span><input type="search" placeholder="Search exercises" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="exercise-filter-toolbar"><div className="filter-row" aria-label="Measurement filter"><button className={!filter ? "selected" : ""} onClick={() => setFilter("")}>All</button><button className={filter === "repetitions" ? "selected" : ""} onClick={() => setFilter("repetitions")}>Reps</button><button className={filter === "duration" ? "selected" : ""} onClick={() => setFilter("duration")}>Duration</button><button className={filter === "timed_repetitions" ? "selected" : ""} onClick={() => setFilter("timed_repetitions")}>Timed reps</button></div><button className="rotation-create-icon" aria-label="Create exercise" title="Create exercise" onClick={() => setCreating(true)}><Plus /></button></div>
    <section className="management-section"><h2>Active</h2><div className="management-list">{active.map((exercise) => exerciseRow(exercise))}</div></section>
    <section className="management-section"><h2>Archived</h2>{archived.length === 0 ? <p className="empty-copy">No archived exercises.</p> : <div className="management-list">{archived.map((exercise) => exerciseRow(exercise, true))}</div>}</section>
    {viewing && <Modal title={viewing.name} onClose={() => setViewing(null)} wide headerAction={!viewing.archivedAt ? <button className="icon-button" aria-label={`Edit ${viewing.name}`} title="Edit exercise" onClick={() => { setEditing(viewing); setViewing(null); }}><Pencil /></button> : null}>
      <div className="exercise-readonly">
        <div className="exercise-readonly-heading"><ExerciseImage imageKey={viewing.imageKey} name={viewing.name} /><strong>{viewing.name}</strong></div>
        <dl>
          <div><dt>Measurement</dt><dd>{viewing.measurementType === "repetitions" ? "Reps" : viewing.measurementType === "duration" ? "Duration" : "Timed reps"}</dd></div>
          <div><dt>Fixed equipment</dt><dd>{viewing.equipment === "other" ? viewing.customEquipment || "Other" : viewing.equipment ? equipmentLabels[viewing.equipment] : "None"}</dd></div>
          <div><dt>Bodyweight sets</dt><dd>{viewing.allowBodyweight ? "Allowed" : "Not allowed"}</dd></div>
          <div><dt>Muscle groups</dt><dd>{exerciseMuscleLabel(viewing) || "Not set"}</dd></div>
        </dl>
      </div>
    </Modal>}
    {editing && <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)} wide><ExerciseEditor exercise={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /></Modal>}
    {creating && <Modal title="New exercise" onClose={() => setCreating(false)} wide><ExerciseEditor onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} /></Modal>}
  </main>;
}
