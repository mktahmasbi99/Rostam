import { ImagePlus, NotebookPen, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { DailyPhoto } from "../lib/types";
import { Modal } from "./Modal";

export function DailyJournal({ day, today, note, photoCount, onChanged }: { day: string; today: string; note: string | null; photoCount: number; onChanged: () => void }) {
  const [mode, setMode] = useState<"note" | "photos" | null>(null);
  const [draft, setDraft] = useState(note ?? "");
  const [photos, setPhotos] = useState<DailyPhoto[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editable = day <= today;
  const close = useCallback(() => setMode(null), []);
  useEffect(() => { setDraft(note ?? ""); }, [note]);
  useEffect(() => { if (mode === "photos") void api.dayPhotos(day).then(setPhotos).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load photos.")); }, [day, mode]);
  async function saveNote() { setSaving(true); setError(""); try { await api.updateDailyNote(day, draft); setMode(null); onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save note."); } finally { setSaving(false); } }
  async function upload(files: FileList | null) { if (!files?.length) return; setSaving(true); setError(""); try { setPhotos(await api.uploadPhotos(day, [...files])); onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not upload photos."); } finally { setSaving(false); if (input.current) input.current.value = ""; } }
  async function remove(photo: DailyPhoto) { if (!window.confirm("Delete this photo? This cannot be undone.")) return; try { await api.deletePhoto(photo.id); setPhotos((current) => current.filter((item) => item.id !== photo.id)); onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete photo."); } }
  async function deleteNote() { if (!window.confirm("Delete this daily note?")) return; setSaving(true); setError(""); try { await api.deleteDailyNote(day); close(); onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete note."); } finally { setSaving(false); } }
  return <section className="daily-journal"><div><strong>Daily note</strong><p>Private notes and photos for this date.</p></div><div className="journal-actions"><button aria-label="Open daily note" className={note ? "journal-active" : ""} onClick={() => setMode("note")}><NotebookPen /><span>Note</span></button><button aria-label="Open daily photos" className={photoCount ? "journal-active" : ""} onClick={() => setMode("photos")}><ImagePlus /><span>Photos</span></button></div>{mode === "note" && <Modal title="Daily note" onClose={close}><form className="journal-editor" onSubmit={(event) => { event.preventDefault(); void saveNote(); }}><label>Note<textarea autoFocus rows={10} maxLength={20000} value={draft} disabled={!editable || saving} onChange={(event) => setDraft(event.target.value)} /></label><small>{draft.length.toLocaleString()} / 20,000</small>{error && <p className="error" role="alert">{error}</p>}<div className="draft-actions">{note && editable && <button type="button" className="danger" disabled={saving} onClick={() => void deleteNote()}><Trash2 />Delete</button>}<button type="button" onClick={close}>Cancel</button>{editable && <button className="primary" disabled={saving}>{saving ? "Saving…" : "Save note"}</button>}</div></form></Modal>}{mode === "photos" && <Modal title="Daily photos" onClose={close}><div className="photo-dialog">{editable && <><input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" multiple onChange={(event) => void upload(event.target.files)} /><button className="primary" disabled={saving || photoCount >= 10} onClick={() => input.current?.click()}><ImagePlus />{saving ? "Uploading…" : "Add photos"}</button><p>{photos.length} of 10 photos</p></>}{error && <p className="error" role="alert">{error}</p>}<div className="photo-grid">{photos.map((photo) => <figure key={photo.id}><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.thumbnailUrl} alt={`Photo from ${day}`} /></a>{editable && <button className="icon-button danger" aria-label="Delete photo" onClick={() => void remove(photo)}><Trash2 /></button>}</figure>)}</div></div></Modal>}</section>;
}
