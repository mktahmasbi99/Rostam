import { Archive, Check, ChevronDown, ChevronUp, MoreVertical, Pencil, Plus, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Exercise, Rotation } from "../lib/types";
import { exerciseMuscleLabel } from "../lib/format";
import { useOutsideClick } from "../lib/useOutsideClick";
import { ExerciseImage } from "./ExerciseImage";
import { ExerciseEditor } from "./ExerciseEditor";
import { Modal } from "./Modal";
import { ReadState } from "./ReadState";

export function RotationsPage() {
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [archived, setArchived] = useState<Rotation[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [draftMemberIds, setDraftMemberIds] = useState<number[]>([]);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [choosingExerciseFor, setChoosingExerciseFor] = useState<number | null>(null);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [lookbacks, setLookbacks] = useState<Record<number, string>>({});
  const [historyMessages, setHistoryMessages] = useState<Record<number, string>>({});
  const [loadingRecommendations, setLoadingRecommendations] = useState<Record<number, boolean>>({});
  const [chooseDifferentFirst, setChooseDifferentFirst] = useState(false);
  const [firstIds, setFirstIds] = useState<Record<number, string>>({});
  const [creatingExerciseFor, setCreatingExerciseFor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const loadRequestId = useRef(0);
  const [rotationActionSuccess, setRotationActionSuccess] = useState<"activated" | "deactivated" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setOpenMenuId(null), []);
  useOutsideClick(menuRef, openMenuId !== null, closeMenu);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError("");
    try {
      const [items, archivedItems, library] = await Promise.all([
        api.rotations("active"), api.rotations("archived"), api.exercises("active"),
      ]);
      if (requestId !== loadRequestId.current) return;
      setRotations(items);
      setArchived(archivedItems);
      setExercises(library);
      setLoaded(true);
    } catch (caught) { if (requestId === loadRequestId.current) setError(caught instanceof Error ? caught.message : "Could not load rotations."); }
    finally { if (requestId === loadRequestId.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, loadRetry]);

  async function change(action: () => Promise<unknown>) {
    try { await action(); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update rotation."); }
  }
  async function createRotation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const created = await api.createRotation(name.trim());
      setCreating(false);
      setName("");
      await load();
      setDetailId(created.id);
      setEditing(true);
      setEditingName(created.name);
      setDraftMemberIds([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create rotation."); }
  }
  function occurrenceLabels(ids: number[]) {
    const counts = new Map<number, number>();
    return ids.map((id) => {
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      return { count, total: ids.filter((item) => item === id).length };
    });
  }
  async function setMembers(rotation: Rotation, ids: number[]) {
    setDraftMemberIds(ids);
  }
  async function applyHistoryRange(rotation: Rotation) {
    const days = Number(lookbacks[rotation.id] ?? "7");
    if (!Number.isInteger(days) || days < 1) return;
    setLoadingRecommendations((current) => ({ ...current, [rotation.id]: true }));
    try {
      const items = await api.rotationRecommendations(days);
      if (items.length === 0) {
        setHistoryMessages((current) => ({
          ...current,
          [rotation.id]: `No exercises found in the last ${days} days. Choose exercises below instead.`,
        }));
        return;
      }
      setDraftMemberIds(items.map((item) => item.exercise.id));
      setHistoryMessages((current) => ({ ...current, [rotation.id]: "" }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load exercise history."); }
    finally { setLoadingRecommendations((current) => ({ ...current, [rotation.id]: false })); }
  }

  function rotationMenu(rotation: Rotation, isArchived = false) {
    const isOpen = openMenuId === rotation.id;
    return <div className="exercise-actions-menu" ref={isOpen ? menuRef : null}>
      <button className="icon-button" aria-label={`More actions for ${rotation.name}`} aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setOpenMenuId(isOpen ? null : rotation.id)}><MoreVertical /></button>
      {isOpen && <div className="exercise-actions-popover" role="menu">
        {isArchived
          ? <button className="icon-button" aria-label={`Restore ${rotation.name}`} title="Restore" role="menuitem" onClick={() => { setOpenMenuId(null); void change(() => api.restoreRotation(rotation.id)); }}><RotateCcw /></button>
          : <button className="icon-button" aria-label={`Archive ${rotation.name}`} title="Archive" role="menuitem" onClick={() => { setOpenMenuId(null); void change(() => api.archiveRotation(rotation.id)); }}><Archive /></button>}
        <button className="icon-button danger" aria-label={`Delete ${rotation.name} permanently`} title="Delete permanently" role="menuitem" onClick={() => {
          setOpenMenuId(null);
          if (window.confirm(`Permanently delete ${rotation.name}? Workout history will stay.`)) void change(() => api.deleteRotation(rotation.id));
        }}><Trash2 /></button>
      </div>}
    </div>;
  }

  function openDetails(rotation: Rotation, edit = false) {
    setDetailId(rotation.id);
    setEditing(edit);
    setEditingName(rotation.name);
    setDraftMemberIds(rotation.members.map((member) => member.exercise.id));
    setChooseDifferentFirst(false);
  }
  function closeDetails() {
    const rotationToClose = [...rotations, ...archived].find((rotation) => rotation.id === detailId);
    if (editing && rotationToClose) {
      setEditing(false);
      setEditingName(rotationToClose.name);
      setDraftMemberIds(rotationToClose.members.map((member) => member.exercise.id));
      setChooseDifferentFirst(false);
    } else {
      setDetailId(null);
      setEditing(false);
    }
    setChoosingExerciseFor(null);
    setCreatingExerciseFor(null);
    setRotationActionSuccess(null);
  }
  function rotationCard(rotation: Rotation, isArchived = false) {
    const memberIds = rotation.members.map((member) => member.exercise.id);
    const labels = occurrenceLabels(memberIds);
    return <section className="management-section rotation-card rotation-summary-card" key={rotation.id}>
      <button className="rotation-card-open" aria-label={`Open ${rotation.name}`} onClick={() => openDetails(rotation)} />
      <div className="rotation-heading">
        <h2>{rotation.name}<span className="rotation-count-badge">{rotation.members.length} {rotation.members.length === 1 ? "exercise" : "exercises"}</span>{rotation.active && <span className="rotation-badge">Active</span>}{isArchived && <span className="rotation-archived-badge">Archived</span>}</h2>
        <div className="row-actions">
          {!isArchived && <button className="icon-button" aria-label={`View ${rotation.name}`} title="View rotation" onClick={() => openDetails(rotation)}><Pencil /></button>}
          {rotationMenu(rotation, isArchived)}
        </div>
      </div>
      <div className="rotation-preview-button">
        {rotation.members.length ? <div className={`rotation-preview ${rotation.members.length > 3 ? "has-more" : ""}`}>
          <div className="rotation-preview-list">{rotation.members.map((member, index) => {
            const occurrence = labels[index].total > 1 ? ` · ${labels[index].count}` : "";
            const muscles = exerciseMuscleLabel(member.exercise);
            return <div className="rotation-preview-row" key={member.position ?? index}>
              <ExerciseImage imageKey={member.exercise.imageKey} name={member.exercise.name} />
              <span className="rotation-preview-copy"><strong>{member.exercise.name}{occurrence}</strong>{muscles && <small>{muscles}</small>}</span>
              {rotation.active && rotation.duePosition === index && <small>{rotation.resolvedToday === "completed" ? "Added today" : rotation.resolvedToday === "skipped" ? "Skipped today" : "Due today"}</small>}
            </div>;
          })}</div>
        </div> : <span className="rotation-empty-summary">No exercises yet</span>}
      </div>
    </section>;
  }

  const selectedRotation = [...rotations, ...archived].find((rotation) => rotation.id === detailId) ?? null;
  const selectedIsArchived = selectedRotation ? archived.some((rotation) => rotation.id === selectedRotation.id) : false;
  const serverMemberIds = selectedRotation?.members.map((member) => member.exercise.id) ?? [];
  const memberIds = editing ? draftMemberIds : serverMemberIds;
  const displayMembers = editing && selectedRotation
    ? memberIds.map((id, index) => ({ exercise: exercises.find((exercise) => exercise.id === id) ?? selectedRotation.members.find((member) => member.exercise.id === id)?.exercise, position: index })).filter((member): member is { exercise: Exercise; position: number } => Boolean(member.exercise))
    : selectedRotation?.members ?? [];
  const labels = occurrenceLabels(memberIds);
  const memberCountLabel = `${memberIds.length} ${memberIds.length === 1 ? "exercise" : "exercises"}`;
  const selectedFirst = selectedRotation ? firstIds[selectedRotation.id] ?? "" : "";

  return <main className="page rotations-page">
    <header className="section-title card-heading">
      <div><h1>Rotations</h1><p>Arrange exercises in the order you want to revisit them.</p></div>
    </header>
    <ReadState loading={loading} error={error} hasData={loaded} onRetry={() => setLoadRetry((value) => value + 1)} loadingText="Loading rotations…" />
    {loaded && rotations.length === 0 && !loading && !error && <p className="empty-copy">Create a rotation to keep an ordered list of exercises.</p>}
    {loaded && rotations.map((rotation) => rotationCard(rotation))}
    {archived.length > 0 && <details className="archived-activity-results archived-rotation-results"><summary>Archived rotations<ChevronDown aria-hidden="true" /></summary><div>{archived.map((rotation) => rotationCard(rotation, true))}</div></details>}

    {creating && <Modal title="Create rotation" onClose={() => setCreating(false)}>
      <form className="rotation-create-form" data-update-dirty="rotation-create" data-update-dirty-label="New rotation" onSubmit={(event) => void createRotation(event)}>
        <label>Rotation name<input autoFocus required value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="For example, Morning" /></label>
        <div className="draft-actions"><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={!name.trim()} type="submit">Create</button></div>
      </form>
    </Modal>}

    {selectedRotation && <Modal title={`${selectedRotation.name}${selectedRotation.active ? " · Active" : ""}`} onClose={closeDetails} dirtyLabel={editing ? "Rotation editor" : undefined} fullScreen closePositionLeft titleHidden headerAction={editing && !selectedIsArchived ? <button className="rotation-save-button" aria-label="Done" title="Done" onClick={() => void (async () => {
      try {
        const trimmedName = editingName.trim();
        if (!trimmedName) { setError("Enter a rotation name."); return; }
        if (trimmedName !== selectedRotation.name) await api.renameRotation(selectedRotation.id, trimmedName);
        await api.setRotationMembers(selectedRotation.id, memberIds);
        await load();
        setDetailId(null);
        setEditing(false);
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save rotation."); }
    })()}><Check /></button> : <div className="rotation-detail-header-actions">{!selectedIsArchived && <button className="icon-button" aria-label={`Edit ${selectedRotation.name}`} title="Edit rotation" onClick={() => openDetails(selectedRotation, true)}><Pencil /></button>}{rotationMenu(selectedRotation, selectedIsArchived)}</div>}>
      {!editing && <h2 className="rotation-detail-title">{selectedRotation.name}<span className="rotation-count-badge">{memberCountLabel}</span></h2>}
      {editing && !selectedIsArchived && <>
        <label className="rotation-name-field"><span>Rotation name<span className="rotation-count-badge">{memberCountLabel}</span></span><input value={editingName} maxLength={100} onChange={(event) => setEditingName(event.target.value)} /></label>
        {memberIds.length === 0 && <div className="rotation-recommendations">
          <h3><Sparkles /> Build from recent exercises</h3>
          <div className="rotation-lookback"><label>Look back (days)<input type="number" min="1" step="1" aria-label={`Look back days for ${selectedRotation.name}`} value={lookbacks[selectedRotation.id] ?? "7"} onChange={(event) => setLookbacks((current) => ({ ...current, [selectedRotation.id]: event.target.value }))} /></label>
            <button className="primary" disabled={loadingRecommendations[selectedRotation.id] || !Number.isInteger(Number(lookbacks[selectedRotation.id] ?? "7")) || Number(lookbacks[selectedRotation.id] ?? "7") < 1} onClick={() => void applyHistoryRange(selectedRotation)}>{loadingRecommendations[selectedRotation.id] ? "Loading…" : "Use range"}</button>
          </div>
          {loadingRecommendations[selectedRotation.id] && <p className="empty-copy" role="status">Checking recent exercises…</p>}
          {historyMessages[selectedRotation.id] && <p className="notice" role="status">{historyMessages[selectedRotation.id]}</p>}
        </div>}
      </>}

      {displayMembers.length > 0 ? <div className={editing ? "management-list rotation-editor-list" : "management-list rotation-detail-list"}>
        {displayMembers.map((member, index) => {
          const occurrence = labels[index].total > 1 ? ` · ${labels[index].count}` : "";
          const label = `${member.exercise.name}${occurrence}`;
          const muscles = exerciseMuscleLabel(member.exercise);
          return <article className="management-row" key={member.position ?? index}>
            <ExerciseImage imageKey={member.exercise.imageKey} name={member.exercise.name} />
            <div><strong>{label}</strong>{muscles && <small>{muscles}</small>}{selectedRotation.active && selectedRotation.duePosition === index && <small>{selectedRotation.resolvedToday === "completed" ? "Added today" : selectedRotation.resolvedToday === "skipped" ? "Skipped today" : "Due today"}</small>}</div>
            {editing && !selectedIsArchived && <div className="row-actions">
              <button className="icon-button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => { const next = [...memberIds]; [next[index], next[index - 1]] = [next[index - 1], next[index]]; void setMembers(selectedRotation, next); }}><ChevronUp /></button>
              <button className="icon-button" aria-label={`Move ${label} down`} disabled={index === memberIds.length - 1} onClick={() => { const next = [...memberIds]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; void setMembers(selectedRotation, next); }}><ChevronDown /></button>
              <button className="icon-button" aria-label={`Remove ${label}`} onClick={() => void setMembers(selectedRotation, memberIds.filter((_, memberIndex) => memberIndex !== index))}><Trash2 /></button>
            </div>}
          </article>;
        })}
      </div> : !editing && <p className="empty-copy">No exercises in this rotation yet.</p>}

      {!editing && !selectedIsArchived && <div className="rotation-activate">
        {memberIds.length > 0 && !selectedRotation.active && <label className="rotation-first-toggle"><input type="checkbox" role="switch" checked={chooseDifferentFirst} onChange={(event) => setChooseDifferentFirst(event.target.checked)} /><span>Choose a different starting exercise</span></label>}
        {chooseDifferentFirst && !selectedRotation.active && <label>Due first <select value={selectedFirst} onChange={(event) => setFirstIds((current) => ({ ...current, [selectedRotation.id]: event.target.value }))}><option value="">Choose exercise</option>{displayMembers.map((member, index) => <option key={index} value={index}>{member.exercise.name}{labels[index].total > 1 ? ` · ${labels[index].count}` : ""}</option>)}</select></label>}
        {!selectedRotation.active && <button className="primary" disabled={!memberIds.length || (chooseDifferentFirst && selectedFirst === "")} onClick={() => void (async () => {
          try {
            await api.activateRotation(selectedRotation.id, chooseDifferentFirst ? Number(selectedFirst) : 0);
            await load();
            setRotationActionSuccess("activated");
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            setRotationActionSuccess(null);
          } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not activate rotation."); }
        })()}>Activate</button>}
        {selectedRotation.active && <button className="secondary" onClick={() => void (async () => {
          try {
            await api.deactivateRotation(selectedRotation.id);
            await load();
            setRotationActionSuccess("deactivated");
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            setRotationActionSuccess(null);
          } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not deactivate rotation."); }
        })()}>Deactivate</button>}
      </div>}
      {editing && !selectedIsArchived && <>
      <button className="rotation-add-trigger" aria-label={`Add exercise to ${selectedRotation.name}`} onClick={() => { setExerciseQuery(""); setChoosingExerciseFor(selectedRotation.id); }}><Plus /><span>Add exercise</span></button>
      </>}
      {rotationActionSuccess && <div className={`rotation-activation-success ${rotationActionSuccess}`} role="status" aria-live="polite"><div className="rotation-activation-check"><Check /></div><strong>{selectedRotation.name} {rotationActionSuccess}</strong></div>}
    </Modal>}
    {choosingExerciseFor !== null && selectedRotation?.id === choosingExerciseFor && <Modal title={`Add to ${selectedRotation.name}`} onClose={() => { setChoosingExerciseFor(null); setExerciseQuery(""); }} wide>
      <div className="rotation-exercise-picker">
        <label className="search-box rotation-picker-search"><Search /><span className="sr-only">Search exercises</span><input type="search" placeholder="Search exercises" value={exerciseQuery} onChange={(event) => setExerciseQuery(event.target.value)} autoFocus /></label>
        <div className="exercise-results">{exercises.filter((exercise) => `${exercise.name} ${exerciseMuscleLabel(exercise)}`.toLocaleLowerCase().includes(exerciseQuery.trim().toLocaleLowerCase())).map((exercise) => {
          const muscles = exerciseMuscleLabel(exercise);
          return <button key={exercise.id} className="exercise-result" aria-label={`Add ${exercise.name} to ${selectedRotation.name}`} onClick={() => {
            setDraftMemberIds((current) => [...current, exercise.id]);
            setChoosingExerciseFor(null);
            setExerciseQuery("");
          }}><ExerciseImage imageKey={exercise.imageKey} name={exercise.name} /><span><strong>{exercise.name}</strong>{muscles && <small>{muscles}</small>}</span></button>;
        })}{!exercises.some((exercise) => `${exercise.name} ${exerciseMuscleLabel(exercise)}`.toLocaleLowerCase().includes(exerciseQuery.trim().toLocaleLowerCase())) && <p className="empty-copy">No exercises match your search.</p>}</div>
        <button className="primary rotation-picker-new" onClick={() => { setChoosingExerciseFor(null); setExerciseQuery(""); setCreatingExerciseFor(selectedRotation.id); }}><Plus />Create New Exercise</button>
      </div>
    </Modal>}
    {creatingExerciseFor !== null && <Modal title="New exercise" onClose={() => setCreatingExerciseFor(null)} wide><ExerciseEditor onCancel={() => setCreatingExerciseFor(null)} onSaved={(exercise) => {
      const rotation = selectedRotation?.id === creatingExerciseFor ? selectedRotation : null;
      setCreatingExerciseFor(null);
      setExercises((current) => [...current.filter((item) => item.id !== exercise.id), exercise]);
      if (rotation) setDraftMemberIds((current) => [...current, exercise.id]);
      else void load();
    }} /></Modal>}
    <div className="page-create-action floating-create-action"><button className="rotation-create-icon" aria-label="Create rotation" title="Create rotation" onClick={() => { setCreating(true); setName(""); }}><Plus /></button></div>
  </main>;
}
