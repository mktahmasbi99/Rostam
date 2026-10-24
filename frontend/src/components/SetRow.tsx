import { Pencil, Trash2 } from "lucide-react";
import { formatMeasurement } from "../lib/format";
import type { ExerciseSet } from "../lib/types";

interface Props {
  set: ExerciseSet;
  index: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function SetRow({ set, index, onEdit, onDelete }: Props) {
  const editable = onEdit && onDelete;
  const measurement = set.repetitions !== null && set.holdMinutes === null && set.resistanceKind === "external"
    ? `${set.weightKg} kg × ${set.repetitions} reps`
    : formatMeasurement(set);
  return <div className="set-row">
    <time>{set.time}</time>
    <strong>{measurement}</strong>
    {editable && <div className="row-actions">
      <button className="icon-button" aria-label={`Edit set ${index + 1}`} onClick={onEdit}><Pencil /></button>
      <button className="icon-button danger" aria-label={`Delete set ${index + 1}`} onClick={onDelete}><Trash2 /></button>
    </div>}
  </div>;
}
