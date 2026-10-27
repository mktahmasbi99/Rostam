import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { durationValue } from "../lib/duration";
import type { Exercise, ExerciseSet } from "../lib/types";

interface Props {
  exercise: Exercise;
  set: ExerciseSet;
  index: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function SetRow({ exercise, set, index, onEdit, onDelete }: Props) {
  const editable = Boolean(onEdit && onDelete);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("focusin", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("focusin", close); };
  }, [open]);

  return <div className="set-row set-cells">
    <time aria-label={`Time ${set.time}`}>{set.time}</time>
    {exercise.equipment && <strong aria-label={set.resistanceKind === "bodyweight" ? "Bodyweight" : `${set.weightKg} kg`}>{set.resistanceKind === "bodyweight" ? "BW" : set.weightKg}</strong>}
    {exercise.measurementType !== "duration" && <strong aria-label={`${set.repetitions} reps`}>{set.repetitions}</strong>}
    {exercise.measurementType === "duration" && <strong aria-label="Duration">{durationValue(set.durationMinutes, set.durationSeconds)}</strong>}
    {exercise.measurementType === "timed_repetitions" && <strong aria-label="Hold per repetition">{durationValue(set.holdMinutes, set.holdSeconds)}</strong>}
    {editable && <div className="set-actions-menu" ref={menu} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
      <button ref={trigger} className="set-actions-trigger" aria-label={`Actions for set ${index + 1}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Ellipsis /></button>
      {open && <div className="set-actions-popover" role="menu" aria-label={`Set ${index + 1} actions`}>
        <button role="menuitem" aria-label={`Edit set ${index + 1}`} onClick={() => { setOpen(false); onEdit?.(); }}><Pencil />Edit</button>
        <button role="menuitem" className="danger" aria-label={`Delete set ${index + 1}`} onClick={() => { setOpen(false); trigger.current?.focus(); onDelete?.(); }}><Trash2 />Delete</button>
      </div>}
    </div>}
  </div>;
}
