import { useState } from "react";
import { durationValue } from "../lib/duration";
import { discardPendingSet, type PendingWorkoutSet } from "../lib/offlineWorkout";
import { workoutLocalTime } from "../lib/workoutTime";

export function PendingWorkoutSets({ sets }: { sets: PendingWorkoutSet[] }) {
  const [error, setError] = useState("");
  if (!sets.length) return null;
  return <ul className="pending-workout-sets">
    {sets.map((set) => {
      const { payload } = set;
      const time = payload.occurredAt.endsWith("Z") ? workoutLocalTime(payload.occurredAt, set.timezone) : payload.occurredAt;
      const measures = [
        payload.weightKg ? `${payload.weightKg} kg` : null,
        payload.repetitions ? `${payload.repetitions} reps` : null,
        payload.durationMinutes !== null ? durationValue(payload.durationMinutes, payload.durationSeconds) : null,
        payload.holdMinutes !== null ? `${durationValue(payload.holdMinutes, payload.holdSeconds)} hold` : null,
      ].filter(Boolean).join(" · ");
      return <li key={set.operationId}>
        <div>{set.workoutName} · {set.exerciseName} · {time.replace("T", " ")} · {measures}</div>
        <p role="status">{set.error ? `Needs review. ${set.error}` : "Saved on this device · Pending sync"}</p>
        {set.error && <button className="secondary" onClick={() => {
          setError("");
          void discardPendingSet(set.operationId).catch(() => setError("Could not discard this set."));
        }}>Discard pending set</button>}
      </li>;
    })}
    {error && <li role="alert">{error}</li>}
  </ul>;
}
