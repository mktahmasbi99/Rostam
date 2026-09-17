import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { DailyNote } from "../lib/types";

export function NotesPage({ onChooseDay }: { onChooseDay: (day: string) => void }) {
  const [notes, setNotes] = useState<DailyNote[]>([]); const [error, setError] = useState("");
  useEffect(() => { void api.dailyNotes().then(setNotes).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load notes.")); }, []);
  return <main className="page"><header className="section-title"><h1>Notes</h1><p>Private daily notes, newest first.</p></header>{error && <p className="error" role="alert">{error}</p>}<div className="journal-list">{notes.length ? notes.map((note) => <button key={note.date} onClick={() => onChooseDay(note.date)}><strong>{note.date}</strong><span>{note.body.replace(/\s+/g, " ").slice(0, 160)}</span></button>) : <p className="empty-copy">No daily notes yet.</p>}</div></main>;
}
