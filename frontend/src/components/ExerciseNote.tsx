import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";

interface Props {
  exercise: Exercise;
}

function trailingPunctuation(value: string): [string, string] {
  let link = value;
  let trailing = "";
  while (/[.,!?;:]$/.test(link)) {
    trailing = link.slice(-1) + trailing;
    link = link.slice(0, -1);
  }
  for (const [opening, closing] of [["(", ")"], ["[", "]"], ["{", "}"]] as const) {
    while (link.endsWith(closing) && link.split(closing).length > link.split(opening).length) {
      trailing = closing + trailing;
      link = link.slice(0, -1);
    }
  }
  return [link, trailing];
}

export function ExerciseNoteText({ body }: { body: string }) {
  const parts: ReactNode[] = [];
  const pattern = /https?:\/\/[^\s<]+/gi;
  let cursor = 0;
  for (const match of body.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(body.slice(cursor, index));
    const [link, trailing] = trailingPunctuation(match[0]);
    parts.push(<a href={link} target="_blank" rel="noreferrer" key={`${index}-${link}`}>{link}</a>);
    if (trailing) parts.push(trailing);
    cursor = index + match[0].length;
  }
  if (cursor < body.length) parts.push(body.slice(cursor));
  return <p className="exercise-note-body">{parts}</p>;
}

export function ExerciseNote({ exercise }: Props) {
  const [body, setBody] = useState(exercise.exerciseNote ?? "");
  const [draft, setDraft] = useState(body);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = exercise.exerciseNote ?? "";
    setBody(next);
    setDraft(next);
  }, [exercise.exerciseNote]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const saved = await api.updateExerciseNote(exercise.id, draft);
      const next = saved.exerciseNote ?? "";
      setBody(next);
      setDraft(next);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save exercise note.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return <form className="exercise-note-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label>Exercise note<textarea rows={5} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
      {error && <p className="save-error" role="alert">{error}</p>}
      <div className="exercise-note-actions">
        <button type="button" className="secondary" disabled={saving} onClick={() => { setDraft(body); setError(""); setEditing(false); }}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : "Save note"}</button>
      </div>
    </form>;
  }

  if (!body) {
    return <button className="add-exercise-note" onClick={() => { setDraft(""); setEditing(true); }}>Add exercise note</button>;
  }

  return <section className="exercise-note" aria-label={`Exercise note for ${exercise.name}`}>
    <div className="exercise-note-heading"><strong>Exercise note</strong><button className="icon-button" aria-label={`Edit exercise note for ${exercise.name}`} onClick={() => { setDraft(body); setEditing(true); }}><Pencil /></button></div>
    <ExerciseNoteText body={body} />
  </section>;
}
