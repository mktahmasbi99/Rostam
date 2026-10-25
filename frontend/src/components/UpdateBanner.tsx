import { useEffect, useState } from "react";
import { getUpdateState, restartToUpdate, subscribeUpdates } from "../lib/updateClient";

export function UpdateBanner() {
  const [state, setState] = useState(getUpdateState);
  useEffect(() => subscribeUpdates(() => setState(getUpdateState())), []);
  if (!state.ready) return null;
  return <aside className="update-banner" role="status" aria-live="polite" data-update-control>
    <span>{state.preparing ? "Checking open tabs…" : state.blocked ? "A save is still finishing." : state.blockReason || "Update ready"}</span>
    {state.preparing
      ? <span>Restart is paused while Rostam checks for unsaved changes.</span>
      : <button type="button" className="secondary" data-update-control disabled={state.blocked} onClick={restartToUpdate}>Restart to update</button>}
  </aside>;
}
