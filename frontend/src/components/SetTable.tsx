import { Clock } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Exercise } from "../lib/types";

export function SetTable({ exercise, children, editable = false }: { exercise: Exercise; children: ReactNode; editable?: boolean }) {
  const measurements = exercise.measurementType === "timed_repetitions" ? ["Reps", "Hold"] : [exercise.measurementType === "duration" ? "Duration" : "Reps"];
  const columns = ["minmax(var(--set-time-width), 1fr)", ...(exercise.equipment ? ["minmax(var(--set-weight-width), 1fr)"] : []), ...measurements.map((label) => label === "Reps" ? "minmax(var(--set-reps-width), 1fr)" : "minmax(var(--set-duration-width), 1fr)"), ...(editable ? ["minmax(44px, 1fr)"] : [])].join(" ");
  return <div className="set-table" role="group" aria-label={`Sets for ${exercise.name}`} style={{ "--set-columns": columns } as CSSProperties}>
    <div className="set-table-header set-cells">
      <span className="set-time-heading" title="Time"><Clock aria-hidden="true" /><span className="visually-hidden">Time</span></span>
      {exercise.equipment && <span>kg</span>}
      {measurements.map((label) => <span key={label} title={label === "Hold" ? "Hold per repetition (mm:ss)" : label === "Duration" ? "Duration (mm:ss)" : undefined}>{label}</span>)}
      {editable && <span className="visually-hidden">Actions</span>}
    </div>
    {children}
  </div>;
}
