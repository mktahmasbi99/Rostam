import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { PhotoGroup } from "../lib/types";
import { ReadState } from "./ReadState";

export function PhotosPage({ onChooseDay }: { onChooseDay: (day: string) => void }) {
  const [groups, setGroups] = useState<PhotoGroup[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.photos(signal);
      if (signal?.aborted) return;
      setGroups(result);
      setLoaded(true);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "Could not load photos.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  return <main className="page"><header className="section-title"><h1>Photos</h1><p>Private daily photos, newest first.</p></header><ReadState loading={loading} error={error} hasData={loaded} onRetry={() => void load()} loadingText="Loading photos…" />{loaded && groups.length ? groups.map((group) => <section className="photo-history" key={group.date}><button className="photo-date" onClick={() => onChooseDay(group.date)}>{group.date}</button><div className="photo-grid">{group.photos.map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.thumbnailUrl} alt={`Photo from ${group.date}`} /></a>)}</div></section>) : loaded && !error ? <p className="empty-copy">No daily photos yet.</p> : null}</main>;
}
