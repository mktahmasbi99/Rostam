import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ActivityEntry, DailyNote } from "../lib/types";

export function NotesPage({ onChooseDay }: { onChooseDay: (day: string) => void }) {
  const [notes, setNotes] = useState<DailyNote[]>([]); const [activityNotes, setActivityNotes] = useState<ActivityEntry[]>([]); const [error, setError] = useState("");
  useEffect(() => { void Promise.all([api.dailyNotes(), api.activityNotes()]).then(([daily, activities]) => { setNotes(daily); setActivityNotes(activities); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load notes.")); }, []);
  return <main className="page"><header className="section-title"><h1>Notes</h1><p>Daily notes and activity notes, newest first.</p></header>{error && <p className="error" role="alert">{error}</p>}<section className="notes-group"><h2>Activity notes</h2><div className="journal-list">{activityNotes.length ? activityNotes.map((entry) => <button key={`activity-${entry.id}`} onClick={() => onChooseDay(entry.date)}><strong>{entry.activityName} · {entry.date} · {entry.startedAt.slice(11, 16)}</strong><span>{entry.note.replace(/\s+/g, " ").slice(0, 160)}</span></button>) : <p className="empty-copy">No activity notes yet.</p>}</div></section><section className="notes-group"><h2>Daily notes</h2><div className="journal-list">{notes.length ? notes.map((note) => <button key={note.date} onClick={() => onChooseDay(note.date)}><strong>{note.date}</strong><span>{note.body.replace(/\s+/g, " ").slice(0, 160)}</span></button>) : <p className="empty-copy">No daily notes yet.</p>}</div></section></main>;
}
