import { Activity, Archive, Check, MoreVertical, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Activity as ActivityDefinition } from "../lib/types";
import { useOutsideClick } from "../lib/useOutsideClick";
import { ActivityDefinitionActionDialog, type ActivityDefinitionAction } from "./ActivityDefinitionActionDialog";
import { ReadState } from "./ReadState";

export function ActivitiesPage() {
  const [active, setActive] = useState<ActivityDefinition[]>([]);
  const [archived, setArchived] = useState<ActivityDefinition[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<{ activity: ActivityDefinition; action: ActivityDefinitionAction } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setOpenMenuId(null), []);
  useOutsideClick(menuRef, openMenuId !== null, closeMenu);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activeItems, archivedItems] = await Promise.all([api.activities("active"), api.activities("archived")]);
      setActive(activeItems);
      setArchived(archivedItems);
      setLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load activities.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, retry]);

  async function saveName(activity: ActivityDefinition) {
    const nextName = editingName.trim();
    if (!nextName) return;
    setError("");
    try {
      await api.updateActivityDefinition(activity.id, nextName);
      setEditingId(null);
      setEditingName("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rename activity.");
    }
  }

  async function confirmActivityAction(activity: ActivityDefinition, action: ActivityDefinitionAction) {
    setError("");
    if (action === "archive") await api.archiveActivity(activity.id);
    else if (action === "restore") await api.restoreActivity(activity.id);
    else await api.deleteActivityDefinition(activity.id, "DELETE");
    await load();
  }

  function activityRow(activity: ActivityDefinition, isArchived = false) {
    const isEditing = editingId === activity.id;
    const isMenuOpen = openMenuId === activity.id;
    return <article className="management-row activity-library-row" key={activity.id}>
      {isEditing ? <form className="activity-library-edit" onSubmit={(event) => { event.preventDefault(); void saveName(activity); }}>
        <input aria-label={`Activity name for ${activity.name}`} value={editingName} maxLength={100} onChange={(event) => setEditingName(event.target.value)} autoFocus />
        <button className="icon-button" type="submit" aria-label={`Save ${activity.name}`} title="Save" disabled={!editingName.trim()}><Check /></button>
        <button className="icon-button" type="button" aria-label="Cancel activity name edit" title="Cancel" onClick={() => { setEditingId(null); setEditingName(""); }}><X /></button>
      </form> : <div className="activity-library-main"><Activity aria-hidden="true" /><span><strong>{activity.name}</strong><small>{isArchived ? "Archived activity" : "Timed activity"}</small></span></div>}
      {!isEditing && <div className="row-actions">
        <button className="icon-button" aria-label={`Rename ${activity.name}`} title="Rename activity" onClick={() => { setEditingId(activity.id); setEditingName(activity.name); setError(""); }}><Pencil /></button>
        <div className="exercise-actions-menu" ref={isMenuOpen ? menuRef : null}>
          <button className="icon-button" aria-label={`More actions for ${activity.name}`} aria-haspopup="menu" aria-expanded={isMenuOpen} onClick={() => setOpenMenuId(isMenuOpen ? null : activity.id)}><MoreVertical /></button>
          {isMenuOpen && <div className="exercise-actions-popover activity-library-actions" role="menu">
            <button className="icon-button" aria-label={`${isArchived ? "Restore" : "Archive"} ${activity.name}`} title={isArchived ? "Restore" : "Archive"} role="menuitem" onClick={() => { setOpenMenuId(null); setPendingAction({ activity, action: isArchived ? "restore" : "archive" }); }}>
              {isArchived ? <RotateCcw /> : <Archive />}
            </button>
            <button className="icon-button danger" aria-label={`Delete ${activity.name} permanently`} title="Delete permanently" role="menuitem" onClick={() => { setOpenMenuId(null); setPendingAction({ activity, action: "delete" }); }}><Trash2 /></button>
          </div>}
        </div>
      </div>}
    </article>;
  }

  return <main className="page activities-page">
    <header className="section-title card-heading"><div><h1>Activities</h1><p>Manage names used by timed activity sessions.</p></div></header>
    <ReadState loading={loading} error={error} hasData={loaded} onRetry={() => setRetry((value) => value + 1)} loadingText="Loading activities…" />
    {loaded && <><section className="management-section"><h2>Active</h2><div className="management-list">{active.map((activity) => activityRow(activity))}{!loading && !error && active.length === 0 && <p className="empty-copy">No active activities.</p>}</div></section>
      <details className="management-section"><summary><h2>Archived</h2></summary>{archived.length === 0 ? <p className="empty-copy">No archived activities.</p> : <div className="management-list">{archived.map((activity) => activityRow(activity, true))}</div>}</details></>}
    {pendingAction && <ActivityDefinitionActionDialog activityName={pendingAction.activity.name} action={pendingAction.action} onClose={() => setPendingAction(null)} onConfirm={() => confirmActivityAction(pendingAction.activity, pendingAction.action)} />}
  </main>;
}
