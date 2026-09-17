import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { PhotoGroup } from "../lib/types";

export function PhotosPage({ onChooseDay }: { onChooseDay: (day: string) => void }) {
  const [groups, setGroups] = useState<PhotoGroup[]>([]); const [error, setError] = useState("");
  useEffect(() => { void api.photos().then(setGroups).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load photos.")); }, []);
  return <main className="page"><header className="section-title"><h1>Photos</h1><p>Private daily photos, newest first.</p></header>{error && <p className="error" role="alert">{error}</p>}{groups.length ? groups.map((group) => <section className="photo-history" key={group.date}><button className="photo-date" onClick={() => onChooseDay(group.date)}>{group.date}</button><div className="photo-grid">{group.photos.map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.thumbnailUrl} alt={`Photo from ${group.date}`} /></a>)}</div></section>) : <p className="empty-copy">No daily photos yet.</p>}</main>;
}
