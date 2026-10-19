import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { activityTime } from "../lib/activityTime";
import type { Activity } from "../lib/types";
import { Modal } from "./Modal";
import { TimeWheelField } from "./TimeWheelField";

function zonedNow(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
function suggestedStart(day: string, timezone: string) {
  const now = zonedNow(timezone);
  return `${now.hour}:${now.minute}`;
}

export function ActivityPicker({ day, timezone, onClose, onStarted }: { day: string; timezone: string; onClose: () => void; onStarted: () => void }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [name, setName] = useState("");
  const [start, setStart] = useState(suggestedStart(day, timezone));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void api.activities().then(setActivities).catch((caught) => setError(caught.message)); }, []);
  async function create() {
    setError("");
    try { const activity = await api.createActivity(name); setActivities((current) => [...current, activity].sort((a, b) => a.name.localeCompare(b.name))); setCreating(false); setName(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create activity."); }
  }
  async function begin(activity: Activity) {
    setError("");
    try { await api.startActivity(activity.id, activityTime(day, start)); onStarted(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start activity."); }
  }
  return <Modal title="Add timed activity" onClose={onClose}>
    <div className="stack"><TimeWheelField label="Start time" value={start} onChange={setStart} max={1438} />
      {!creating ? <button className="secondary" onClick={() => setCreating(true)}><Plus />New activity</button> : <div className="activity-create"><label>Activity name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="BJJ – No Gi" maxLength={100} /></label><button className="primary" disabled={!name.trim()} onClick={() => void create()}>Create</button></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="exercise-results">{activities.map((activity) => <button className="exercise-result" key={activity.id} onClick={() => void begin(activity)}><span><strong>{activity.name}</strong><small>Start timed session</small></span></button>)}{activities.length === 0 && !error && <p className="empty-copy">Create an activity to get started.</p>}</div>
    </div>
  </Modal>;
}
