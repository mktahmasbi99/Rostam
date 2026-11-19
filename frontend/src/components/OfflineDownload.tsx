import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { downloadOfflineCopy, getOfflineCopy, removeOfflineCopy, subscribeOfflineCopy, supportsOfflineLedger } from "../lib/offlineLedger";

export function OfflineDownload({ connected }: { connected: boolean }) {
  const copy = useSyncExternalStore(subscribeOfflineCopy, getOfflineCopy, getOfflineCopy);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const downloading = useRef<AbortController>(null);
  useEffect(() => () => downloading.current?.abort(), []);

  async function download() {
    if (downloading.current) return;
    const controller = new AbortController();
    downloading.current = controller;
    setError("");
    setProgress("Preparing offline download…");
    try {
      await downloadOfflineCopy(controller.signal, (message) => {
        if (!controller.signal.aborted) setProgress(message);
      });
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not download Rostam.");
    } finally {
      downloading.current = null;
      setProgress("");
    }
  }

  async function remove() {
    setError("");
    setRemoving(true);
    try { await removeOfflineCopy(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not remove the offline copy."); }
    finally { setRemoving(false); }
  }

  return <section className="settings-card">
    <div className="card-heading"><div><h2>Offline browsing</h2>
      <p>Save the ledger, history, and photos on this device.</p></div></div>
    {copy && <p role="status">{copy.ready ? "Ready offline" : "App files need refreshing"} · Downloaded {new Date(copy.downloadedAt).toLocaleString()} · {(copy.bytes / 1024 ** 2).toFixed(1)} MiB</p>}
    {(progress || removing) && <p role="status">{progress || "Removing offline copy…"}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!supportsOfflineLedger ? <p>Offline downloads require the production app over HTTPS.</p> :
      <div className="form-actions">
        <button className="primary" disabled={!connected || Boolean(progress) || removing} onClick={() => void download()}>{copy ? "Refresh offline copy" : "Download for offline use"}</button>
        {copy && <button className="secondary" disabled={Boolean(progress) || removing} onClick={() => void remove()}>Remove offline copy</button>}
        {progress && <button className="secondary" onClick={() => downloading.current?.abort()}>Cancel download</button>}
      </div>}
  </section>;
}
