import { useContext, useState } from "react";
import { useLedgerImage } from "../hooks/useLedgerImage";
import type { DailyPhoto } from "../lib/types";
import { OfflineBrowsingContext } from "./dialogContext";
import { Modal } from "./Modal";

function FullOfflinePhoto({ photo, onClose }: { photo: DailyPhoto; onClose: () => void }) {
  const src = useLedgerImage(photo.url);
  return <Modal title={`Photo from ${photo.date}`} onClose={onClose} wide>
    {src ? <img className="offline-full-photo" src={src} alt={`Photo from ${photo.date}`} /> :
      <p role="status">{src === null ? "This photo is missing from the offline copy." : "Loading photo…"}</p>}
  </Modal>;
}

export function LedgerPhoto({ photo }: { photo: DailyPhoto }) {
  const offline = useContext(OfflineBrowsingContext);
  const thumbnail = useLedgerImage(photo.thumbnailUrl);
  const [full, setFull] = useState(false);
  const image = <img loading="lazy" src={thumbnail ?? undefined} alt={`Photo from ${photo.date}`} />;
  if (!offline && !full) return <a href={photo.url} target="_blank" rel="noreferrer">{image}</a>;
  return <>
    <button className="offline-photo-button" aria-label={`View full photo from ${photo.date}`} onClick={() => setFull(true)}>{image}</button>
    {full && <FullOfflinePhoto photo={photo} onClose={() => setFull(false)} />}
  </>;
}
