import { Download, HardDriveDownload, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Backup, Config } from "../lib/types";
import { InstallAppPanel, type PwaInstallState } from "./InstallAppPanel";

function bytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function SettingsPage({ config, pwaInstall }: { config: Config; pwaInstall: PwaInstallState }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setBackups(await api.backups()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load backups."); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setCreating(true); setError("");
    try { await api.createBackup(); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create backup."); }
    finally { setCreating(false); }
  }

  const grouped = (category: Backup["category"]) => backups.filter((item) => item.category === category);

  return <main className="page settings-page">
    <header className="section-title"><h1>Settings</h1><p>Private server and data protection.</p></header>
    <section className="settings-card"><h2>Server</h2><dl><div><dt>Timezone</dt><dd>{config.timezone}</dd></div><div><dt>Version</dt><dd>{config.version}</dd></div></dl></section>
    <section className="settings-card"><div className="card-heading"><div><h2>Backups</h2><p>Daily and Weekly keep five each. On-demand backups persist until deleted.</p></div><button className="primary" disabled={creating} onClick={() => void create()}><HardDriveDownload />{creating ? "Creating…" : "Back up now"}</button></div>{error && <p className="error" role="alert">{error}</p>}{(["on-demand", "daily", "weekly"] as const).map((category) => <div className="backup-group" key={category}><h3>{category === "on-demand" ? "On-demand" : category[0].toUpperCase() + category.slice(1)}</h3>{grouped(category).length === 0 ? <p className="empty-copy">No backups yet.</p> : grouped(category).map((backup) => <div className="backup-row" key={backup.id}><div><strong>{new Date(backup.createdAt).toLocaleString()}</strong><small>{bytes(backup.sizeBytes)}</small></div><div className="row-actions"><a className="icon-button" aria-label={`Download ${backup.id}`} href={`/api/backups/${encodeURIComponent(backup.id)}/download`}><Download /></a><button className="icon-button danger" aria-label={`Delete ${backup.id}`} onClick={async () => { if (!window.confirm("Delete this backup? This cannot be undone.")) return; await api.deleteBackup(backup.id); await load(); }}><Trash2 /></button></div></div>)}</div>)}</section>
    <section className="settings-card"><h2>Restore</h2><p>Database restore is intentionally a manual server operation in V1.</p></section>
    <InstallAppPanel state={pwaInstall} />
    <section className="settings-card credits"><h2>Illustrations</h2><p>Exercise artwork by <a href="https://github.com/bryllim/workout-guide" target="_blank" rel="noreferrer">Bryl Lim’s Workout Guide</a>, including Everkinetic-derived poses, under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.</p></section>
  </main>;
}
