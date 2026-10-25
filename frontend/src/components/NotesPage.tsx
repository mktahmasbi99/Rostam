import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ActivityEntry, DailyNote } from "../lib/types";
import { DailyJournal } from "./DailyJournal";

export function NotesPage({ today, onChooseDay }: { today: string; onChooseDay: (day: string) => void }) {
  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [activityNotes, setActivityNotes] = useState<ActivityEntry[]>([]);
  const [error, setError] = useState("");
  const [creatingToday, setCreatingToday] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [daily, activities] = await Promise.all([api.dailyNotes(), api.activityNotes()]);
      setNotes(daily); setActivityNotes(activities); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load notes."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const todayNote = notes.find((note) => note.date === today)?.body ?? null;

  return <main className="page">
    <header className="section-title"><h1>Notes</h1><p>Daily notes and activity notes, newest first.</p></header>
    <div className="page-create-action"><button className="notes-create-icon" aria-label="Add daily note for today" title="Add daily note for today" onClick={() => setCreatingToday(true)}><Plus /></button></div>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="notes-group"><h2>Daily notes</h2><div className="journal-list">{notes.length ? notes.map((note) => <button key={note.date} onClick={() => onChooseDay(note.date)}><strong>{note.date}</strong><span>{note.body.replace(/\s+/g, " ").slice(0, 160)}</span></button>) : <p className="empty-copy">No daily notes yet.</p>}</div></section>
    <section className="notes-group"><h2>Activity notes</h2><div className="journal-list">{activityNotes.length ? activityNotes.map((entry) => <button key={`activity-${entry.id}`} onClick={() => onChooseDay(entry.date)}><strong>{entry.activityName} · {entry.date} · {entry.startedAt.slice(11, 16)}</strong><span>{entry.note.replace(/\s+/g, " ").slice(0, 160)}</span></button>) : <p className="empty-copy">No activity notes yet.</p>}</div></section>
    {creatingToday && <DailyJournal day={today} today={today} note={todayNote} photoCount={0} onChanged={() => void refresh()} openOnMount hideActions />}
  </main>;
}
