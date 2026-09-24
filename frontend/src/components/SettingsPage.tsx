import { Download, HardDriveDownload, RotateCcw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Backup, BackupSettings, Config } from "../lib/types";
import { InstallAppPanel, type PwaInstallState } from "./InstallAppPanel";
import { Modal } from "./Modal";

function bytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

type RestoreSource =
  | { kind: "backup"; backup: Backup }
  | { kind: "upload"; file: File };

export function SettingsPage({ config, pwaInstall }: { config: Config; pwaInstall: PwaInstallState }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreSource, setRestoreSource] = useState<RestoreSource | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [upload, setUpload] = useState<File | null>(null);
  const [legacyImport, setLegacyImport] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [showSafety, setShowSafety] = useState(false);
  const [schedule, setSchedule] = useState<BackupSettings | null>(null);
  const load = useCallback(async () => { try { setBackups(await api.backups()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load backups."); } }, []);
  useEffect(() => {
    void load();
    if ("backupSettings" in api) void api.backupSettings().then(setSchedule).catch(() => {});
  }, [load]);

  async function create() {
    setCreating(true); setError("");
    try { await api.createBackup(); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create backup."); }
    finally { setCreating(false); }
  }

  function beginRestore(source: RestoreSource) {
    setConfirmation("");
    setRestoreSource(source);
  }

  const closeRestore = useCallback(() => {
    if (!restoring) setRestoreSource(null);
  }, [restoring]);

  async function restore() {
    if (!restoreSource) return;
    setRestoring(true); setError("");
    try {
      if (restoreSource.kind === "backup") await api.restoreBackup(restoreSource.backup.id, confirmation);
      else await api.restoreUploadedBackup(restoreSource.file, confirmation);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore the backup.");
      setRestoring(false);
    }
  }

  const grouped = (category: Backup["category"]) => backups.filter((item) => item.category === category);
  const sourceLabel = restoreSource?.kind === "backup" ? restoreSource.backup.id : restoreSource?.file.name;

  return <main className="page settings-page">
    <header className="section-title"><h1>Settings</h1><p>Private server and data protection.</p></header>
    <section className="settings-card"><h2>Server</h2><dl><div><dt>Timezone</dt><dd>{config.timezone}</dd></div><div><dt>Version</dt><dd>{config.version}</dd></div></dl></section>
    <section className="settings-card"><div className="card-heading"><div><h2>Backups</h2><p>Daily keeps 7, weekly keeps 8, and on-demand backups persist until deleted.</p></div><button className="primary" disabled={creating || restoring} onClick={() => void create()}><HardDriveDownload />{creating ? "Creating…" : "Create backup"}</button></div>{error && <p className="error" role="alert">{error}</p>}{(["on-demand", "daily", "weekly"] as const).map((category) => <div className="backup-group" key={category}><h3>{category === "on-demand" ? "On-demand" : category[0].toUpperCase() + category.slice(1)}</h3>{grouped(category).length === 0 ? <p className="empty-copy">No backups yet.</p> : grouped(category).map((backup) => <div className="backup-row" key={backup.id}><div><strong>{new Date(backup.createdAt).toLocaleString()}</strong><small>{bytes(backup.sizeBytes)}</small></div><div className="row-actions"><a className="icon-button" aria-label={`Download ${backup.id}`} href={`/api/backups/${encodeURIComponent(backup.id)}/download`}><Download /></a><button className="icon-button" aria-label={`Restore ${backup.id}`} disabled={restoring} onClick={() => beginRestore({ kind: "backup", backup })}><RotateCcw /></button><button className="icon-button danger" disabled={restoring} aria-label={`Delete ${backup.id}`} onClick={async () => { if (window.prompt("Type DELETE to permanently delete this backup.") !== "DELETE") return; await api.deleteBackup(backup.id); await load(); }}><Trash2 /></button></div></div>)}</div>)}<button className="secondary" onClick={() => setShowSafety(!showSafety)}>{showSafety ? "Hide safety backups" : "Show safety backups"}</button>{showSafety && backups.filter((item) => item.isSafety).map((backup) => <div className="backup-row" key={backup.id}><div><strong>{backup.category}</strong><small>{new Date(backup.createdAt).toLocaleString()} · {bytes(backup.sizeBytes)}</small></div><div className="row-actions"><a className="icon-button" aria-label={`Download ${backup.id}`} href={`/api/backups/${encodeURIComponent(backup.id)}/download`}><Download /></a><button className="icon-button" aria-label={`Restore ${backup.id}`} onClick={() => beginRestore({ kind: "backup", backup })}><RotateCcw /></button></div></div>)}</section>
    {schedule && <section className="settings-card"><h2>Backup schedule</h2><p>Server time: {config.timezone}. Daily and weekly retention may be set from 1 to 365.</p><label>Daily time<input type="time" value={schedule.dailyTime} onChange={(event) => setSchedule({ ...schedule, dailyTime: event.target.value })} /></label><label>Daily retention<input type="number" min="1" max="365" value={schedule.dailyRetention} onChange={(event) => setSchedule({ ...schedule, dailyRetention: Number(event.target.value) })} /></label><button className="secondary" onClick={() => void api.updateBackupSettings(schedule).then(setSchedule).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not save schedule."))}>Save backup schedule</button></section>}
    <section className="settings-card"><h2>Restore</h2><p>Restore replaces all live ledger data. Rostam first creates an on-demand safety backup of the current database.</p><label className="file-picker">Upload a SQLite backup<input type="file" accept=".sqlite3,application/x-sqlite3" disabled={restoring} onChange={(event) => setUpload(event.target.files?.[0] ?? null)} /></label>{upload && <div className="restore-upload"><span>{upload.name}</span><button className="secondary" disabled={restoring} onClick={() => beginRestore({ kind: "upload", file: upload })}><Upload />Restore uploaded backup</button></div>}</section>
    <details className="settings-card"><summary>Advanced: import a legacy database</summary><p>Import is only for compatible older Rostam databases. It validates the file, creates a pre-import safety backup, then replaces the live database.</p><label className="file-picker">Legacy SQLite file<input type="file" accept=".sqlite3,application/x-sqlite3" disabled={restoring} onChange={(event) => setLegacyImport(event.target.files?.[0] ?? null)} /></label>{legacyImport && <button className="danger-button" disabled={restoring} onClick={async () => { if (window.prompt("Type IMPORT to import this legacy database.") !== "IMPORT") return; setRestoring(true); setError(""); try { const result = await api.importLegacy(legacyImport, "IMPORT"); window.alert(`Imported successfully. Safety backup: ${result.safetyBackup.id}`); window.location.reload(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not import the legacy database."); setRestoring(false); } }}>Import legacy database</button>}</details>
    <InstallAppPanel state={pwaInstall} />
    <section className="settings-card credits"><h2>Illustrations</h2><p>Exercise artwork by <a href="https://github.com/bryllim/workout-guide" target="_blank" rel="noreferrer">Bryl Lim’s Workout Guide</a>, including Everkinetic-derived poses, under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.</p></section>
    {restoreSource && <Modal title="Restore database" onClose={closeRestore}><div className="restore-dialog"><p><strong>{sourceLabel}</strong> will replace every exercise and recorded set currently in Rostam.</p><p>A safety backup of the current database will be created first. Type <strong>RESTORE</strong> to continue.</p>{error && <p className="error" role="alert">{error}</p>}<label>Confirmation<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={restoring} autoFocus /></label><div className="draft-actions"><button disabled={restoring} onClick={() => setRestoreSource(null)}>Cancel</button><button className="danger-button" disabled={restoring || confirmation !== "RESTORE"} onClick={() => void restore()}><RotateCcw />{restoring ? "Restoring…" : "Restore database"}</button></div></div></Modal>}
  </main>;
}
