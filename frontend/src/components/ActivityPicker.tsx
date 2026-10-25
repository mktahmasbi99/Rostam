import { Archive, Check, ChevronDown, MoreVertical, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { activityTime } from "../lib/activityTime";
import { useOutsideClick } from "../lib/useOutsideClick";
import type { Activity } from "../lib/types";
import { Modal } from "./Modal";
import { TimeWheelField } from "./TimeWheelField";
import { ReadState } from "./ReadState";

function zonedNow(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
function suggestedStart(day: string, timezone: string) {
  const now = zonedNow(timezone);
  return `${now.hour}:${now.minute}`;
}

function activityKey(name: string) {
  return name.normalize("NFKD").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

export function ActivityPicker({ day, timezone, onClose, onStarted }: { day: string; timezone: string; onClose: () => void; onStarted: () => void }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [archived, setArchived] = useState<Activity[]>([]);
  const [name, setName] = useState("");
  const [start, setStart] = useState(suggestedStart(day, timezone));
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setOpenMenuId(null), []);
  useOutsideClick(menuRef, openMenuId !== null, closeMenu);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activeItems, archivedItems] = await Promise.all([
        api.activities("active"),
        api.activities("archived"),
      ]);
      const activeNames = new Set(activeItems.map((activity) => activityKey(activity.name)));
      setActivities(activeItems);
      setArchived(archivedItems.filter((activity) => !activeNames.has(activityKey(activity.name))));
      setLoaded(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load activities."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load, loadRetry]);

  async function create() {
    setError("");
    try {
      await api.createActivity(name);
      await load();
      setCreating(false);
      setName("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create activity."); }
  }

  async function begin(activity: Activity) {
    setError("");
    try { await api.startActivity(activity.id, activityTime(day, start)); onStarted(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start activity."); }
  }

  async function saveName(activity: Activity) {
    setError("");
    try {
      await api.updateActivityDefinition(activity.id, editingName);
      setEditingId(null);
      setEditingName("");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update activity."); }
  }

  async function changeArchiveState(activity: Activity, archivedActivity: boolean) {
    setError("");
    try {
      if (archivedActivity) await api.restoreActivity(activity.id);
      else await api.archiveActivity(activity.id);
      setOpenMenuId(null);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update activity."); }
  }

  async function remove(activity: Activity) {
    const confirmation = window.prompt(
      `Permanently delete ${activity.name}? This also deletes all session history. Archiving keeps its history. Type DELETE to continue.`,
    );
    if (confirmation !== "DELETE") return;
    setError("");
    try {
      await api.deleteActivityDefinition(activity.id, confirmation);
      setOpenMenuId(null);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete activity."); }
  }

  function activityRow(activity: Activity, archivedActivity = false) {
    const isEditing = editingId === activity.id;
    const isMenuOpen = openMenuId === activity.id;
    return <article className="exercise-result-row activity-result-row" key={activity.id}>
      {isEditing ? <form className="activity-edit-form" onSubmit={(event) => { event.preventDefault(); void saveName(activity); }}>
        <input aria-label={`Activity name for ${activity.name}`} value={editingName} maxLength={100} onChange={(event) => setEditingName(event.target.value)} autoFocus />
        <button className="icon-button" type="submit" aria-label={`Save ${activity.name}`} title="Save" disabled={!editingName.trim()}><Check /></button>
        <button className="icon-button" type="button" aria-label="Cancel activity name edit" title="Cancel" onClick={() => { setEditingId(null); setEditingName(""); }}><X /></button>
      </form> : <button className="exercise-result" disabled={archivedActivity} onClick={() => void begin(activity)}>
        <span><strong>{activity.name}</strong><small>{archivedActivity ? "Archived" : "Start timed session"}</small></span>
      </button>}
      {!isEditing && <div className="row-actions activity-result-actions">
        <button className="icon-button" aria-label={`Edit ${activity.name}`} title="Edit" onClick={() => { setEditingId(activity.id); setEditingName(activity.name); setOpenMenuId(null); }}><Pencil /></button>
        <div className="exercise-actions-menu" ref={isMenuOpen ? menuRef : null}>
          <button className="icon-button" aria-label={`More actions for ${activity.name}`} aria-haspopup="menu" aria-expanded={isMenuOpen} onClick={() => setOpenMenuId(isMenuOpen ? null : activity.id)}><MoreVertical /></button>
          {isMenuOpen && <div className="exercise-actions-popover" role="menu">
            {archivedActivity ? <button className="icon-button" aria-label={`Restore ${activity.name}`} title="Restore" role="menuitem" onClick={() => void changeArchiveState(activity, true)}><RotateCcw /></button> : <button className="icon-button" aria-label={`Archive ${activity.name}`} title="Archive" role="menuitem" onClick={() => void changeArchiveState(activity, false)}><Archive /></button>}
            <button className="icon-button danger" aria-label={`Delete ${activity.name} permanently`} title="Delete permanently" role="menuitem" onClick={() => void remove(activity)}><Trash2 /></button>
          </div>}
        </div>
      </div>}
    </article>;
  }

  return <Modal title="Add timed activity" onClose={onClose}>
    <div className="stack"><TimeWheelField label="Start time" value={start} onChange={setStart} max={1438} />
      {!creating ? <button className="secondary icon-only-action" aria-label="New activity" title="New activity" onClick={() => setCreating(true)}><Plus /></button> : <div className="activity-create"><label>Activity name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="BJJ – No Gi" maxLength={100} /></label><button className="primary" disabled={!name.trim()} onClick={() => void create()}>Create</button></div>}
      <ReadState loading={loading} error={error} hasData={loaded} onRetry={() => setLoadRetry((value) => value + 1)} loadingText="Loading activities…" />
      <div className="exercise-results">{loaded && activities.map((activity) => activityRow(activity))}{loaded && !loading && activities.length === 0 && !error && <p className="empty-copy">Create an activity to get started.</p>}{loaded && archived.length > 0 && <details className="archived-activity-results"><summary>Archived activities<ChevronDown aria-hidden="true" /></summary><div>{archived.map((activity) => activityRow(activity, true))}</div></details>}</div>
    </div>
  </Modal>;
}
