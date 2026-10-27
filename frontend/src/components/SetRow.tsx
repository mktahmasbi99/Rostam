import { useSetDeletion } from "../lib/useSetDeletion";
import { durationValue } from "../lib/duration";
import type { Exercise, ExerciseSet } from "../lib/types";
import { SwipeSetRow } from "./SwipeSetRow";

interface Props {
  exercise: Exercise;
  set: ExerciseSet;
  index: number;
  onEdit?: () => void;
  onDelete?: () => Promise<void> | void;
}

export function SetRow({ exercise, set, index, onEdit, onDelete }: Props) {
  const editable = Boolean(onEdit && onDelete);
  const { deleting, error, remove } = useSetDeletion(onDelete);
  return <SwipeSetRow onDelete={editable ? remove : undefined} disabled={deleting} error={error}><div className="set-row set-cells">
    <time aria-label={`Time ${set.time}`}>{set.time}</time>
    {exercise.equipment && <strong aria-label={set.resistanceKind === "bodyweight" ? "Bodyweight" : `${set.weightKg} kg`}>{set.resistanceKind === "bodyweight" ? "BW" : set.weightKg}</strong>}
    {exercise.measurementType !== "duration" && <strong aria-label={`${set.repetitions} reps`}>{set.repetitions}</strong>}
    {exercise.measurementType === "duration" && <strong aria-label="Duration">{durationValue(set.durationMinutes, set.durationSeconds)}</strong>}
    {exercise.measurementType === "timed_repetitions" && <strong aria-label="Hold per repetition">{durationValue(set.holdMinutes, set.holdSeconds)}</strong>}
    {editable && <label className="set-completion"><input className="set-checkbox" type="checkbox" aria-label={`Saved set ${index + 1}; uncheck to edit`} checked disabled={deleting} onChange={onEdit} /></label>}
  </div></SwipeSetRow>;
}
