import { Archive, Check, MoreVertical, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import type { Exercise, MeasurementType } from "../lib/types";
import { useOutsideClick } from "../lib/useOutsideClick";
import { equipmentLabels, exerciseMuscleLabel } from "../lib/format";
import { ExerciseEditor } from "./ExerciseEditor";
import { ExerciseImage } from "./ExerciseImage";
import { Modal } from "./Modal";
import { ReadState } from "./ReadState";

export function ExercisesPage() {
  const [active, setActive] = useState<Exercise[]>([]);
  const [archived, setArchived] = useState<Exercise[]>([]);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [viewing, setViewing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 275);
  const [immediateQuery, setImmediateQuery] = useState<string | null>(null);
  const searchQuery = immediateQuery ?? debouncedQuery;
  const [filter, setFilter] = useState<"" | MeasurementType>("");
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [readRetry, setReadRetry] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const exerciseSearchController = useRef<AbortController | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setOpenMenuId(null), []);
  useOutsideClick(menuRef, openMenuId !== null, closeMenu);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const requests = [api.exercises("active", searchQuery, filter, signal)];
      if (archivedExpanded) requests.push(api.exercises("archived", searchQuery, filter, signal));
      const [activeItems, archivedItems] = await Promise.all(requests);
      setActive(activeItems);
      if (archivedItems) setArchived(archivedItems);
      setLoaded(true);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : "Could not load exercises.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [archivedExpanded, searchQuery, filter]);

  useEffect(() => {
    const controller = new AbortController();
    exerciseSearchController.current = controller;
    void load(controller.signal);
    return () => controller.abort();
  }, [load, readRetry]);

  async function archiveExercise(exercise: Exercise) {
    if (!window.confirm(`Archive ${exercise.name}? Its history will remain available.`)) return;
    try {
      await api.archiveExercise(exercise.id);
      setEditing(null);
      setViewing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not archive exercise.");
    }
  }

  async function remove(exercise: Exercise) {
    const confirmation = window.prompt(
      `Permanently delete ${exercise.name}? This will delete all workout history for this exercise.\n\nArchiving is safer and keeps its history.\n\nType DELETE to continue.`,
    );
    if (confirmation === null) return;
    try { await api.deleteExercise(exercise.id, confirmation); setEditing(null); setViewing(null); await load(); }
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
    <ReadState loading={loading} error={error} hasData={loaded} onRetry={() => setReadRetry((value) => value + 1)} loadingText="Loading exercises…" />
    <label className="search-box"><Search /><span className="sr-only">Search exercises</span><input type="search" placeholder="Search exercises" value={query} onChange={(event) => { exerciseSearchController.current?.abort(); setImmediateQuery(null); setQuery(event.target.value); }} /></label>
    <div className="exercise-filter-toolbar"><div className="filter-row" aria-label="Measurement filter"><button className={!filter ? "selected" : ""} onClick={() => { setImmediateQuery(query); setFilter(""); }}>All</button><button className={filter === "repetitions" ? "selected" : ""} onClick={() => { setImmediateQuery(query); setFilter("repetitions"); }}>Reps</button><button className={filter === "duration" ? "selected" : ""} onClick={() => { setImmediateQuery(query); setFilter("duration"); }}>Duration</button><button className={filter === "timed_repetitions" ? "selected" : ""} onClick={() => { setImmediateQuery(query); setFilter("timed_repetitions"); }}>Timed reps</button></div><button className="rotation-create-icon" aria-label="Create exercise" title="Create exercise" onClick={() => setCreating(true)}><Plus /></button></div>
    {loaded && <><section className="management-section"><h2>Active</h2><div className="management-list">{active.map((exercise) => exerciseRow(exercise))}{!loading && !error && active.length === 0 && <p className="empty-copy">No matching active exercises.</p>}</div></section>
    <details className="management-section" onToggle={(event) => setArchivedExpanded(event.currentTarget.open)}><summary><h2>Archived</h2></summary>{archived.length === 0 ? <p className="empty-copy">No archived exercises.</p> : <div className="management-list">{archived.map((exercise) => exerciseRow(exercise, true))}</div>}</details></>}
    {viewing && <Modal title={viewing.name} onClose={() => setViewing(null)} wide groupHeaderActionWithClose headerAction={!viewing.archivedAt ? <button className="icon-button" aria-label={`Edit ${viewing.name}`} title="Edit exercise" onClick={() => { setEditing(viewing); setViewing(null); }}><Pencil /></button> : null}>
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
    {editing && <Modal title={`Edit ${editing.name}`} titleHidden closePositionLeft onClose={() => setEditing(null)} wide headerAction={<div className="exercise-edit-header-actions">{actionsMenu(editing)}<button className="rotation-save-button" type="submit" form="exercise-editor-form" aria-label="Save exercise" title="Save exercise"><Check /></button></div>}><ExerciseEditor exercise={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /></Modal>}
    {creating && <Modal title="New exercise" onClose={() => setCreating(false)} wide><ExerciseEditor onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} /></Modal>}
  </main>;
}
