import { Check, Clock3, MoreVertical, NotebookPen, Pencil, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { activityTime, activityTimeOnly, minuteOfDay, timeFromMinuteOfDay } from "../lib/activityTime";
import type { ActivityEntry as Entry } from "../lib/types";
import { useOutsideClick } from "../lib/useOutsideClick";
import { Modal } from "./Modal";
import { TimeWheelField } from "./TimeWheelField";
import { ActivityNotePreview } from "./ActivityNotePreview";

const localNow = (timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
};
const suggestedEnd = (startedAt: string, timezone: string) => {
  const startMinute = minuteOfDay(activityTimeOnly(startedAt));
  const now = localNow(timezone).slice(11, 16);
  return minuteOfDay(now) > startMinute ? now : `${String(Math.floor((startMinute + 1) / 60)).padStart(2, "0")}:${String((startMinute + 1) % 60).padStart(2, "0")}`;
};
const durationLabel = (seconds: number) => {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export function ActivityEntryCard({ entry, activities = [], onChanged, timezone }: { entry: Entry; activities?: Entry[]; onChanged: () => void; timezone: string }) {
  const [now, setNow] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [renamingActivity, setRenamingActivity] = useState(false);
  const [activityNameDraft, setActivityNameDraft] = useState(entry.activityName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const closeOptions = useCallback(() => setMenuOpen(false), []);
  useOutsideClick(optionsRef, menuOpen, closeOptions);
  const [end, setEnd] = useState("");
  const [start, setStart] = useState(activityTimeOnly(entry.startedAt));
  const [note, setNote] = useState(entry.note);
  const [error, setError] = useState("");
  const started = new Date(entry.startedAt).getTime();
  const active = entry.endedAt === null;
  const currentLocal = localNow(timezone);
  const blockedIntervals = activities
    .filter((other) => other.id !== entry.id && other.activityId === entry.activityId)
    .map((other) => {
      const startMinute = minuteOfDay(activityTimeOnly(other.startedAt));
      const endMinute = other.endedAt
        ? minuteOfDay(activityTimeOnly(other.endedAt))
        : other.date === currentLocal.slice(0, 10)
          ? Math.max(startMinute + 1, minuteOfDay(currentLocal.slice(11, 16)))
          : 24 * 60;
      return { startMinute, endMinute };
    })
    .filter((interval) => interval.endMinute > interval.startMinute);
  const startMinute = minuteOfDay(start);
  const blockedEndIntervals = blockedIntervals
    .filter((interval) => startMinute < interval.startMinute && startMinute < interval.endMinute)
    .map((interval) => ({ startMinute: interval.startMinute + 1, endMinute: 24 * 60 }));
  useEffect(() => {
    setNote(entry.note);
  }, [entry.id, entry.note]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const canStop = now >= started;
  const updateStartTime = (next: string) => {
    setStart(next);
    if (minuteOfDay(end) <= minuteOfDay(next)) setEnd(timeFromMinuteOfDay(minuteOfDay(next) + 1));
  };

  async function saveFinish() {
    setError("");
    try { await api.finishActivity(entry.id, activityTime(entry.date, start), activityTime(entry.date, end), entry.note); setFinishing(false); onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save activity."); }
  }
  async function saveEdit() {
    setError("");
    try { await api.updateActivity(entry.id, activityTime(entry.date, start), activityTime(entry.date, end), note); setEditing(false); onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update activity."); }
  }
  async function deleteEntry() {
    setError("");
    try {
      await api.deleteActivity(entry.id);
      setConfirmDelete(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete activity.");
    }
  }
  async function saveActivityName() {
    const nextName = activityNameDraft.trim();
    if (!nextName || nextName === entry.activityName) return;
    setError("");
    try {
      await api.updateActivityDefinition(entry.activityId, nextName);
      setRenamingActivity(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rename activity.");
    }
  }
  async function saveNote() {
    setError("");
    try {
      const saved = await api.updateActivityNote(entry.id, note);
      setNote(saved.note);
      setEditingNote(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save note.");
    }
  }
  function closeNote() {
    setNote(entry.note);
    setEditingNote(false);
  }
  return <article className="activity-entry">
    <div className="activity-entry-heading"><strong className="entry-kind-title"><Clock3 className="entry-kind-icon" aria-hidden="true" /><span>{entry.activityName}</span></strong><div className="row-actions">
      {active && <button className="activity-stop-button" aria-label={`Stop ${entry.activityName}`} title="Stop session" disabled={!canStop} onClick={() => { const startTime = activityTimeOnly(entry.startedAt); setStart(startTime); setEnd(suggestedEnd(entry.startedAt, timezone)); setFinishing(true); }}><Square /></button>}
      <div className="activity-options" ref={optionsRef}><button className="icon-button" aria-label={`${entry.activityName} options`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><MoreVertical /></button>{menuOpen && <div className="activity-options-menu" role="menu"><button type="button" className="activity-menu-item" role="menuitem" aria-label="Rename activity" title="Rename activity" onClick={() => { setMenuOpen(false); setActivityNameDraft(entry.activityName); setError(""); setRenamingActivity(true); }}><Pencil aria-hidden="true" /></button><button type="button" className="activity-menu-item danger-text" role="menuitem" aria-label="Delete session" title="Delete session" onClick={() => { setMenuOpen(false); setError(""); setConfirmDelete(true); }}><Trash2 aria-hidden="true" /></button></div>}</div>
    </div></div>
    {active ? <div className="activity-entry-time">{entry.startedAt.slice(11, 16)} – In progress</div> : <button type="button" className="activity-entry-time activity-time-trigger" aria-label={`Edit time for ${entry.activityName}`} onClick={() => { setStart(activityTimeOnly(entry.startedAt)); setEnd(activityTimeOnly(entry.endedAt!)); setNote(entry.note); setError(""); setEditing(true); }}>{entry.startedAt.slice(11, 16)}–{entry.endedAt!.slice(11, 16)} · {durationLabel(entry.durationSeconds ?? 0)}</button>}
    {note ? <section className="activity-note" aria-label={`Activity note for ${entry.activityName}`}><div className="exercise-note-heading"><strong>Activity note</strong><button type="button" className="icon-button" aria-label="Edit activity note" onClick={() => setEditingNote(true)}><Pencil /></button></div><ActivityNotePreview key={entry.id} note={note} /></section> : <button type="button" className="activity-add-note" onClick={() => { setNote(""); setEditingNote(true); }}><NotebookPen aria-hidden="true" /><span>Add activity note</span></button>}
    {error && !finishing && !editing && !editingNote && !renamingActivity && !confirmDelete && <p className="error" role="alert">{error}</p>}
    {confirmDelete && <Modal title={`Delete ${entry.activityName} session?`} onClose={() => setConfirmDelete(false)}><div className="stack"><p>Delete the {entry.activityName} session from {entry.date}? This cannot be undone.</p>{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="danger-button" onClick={() => void deleteEntry()}><Trash2 />Delete session</button></div></div></Modal>}
    {renamingActivity && <Modal title="Rename activity" onClose={() => setRenamingActivity(false)} dirtyLabel="Activity name"><div className="stack"><label>Activity name<input autoFocus maxLength={100} value={activityNameDraft} onChange={(event) => setActivityNameDraft(event.target.value)} /></label><p className="empty-copy">This name is used by past and future sessions.</p>{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={() => setRenamingActivity(false)}>Cancel</button><button className="primary" disabled={!activityNameDraft.trim() || activityNameDraft.trim() === entry.activityName} onClick={() => void saveActivityName()}><Check />Save name</button></div></div></Modal>}
    {editingNote && <Modal title={`${note ? "Edit" : "Add"} activity note · ${entry.activityName}`} onClose={closeNote} dirtyLabel="Activity note"><div className="stack"><label>Activity note<textarea autoFocus rows={5} maxLength={20000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Techniques, moves, or an important takeaway" /></label>{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={closeNote}>Cancel</button><button className="primary" onClick={() => void saveNote()}><Check />Save note</button></div></div></Modal>}
    {finishing && <Modal title={`Finish ${entry.activityName}`} onClose={() => setFinishing(false)} dirtyLabel="Activity session"><div className="stack"><TimeWheelField label="Start time" value={start} onChange={updateStartTime} max={1438} blockedIntervals={blockedIntervals} /><TimeWheelField label="End time" value={end} onChange={setEnd} min={minuteOfDay(start) + 1} blockedIntervals={blockedEndIntervals} />{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={() => setFinishing(false)}><X />Cancel</button><button className="primary" disabled={minuteOfDay(end) <= minuteOfDay(start)} onClick={() => void saveFinish()}><Check />Save session</button></div></div></Modal>}
    {editing && <Modal title={`Edit ${entry.activityName}`} onClose={() => setEditing(false)} dirtyLabel="Activity session"><div className="stack"><TimeWheelField label="Start time" value={start} onChange={updateStartTime} max={1438} blockedIntervals={blockedIntervals} /><TimeWheelField label="End time" value={end} onChange={setEnd} min={minuteOfDay(start) + 1} blockedIntervals={blockedEndIntervals} />{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={() => setEditing(false)}>Cancel</button><button className="primary" disabled={minuteOfDay(end) <= minuteOfDay(start)} onClick={() => void saveEdit()}><Check />Save changes</button></div></div></Modal>}
  </article>;
}
