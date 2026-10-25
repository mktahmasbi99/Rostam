import { Check, MoreVertical, NotebookPen, Pencil, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { activityTime, activityTimeOnly, minuteOfDay, timeFromMinuteOfDay } from "../lib/activityTime";
import type { ActivityEntry as Entry } from "../lib/types";
import { useOutsideClick } from "../lib/useOutsideClick";
import { Modal } from "./Modal";
import { TimeWheelField } from "./TimeWheelField";

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
  return <article className="activity-entry">
    <div className="activity-entry-heading"><strong>{entry.activityName}</strong><div className="row-actions">
      <button className="icon-button" aria-label={`${entry.note ? "Edit" : "Add"} note for ${entry.activityName}`} title={entry.note ? "Edit session note" : "Add session note"} onClick={() => { setNote(entry.note); setEditingNote(true); }}><NotebookPen /></button>
      {active ? <button className="activity-stop-button" aria-label={`Stop ${entry.activityName}`} title="Stop session" disabled={!canStop} onClick={() => { const startTime = activityTimeOnly(entry.startedAt); setStart(startTime); setEnd(suggestedEnd(entry.startedAt, timezone)); setFinishing(true); }}><Square /></button> : <button className="icon-button" aria-label={`Edit ${entry.activityName}`} onClick={() => { setStart(activityTimeOnly(entry.startedAt)); setEnd(activityTimeOnly(entry.endedAt!)); setNote(entry.note); setEditing(true); }}><Pencil /></button>}
      <div className="activity-options" ref={optionsRef}><button className="icon-button" aria-label={`${entry.activityName} options`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><MoreVertical /></button>{menuOpen && <div className="activity-options-menu" role="menu"><button className="activity-delete-option" aria-label="Delete session" title="Delete session" role="menuitem" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}><Trash2 /></button></div>}</div>
    </div></div>
    <div className="activity-entry-time">{entry.startedAt.slice(11, 16)}{entry.endedAt ? `–${entry.endedAt.slice(11, 16)} · ${durationLabel(entry.durationSeconds ?? 0)}` : ` · ${canStop ? durationLabel(Math.floor((now - started) / 1000)) : `Starts at ${entry.startedAt.slice(11, 16)}`}`}</div>
    {entry.note && <p className="activity-entry-note">{entry.note}</p>}
    {error && !finishing && !editing && !editingNote && !confirmDelete && <p className="error" role="alert">{error}</p>}
    {confirmDelete && <Modal title={`Delete ${entry.activityName} session?`} onClose={() => setConfirmDelete(false)}><div className="stack"><p>Delete the {entry.activityName} session from {entry.date}? This cannot be undone.</p>{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="danger-button" onClick={() => void deleteEntry()}><Trash2 />Delete session</button></div></div></Modal>}
    {editingNote && <Modal title={`${entry.note ? "Edit" : "Add"} note · ${entry.activityName}`} onClose={() => setEditingNote(false)} dirtyLabel="Activity note"><div className="stack"><label>Session note<textarea autoFocus rows={5} maxLength={20000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Techniques, moves, or an important takeaway" /></label>{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={() => setEditingNote(false)}>Cancel</button><button className="primary" onClick={() => void saveNote()}><Check />Save note</button></div></div></Modal>}
    {finishing && <Modal title={`Finish ${entry.activityName}`} onClose={() => setFinishing(false)} dirtyLabel="Activity session"><div className="stack"><TimeWheelField label="Start time" value={start} onChange={updateStartTime} max={1438} blockedIntervals={blockedIntervals} /><TimeWheelField label="End time" value={end} onChange={setEnd} min={minuteOfDay(start) + 1} blockedIntervals={blockedEndIntervals} />{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={() => setFinishing(false)}><X />Cancel</button><button className="primary" disabled={minuteOfDay(end) <= minuteOfDay(start)} onClick={() => void saveFinish()}><Check />Save session</button></div></div></Modal>}
    {editing && <Modal title={`Edit ${entry.activityName}`} onClose={() => setEditing(false)} dirtyLabel="Activity session"><div className="stack"><TimeWheelField label="Start time" value={start} onChange={updateStartTime} max={1438} blockedIntervals={blockedIntervals} /><TimeWheelField label="End time" value={end} onChange={setEnd} min={minuteOfDay(start) + 1} blockedIntervals={blockedEndIntervals} />{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={() => setEditing(false)}>Cancel</button><button className="primary" disabled={minuteOfDay(end) <= minuteOfDay(start)} onClick={() => void saveEdit()}><Check />Save changes</button></div></div></Modal>}
  </article>;
}
