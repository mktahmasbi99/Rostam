import { MoreVertical, NotebookPen, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ActivityEntry, ActivityNoteGroup, DailyNote } from "../lib/types";
import { Modal } from "./Modal";
import { ReadState } from "./ReadState";

type Cursor = { startedAt: string; id: number } | null;
type View = { kind: "overview" } | { kind: "daily-history" } | { kind: "activity-history"; group: ActivityNoteGroup } | { kind: "daily-note"; note: DailyNote } | { kind: "activity-note"; note: ActivityEntry };
const dateLabel = (day: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
const localTime = (startedAt: string) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(startedAt));

export function NotesPage() {
  const [view, setView] = useState<View>({ kind: "overview" });
  const [daily, setDaily] = useState<DailyNote[]>([]);
  const [groups, setGroups] = useState<ActivityNoteGroup[]>([]);
  const [history, setHistory] = useState<(DailyNote | ActivityEntry)[]>([]);
  const [dailyCursor, setDailyCursor] = useState<string | null>(null);
  const [activityCursor, setActivityCursor] = useState<Cursor>(null);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [writeError, setWriteError] = useState("");
  const scrollPosition = useRef(0);
  const originView = useRef<View>({ kind: "overview" });
  const menuRef = useRef<HTMLDivElement>(null);
  const entry = view.kind === "daily-note" || view.kind === "activity-note" ? view.note : null;
  const isActivity = view.kind === "activity-note";
  const body = entry ? (isActivity ? (entry as ActivityEntry).note : (entry as DailyNote).body) : "";

  const loadOverview = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [dailyPage, activityGroups] = await Promise.all([api.dailyNotes({ limit: 5 }), api.activityNoteGroups()]);
      setDaily(dailyPage.items); setDailyCursor(dailyPage.nextBeforeDate); setGroups(activityGroups);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load notes."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (view.kind === "overview") void loadOverview(); }, [view.kind, loadOverview]);

  async function openHistory() {
    setView({ kind: "daily-history" }); setHistory([]); setPageError(""); setPageLoading(true);
    try {
      const page = await api.dailyNotes({ limit: 30 });
      setHistory(page.items); setDailyCursor(page.nextBeforeDate);
    } catch (caught) { setPageError(caught instanceof Error ? caught.message : "Could not load daily notes."); }
    finally { setPageLoading(false); }
  }
  async function openActivity(group: ActivityNoteGroup) {
    setView({ kind: "activity-history", group }); setHistory([]); setActivityCursor(null); setPageError(""); setPageLoading(true);
    try {
      const page = await api.activityNotes({ activityId: group.activityId, limit: 30 });
      setHistory(page.items); setActivityCursor(page.nextBeforeStartedAt && page.nextBeforeId !== null ? { startedAt: page.nextBeforeStartedAt, id: page.nextBeforeId } : null);
    } catch (caught) { setPageError(caught instanceof Error ? caught.message : "Could not load activity notes."); }
    finally { setPageLoading(false); }
  }
  async function loadOlder() {
    if (pageLoading) return;
    setPageLoading(true); setPageError("");
    try {
      if (view.kind === "daily-history" && dailyCursor) {
        const page = await api.dailyNotes({ beforeDate: dailyCursor, limit: 30 });
        setHistory((items) => [...items, ...page.items]); setDailyCursor(page.nextBeforeDate);
      } else if (view.kind === "activity-history" && activityCursor) {
        const page = await api.activityNotes({ activityId: view.group.activityId, beforeStartedAt: activityCursor.startedAt, beforeId: activityCursor.id, limit: 30 });
        setHistory((items) => [...items, ...page.items]); setActivityCursor(page.nextBeforeStartedAt && page.nextBeforeId !== null ? { startedAt: page.nextBeforeStartedAt, id: page.nextBeforeId } : null);
      }
    } catch (caught) { setPageError(caught instanceof Error ? caught.message : "Could not load older notes."); }
    finally { setPageLoading(false); }
  }
  function openNote(note: DailyNote | ActivityEntry, activity: boolean) {
    scrollPosition.current = window.scrollY; originView.current = view; setDraft(activity ? (note as ActivityEntry).note : (note as DailyNote).body);
    setEditing(false); setWriteError(""); setView(activity ? { kind: "activity-note", note: note as ActivityEntry } : { kind: "daily-note", note: note as DailyNote });
  }
  const back = useCallback(() => {
    if (editing) { setDraft(body); setEditing(false); setWriteError(""); return; }
    if (deleteOpen) { setDeleteOpen(false); return; }
    setView(originView.current); requestAnimationFrame(() => window.scrollTo(0, scrollPosition.current));
  }, [body, deleteOpen, editing]);
  useEffect(() => {
    if (!entry) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (menuOpen) { setMenuOpen(false); return; }
      back();
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [entry, back, menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [menuOpen]);
  async function saveNote() {
    if (!entry) return;
    setSaving(true); setWriteError("");
    try {
      if (isActivity) await api.updateActivityNote((entry as ActivityEntry).id, draft);
      else await api.updateDailyNote((entry as DailyNote).date, draft);
      if (!draft.trim()) {
        setEditing(false);
        setHistory((items) => items.filter((item) => isActivity ? (item as ActivityEntry).id !== (entry as ActivityEntry).id : (item as DailyNote).date !== (entry as DailyNote).date));
        if (!isActivity) setDaily((items) => items.filter((item) => item.date !== (entry as DailyNote).date));
        setView(originView.current);
        return;
      }
      const updated = isActivity ? { ...(entry as ActivityEntry), note: draft } : { ...(entry as DailyNote), body: draft };
      setView(isActivity ? { kind: "activity-note", note: updated as ActivityEntry } : { kind: "daily-note", note: updated as DailyNote });
      setEditing(false);
      setHistory((items) => items.map((item) => (isActivity ? (item as ActivityEntry).id === (entry as ActivityEntry).id : (item as DailyNote).date === (entry as DailyNote).date) ? updated : item));
      if (!isActivity) setDaily((items) => items.map((item) => item.date === (entry as DailyNote).date ? updated as DailyNote : item));
    } catch (caught) { setWriteError(caught instanceof Error ? caught.message : "Could not save note."); }
    finally { setSaving(false); }
  }
  async function deleteNote() {
    if (!entry) return;
    setSaving(true); setWriteError("");
    try {
      if (isActivity) await api.updateActivityNote((entry as ActivityEntry).id, "");
      else await api.deleteDailyNote((entry as DailyNote).date);
      setDeleteOpen(false);
      setHistory((items) => items.filter((item) => isActivity ? (item as ActivityEntry).id !== (entry as ActivityEntry).id : (item as DailyNote).date !== (entry as DailyNote).date));
      setView(originView.current);
    } catch (caught) { setWriteError(caught instanceof Error ? caught.message : "Could not delete note."); setDeleteOpen(false); }
    finally { setSaving(false); }
  }

  return <main className={"page notes-page " + (entry ? "notes-detail-page" : "")}>
    {view.kind === "overview" && <>
      <header className="section-title"><h1>Notes</h1><p>Browse and manage daily and activity notes.</p></header>
      <ReadState loading={loading} error={error} hasData={!loading || Boolean(daily.length || groups.length)} onRetry={() => void loadOverview()} loadingText="Loading notes…" />
      {!loading && !error && <>
        <section className="notes-group"><h2>Daily notes</h2>{daily.length ? <div className={"notes-preview " + (dailyCursor ? "has-more" : "")} onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) openHistory(); }} role="group" aria-label="Daily notes collection">
          <div className="journal-list">{daily.map((note) => <button key={note.date} onClick={() => openNote(note, false)}><strong>{dateLabel(note.date)}</strong><span>{note.body.replace(/\s+/g, " ")}</span></button>)}</div>
          {dailyCursor && <button className="notes-view-all" onClick={openHistory}>View all daily notes</button>}
        </div> : <p className="empty-copy">No daily notes yet.</p>}</section>
        <section className="notes-group"><h2>Activity notes</h2>{groups.length ? <div className="activity-note-groups">{groups.map((group) => <button className="activity-note-group" key={group.activityId} onClick={() => void openActivity(group)}><NotebookPen /><span><strong>{group.activityName}</strong><small>{group.noteCount} {group.noteCount === 1 ? "note" : "notes"} · latest {dateLabel(group.latestStartedAt.slice(0, 10))}</small></span></button>)}</div> : <p className="empty-copy">No activity notes yet.</p>}</section>
      </>}
    </>}
    {view.kind === "daily-history" && <><header className="section-title"><button className="icon-button notes-back" aria-label="Back to Notes" onClick={back}><X /></button><h1>Daily notes</h1></header>{pageLoading && !history.length && <p className="loading" role="status">Loading daily notes…</p>}<div className="journal-list">{history.map((item) => { const note = item as DailyNote; return <button key={note.date} onClick={() => openNote(note, false)}><strong>{dateLabel(note.date)}</strong><span>{note.body.replace(/\s+/g, " ")}</span></button>; })}</div>{!history.length && !pageLoading && !pageError && <p className="empty-copy">No daily notes yet.</p>}{pageError && <p className="error" role="alert">{pageError} <button className="text-button" onClick={() => void openHistory()}>Retry</button></p>}{dailyCursor && <button className="secondary" disabled={pageLoading} onClick={() => void loadOlder()}>{pageLoading ? "Loading older notes…" : "Load older notes"}</button>}</>}
    {view.kind === "activity-history" && <><header className="section-title"><button className="icon-button notes-back" aria-label="Back to Notes" onClick={back}><X /></button><h1>{view.group.activityName}</h1></header><div className="journal-list">{history.map((item) => { const note = item as ActivityEntry; return <button key={note.id} onClick={() => openNote(note, true)}><strong>{dateLabel(note.date)} · {localTime(note.startedAt)}</strong><span>{note.note.replace(/\s+/g, " ")}</span></button>; })}</div>{pageLoading && !history.length && <p>Loading notes…</p>}{!history.length && !pageLoading && !pageError && <p className="empty-copy">No activity notes yet.</p>}{pageError && <p className="error" role="alert">{pageError} <button className="text-button" onClick={() => history.length ? void loadOlder() : void openActivity(view.group)}>Retry</button></p>}{activityCursor && <button className="secondary" disabled={pageLoading} onClick={() => void loadOlder()}>{pageLoading ? "Loading older notes…" : "Load older notes"}</button>}</>}
    {entry && <>
      <div className="notes-reader-toolbar"><button className="icon-button" aria-label="Close note" onClick={back}><X /></button>{editing ? <div className="notes-edit-actions"><button className="secondary" onClick={back} disabled={saving}>Cancel</button><button className="primary" onClick={() => void saveNote()} disabled={saving}>{saving ? "Saving…" : "Save"}</button></div> : <div className="notes-reader-actions"><button className="icon-button" aria-label="Edit note" onClick={() => { setDraft(body); setEditing(true); }}><Pencil /></button><div className="notes-kebab" ref={menuRef}><button className="icon-button" aria-label="Note options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreVertical /></button>{menuOpen && <div className="notes-kebab-menu open" role="menu"><button role="menuitem" className="danger-text" onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}>Delete</button></div>}</div></div>}</div>
      <article className="notes-reader"><h1>{isActivity ? (entry as ActivityEntry).activityName : "Daily note"}</h1><time>{dateLabel(entry.date)}{isActivity ? " · " + localTime((entry as ActivityEntry).startedAt) : ""}</time>{editing ? <><textarea className="notes-reader-editor" aria-label="Note" maxLength={20000} value={draft} disabled={saving} onChange={(event) => setDraft(event.target.value)} autoFocus /><small className="notes-character-count">{draft.length.toLocaleString()} / 20,000</small></> : <div className="notes-reader-body">{body}</div>}{writeError && <p className="error" role="alert">{writeError}</p>}</article>
    </>}
    {deleteOpen && <Modal title="Delete note?" onClose={() => setDeleteOpen(false)}><div className="stack"><p>Delete this {isActivity ? "activity" : "daily"} note? This cannot be undone.</p>{writeError && <p className="error" role="alert">{writeError}</p>}<div className="form-actions"><button className="secondary" disabled={saving} onClick={() => setDeleteOpen(false)}>Cancel</button><button className="danger-button" disabled={saving} onClick={() => void deleteNote()}>{saving ? "Deleting…" : "Delete note"}</button></div></div></Modal>}
  </main>;
}
