import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ActivityEntry, DailyNote } from "../lib/types";
import { DailyJournal } from "./DailyJournal";
import { ReadState } from "./ReadState";

export function NotesPage({ today, onChooseDay }: { today: string; onChooseDay: (day: string) => void }) {
  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [activityNotes, setActivityNotes] = useState<ActivityEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [creatingToday, setCreatingToday] = useState(false);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const [daily, activities] = await Promise.all([api.dailyNotes(), api.activityNotes()]);
      if (currentRequest !== requestId.current) return;
      setNotes(daily); setActivityNotes(activities); setLoaded(true);
    } catch (caught) {
      if (currentRequest === requestId.current) setError(caught instanceof Error ? caught.message : "Could not load notes.");
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const todayNote = notes.find((note) => note.date === today)?.body ?? null;

  return <main className="page">
    <header className="section-title"><h1>Notes</h1><p>Daily notes and activity notes, newest first.</p></header>
    <div className="page-create-action"><button className="notes-create-icon" aria-label="Add daily note for today" title="Add daily note for today" onClick={() => setCreatingToday(true)}><Plus /></button></div>
    <ReadState loading={loading} error={error} hasData={loaded} onRetry={() => void refresh()} loadingText="Loading notes…" />
    {loaded && <><section className="notes-group"><h2>Daily notes</h2><div className="journal-list">{notes.length ? notes.map((note) => <button key={note.date} onClick={() => onChooseDay(note.date)}><strong>{note.date}</strong><span>{note.body.replace(/\s+/g, " ").slice(0, 160)}</span></button>) : <p className="empty-copy">No daily notes yet.</p>}</div></section>
    <section className="notes-group"><h2>Activity notes</h2><div className="journal-list">{activityNotes.length ? activityNotes.map((entry) => <button key={`activity-${entry.id}`} onClick={() => onChooseDay(entry.date)}><strong>{entry.activityName} · {entry.date} · {entry.startedAt.slice(11, 16)}</strong><span>{entry.note.replace(/\s+/g, " ").slice(0, 160)}</span></button>) : <p className="empty-copy">No activity notes yet.</p>}</div></section></>}
    {creatingToday && <DailyJournal day={today} today={today} note={todayNote} photoCount={0} onChanged={() => void refresh()} openOnMount hideActions />}
  </main>;
}
