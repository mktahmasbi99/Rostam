import { Pencil, Trash2 } from "lucide-react";
import { formatMeasurement, formatResistance } from "../lib/format";
import type { ExerciseSet } from "../lib/types";

interface Props {
  set: ExerciseSet;
  index: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function SetRow({ set, index, onEdit, onDelete }: Props) {
  const editable = onEdit && onDelete;
  return <div className="set-row">
    <span className="set-number">{index + 1}</span>
    <time>{set.time}</time>
    <strong>{formatMeasurement(set)}</strong>
    <span className="resistance-label">{formatResistance(set)}</span>
    {editable && <div className="row-actions">
      <button className="icon-button" aria-label={`Edit set ${index + 1}`} onClick={onEdit}><Pencil /></button>
      <button className="icon-button danger" aria-label={`Delete set ${index + 1}`} onClick={onDelete}><Trash2 /></button>
    </div>}
  </div>;
}
