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
  const [dailyCursor, setDailyCursor] = useState<string | null>(null);
  const [activityCursor, setActivityCursor] = useState<{ startedAt: string; id: number } | null>(null);
  const [dailyError, setDailyError] = useState(""); const [activityError, setActivityError] = useState("");
  const [dailyLoading, setDailyLoading] = useState(false); const [activityLoading, setActivityLoading] = useState(false);
  const dailyFailed = useRef<string | null>(null); const activityFailed = useRef<{ startedAt: string; id: number } | null>(null);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const [daily, activities] = await Promise.all([api.dailyNotes(), api.activityNotes()]);
      if (currentRequest !== requestId.current) return;
      setNotes(daily.items); setActivityNotes(activities.items); setDailyCursor(daily.nextBeforeDate);
      setActivityCursor(activities.nextBeforeStartedAt && activities.nextBeforeId !== null
        ? { startedAt: activities.nextBeforeStartedAt, id: activities.nextBeforeId } : null);
      dailyFailed.current = null; activityFailed.current = null; setLoaded(true);
    } catch (caught) {
      if (currentRequest === requestId.current) setError(caught instanceof Error ? caught.message : "Could not load notes.");
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  }, []);
  const loadOlderDaily = async (cursor = dailyFailed.current ?? dailyCursor) => {
    if (!cursor || dailyLoading) return;
    setDailyLoading(true); setDailyError(""); dailyFailed.current = cursor;
    try { const page = await api.dailyNotes({ beforeDate: cursor }); setNotes((current) => [...current, ...page.items]); setDailyCursor(page.nextBeforeDate); dailyFailed.current = null; }
    catch (caught) { setDailyError(caught instanceof Error ? caught.message : "Could not load older daily notes."); }
    finally { setDailyLoading(false); }
  };
  const loadOlderActivity = async (cursor = activityFailed.current ?? activityCursor) => {
    if (!cursor || activityLoading) return;
    setActivityLoading(true); setActivityError(""); activityFailed.current = cursor;
    try { const page = await api.activityNotes({ beforeStartedAt: cursor.startedAt, beforeId: cursor.id }); setActivityNotes((current) => [...current, ...page.items]); setActivityCursor(page.nextBeforeStartedAt && page.nextBeforeId !== null ? { startedAt: page.nextBeforeStartedAt, id: page.nextBeforeId } : null); activityFailed.current = null; }
    catch (caught) { setActivityError(caught instanceof Error ? caught.message : "Could not load older activity notes."); }
    finally { setActivityLoading(false); }
  };
  useEffect(() => { void refresh(); }, [refresh]);
  const todayNote = notes.find((note) => note.date === today)?.body ?? null;

  return <main className="page">
    <header className="section-title"><h1>Notes</h1><p>Daily notes and activity notes, newest first.</p></header>
    <ReadState loading={loading} error={error} hasData={loaded} onRetry={() => void refresh()} loadingText="Loading notes…" />
    {loaded && <><section className="notes-group"><h2>Daily notes</h2><div className="journal-list">{notes.length ? notes.map((note) => <button key={note.date} onClick={() => onChooseDay(note.date)}><strong>{note.date}</strong><span>{note.body.replace(/\s+/g, " ").slice(0, 160)}</span></button>) : <p className="empty-copy">No daily notes yet.</p>}</div>{dailyCursor && <button className="secondary" disabled={dailyLoading} onClick={() => void loadOlderDaily()}>{dailyLoading ? "Loading older notes…" : "Load older daily notes"}</button>}{dailyError && <p className="error" role="alert">{dailyError} <button className="text-button" onClick={() => void loadOlderDaily(dailyFailed.current)}>Retry</button></p>}</section>
    <section className="notes-group"><h2>Activity notes</h2><div className="journal-list">{activityNotes.length ? activityNotes.map((entry) => <button key={`activity-${entry.id}`} onClick={() => onChooseDay(entry.date)}><strong>{entry.activityName} · {entry.date} · {entry.startedAt.slice(11, 16)}</strong><span>{entry.note.replace(/\s+/g, " ").slice(0, 160)}</span></button>) : <p className="empty-copy">No activity notes yet.</p>}</div>{activityCursor && <button className="secondary" disabled={activityLoading} onClick={() => void loadOlderActivity()}>{activityLoading ? "Loading older notes…" : "Load older activity notes"}</button>}{activityError && <p className="error" role="alert">{activityError} <button className="text-button" onClick={() => void loadOlderActivity(activityFailed.current)}>Retry</button></p>}</section></>}
    {creatingToday && <DailyJournal day={today} today={today} note={todayNote} photoCount={0} onChanged={() => void refresh()} openOnMount hideActions />}
    <div className="page-create-action floating-create-action"><button className="notes-create-icon" aria-label="Add daily note for today" title="Add daily note for today" onClick={() => setCreatingToday(true)}><Plus /></button></div>
  </main>;
}
