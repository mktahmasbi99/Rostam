import { workoutLocalTime } from "../lib/workoutTime";
import { RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useSetDeletion } from "../lib/useSetDeletion";
import { api } from "../lib/api";
import type { Exercise, ExerciseSet, SetPayload } from "../lib/types";
import { durationValue, parseDurationValue } from "../lib/duration";
import { DurationInput } from "./DurationInput";
import { SwipeSetRow } from "./SwipeSetRow";
import { TimeWheelField } from "./TimeWheelField";

interface Props {
  workout?: { id: number; entryId: number; startedAt: string; endedAt: string | null; timezone: string };
  exercise: Exercise;
  day: string;
  existing?: ExerciseSet;
  onSaved: () => void;
  onCancel: () => void;
  onDelete?: () => Promise<void> | void;
}

export function SetForm({ exercise, day, existing, onSaved, onCancel, onDelete, workout }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const writing = useRef(false);
  const initialLocal = workout ? workoutLocalTime(existing?.occurredAt ?? (workout.endedAt ? workout.startedAt : new Date().toISOString()), workout.timezone) : "";
  const [setDate, setSetDate] = useState(initialLocal.slice(0, 10) || day);
  const [dateEdited, setDateEdited] = useState(false);
  const [time, setTime] = useState(existing?.time ?? initialLocal.slice(11));
  const [timeEdited, setTimeEdited] = useState(false);
  const [repetitions, setRepetitions] = useState(existing?.repetitions?.toString() ?? "");
  const [duration, setDuration] = useState(durationValue(existing?.durationMinutes, existing?.durationSeconds));
  const [hold, setHold] = useState(durationValue(existing?.holdMinutes, existing?.holdSeconds));
  const [weight, setWeight] = useState(existing?.resistanceKind === "bodyweight" ? "0" : existing?.weightKg ?? "");
  const [invalidDuration, setInvalidDuration] = useState(false);
  const hintId = useId();
  const [loading, setLoading] = useState(!existing);
  const [saving, setSaving] = useState(false);
  const { deleting, error: deleteError, remove } = useSetDeletion(existing ? onDelete : onCancel, saving);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [prefillLoaded, setPrefillLoaded] = useState(Boolean(existing));
  const [prefillRetry, setPrefillRetry] = useState(0);
  const measurementEdited = useRef({ repetitions: false, duration: false, hold: false });
  const resistanceEdited = useRef(false);
  const timeEditedRef = useRef(false);
  const firstMeasurementInput = useRef<HTMLInputElement>(null);
  const [suggested, setSuggested] = useState({ repetitions: false, duration: false, hold: false, weight: false });

  useEffect(() => {
    const firstMeasurementSuggested = exercise.measurementType === "duration" ? suggested.duration : suggested.repetitions;
    if (!existing && !loading && firstMeasurementInput.current && firstMeasurementSuggested) {
      firstMeasurementInput.current.select();
    }
  }, [existing, exercise.measurementType, loading, suggested.duration, suggested.repetitions]);

  function applyPrefill(prefill: Awaited<ReturnType<typeof api.prefill>>) {
    if (!measurementEdited.current.repetitions) {
      setRepetitions(prefill.repetitions?.toString() ?? "");
      setSuggested((current) => ({ ...current, repetitions: prefill.source === "previous" && prefill.repetitions !== null }));
    }
    if (!measurementEdited.current.duration) {
      setDuration(durationValue(prefill.durationMinutes, prefill.durationSeconds));
      setSuggested((current) => ({ ...current, duration: prefill.source === "previous" && prefill.durationMinutes !== null }));
    }
    if (!measurementEdited.current.hold) {
      setHold(durationValue(prefill.holdMinutes, prefill.holdSeconds));
      setSuggested((current) => ({ ...current, hold: prefill.source === "previous" && prefill.holdMinutes !== null }));
    }
    if (!resistanceEdited.current) {
      setWeight(prefill.resistanceKind === "bodyweight" ? "0" : prefill.weightKg ?? "");
      setSuggested((current) => ({ ...current, weight: prefill.source === "previous" }));
    }
  }

  function editMeasurement(field: keyof typeof measurementEdited.current, value: string, update: (value: string) => void) {
    measurementEdited.current[field] = true;
    setSuggested((current) => ({ ...current, [field]: false }));
    setInvalidDuration(false);
    update(value);
  }

  function editWeight(value: string) {
    resistanceEdited.current = true;
    setSuggested((current) => ({ ...current, weight: false }));
    setWeight(value);
  }

  async function refreshPrefill(atTime: string) {
    if (existing || !atTime) return;
    try {
      applyPrefill(await api.prefill(exercise.id, setDate, atTime));
    } catch (caught) {
      setReadError(caught instanceof Error ? caught.message : "Could not refresh the previous set.");
    }
  }

  useEffect(() => {
    if (existing) return;
    let active = true;
    setLoading(true);
    setReadError("");
    Promise.all([api.config(), api.prefill(exercise.id, setDate, workout?.endedAt ? time : undefined)])
      .then(([config, prefill]) => {
        if (!active) return;
        const now = new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: config.timezone,
        }).format(new Date());
        if (!timeEditedRef.current && !workout) setTime(now);
        applyPrefill(prefill);
      })
      .catch((caught) => active && setReadError(caught instanceof Error ? caught.message : "Could not load previous set."))
      .finally(() => { if (active) { setLoading(false); setPrefillLoaded(true); } });
    return () => { active = false; };
  }, [day, exercise.id, existing, prefillRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (writing.current) return;
    if (form.current && !form.current.reportValidity()) return;
    setError("");
    if (!time) { setError("Choose a set time."); return; }
    const parsedDuration = parseDurationValue(duration);
    const parsedHold = parseDurationValue(hold);
    if ((exercise.measurementType === "duration" && !parsedDuration) || (exercise.measurementType === "timed_repetitions" && !parsedHold)) {
      setInvalidDuration(true);
      setError("Enter a duration from 0:01 to 1440:00, with seconds between 00 and 59.");
      return;
    }
    if (exercise.equipment && (!weight.trim() || (!exercise.allowBodyweight && Number(weight) === 0))) {
      setError(exercise.allowBodyweight ? "Enter a weight in kg, or 0 for bodyweight." : "Weight must be greater than zero for this exercise.");
      return;
    }
    const bodyweight = !exercise.equipment || (exercise.allowBodyweight && Number(weight) === 0);
    writing.current = true;
    setSaving(true);
    const payload: SetPayload = {
      time: timeEdited ? time : null,
      repetitions: exercise.measurementType === "repetitions" || exercise.measurementType === "timed_repetitions" ? Number(repetitions) : null,
      durationMinutes: exercise.measurementType === "duration" ? parsedDuration!.minutes : null,
      durationSeconds: exercise.measurementType === "duration" ? parsedDuration!.seconds : null,
      holdMinutes: exercise.measurementType === "timed_repetitions" ? parsedHold!.minutes : null,
      holdSeconds: exercise.measurementType === "timed_repetitions" ? parsedHold!.seconds : null,
      resistanceKind: bodyweight ? "bodyweight" : "external",
      weightKg: bodyweight ? null : weight,
    };
    try {
      if (workout) {
        payload.time = null;
        payload.occurredAt = existing && !timeEdited && !dateEdited ? existing.occurredAt
          : !existing && !timeEdited && !dateEdited ? (workout.endedAt ? workout.startedAt : null) : `${setDate}T${time}`;
      }
      if (existing) await api.updateSet(existing.id, payload);
      else if (workout) await api.addWorkoutSet(workout.id, workout.entryId, payload);
      else await api.addSet(day, exercise.id, { ...payload, enrollInRotation: false });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Set was not saved.");
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  if (loading && !prefillLoaded) return <div className="set-draft skeleton" role="status">Loading previous set…</div>;

  return (
    <SwipeSetRow onDelete={existing && !onDelete ? undefined : remove} disabled={saving || deleting} error={deleteError}><form ref={form} className="set-draft" data-update-dirty={`set-entry-${workout?.entryId ?? exercise.id}`} data-update-dirty-label="Set entry" onSubmit={(event) => { event.preventDefault(); if (!deleting) void save(); }}>
      {workout && <label className="workout-set-date">Set date<input aria-label="Set date" type="date" value={setDate} required onChange={(event) => { setSetDate(event.target.value); setDateEdited(true); }} onBlur={() => void refreshPrefill(time)} /></label>}
      <div className="set-form-grid set-cells">
        <TimeWheelField label="Time" value={time} onChange={(value) => { setTime(value); setTimeEdited(true); timeEditedRef.current = true; void refreshPrefill(value); }} />
        {exercise.equipment && <input aria-label="kg" aria-describedby={exercise.allowBodyweight ? hintId : undefined} className={`set-weight-input${suggested.weight ? " suggested-value" : ""}`} inputMode="decimal" value={weight} onFocus={(event) => suggested.weight && event.currentTarget.select()} onClick={(event) => suggested.weight && event.currentTarget.select()} onChange={(event) => editWeight(event.target.value)} required />}
        {exercise.measurementType !== "duration" && <input aria-label="Reps" ref={firstMeasurementInput} className={suggested.repetitions ? "suggested-value" : ""} type="number" min="1" step="1" inputMode="numeric" value={repetitions} onFocus={(event) => suggested.repetitions && event.currentTarget.select()} onClick={(event) => suggested.repetitions && event.currentTarget.select()} onChange={(event) => editMeasurement("repetitions", event.target.value, setRepetitions)} required autoFocus />}
        {exercise.measurementType === "duration" && <DurationInput label="Duration" inputRef={firstMeasurementInput} value={duration} suggested={suggested.duration} onChange={(value) => editMeasurement("duration", value, setDuration)} invalid={invalidDuration} autoFocus />}
        {exercise.measurementType === "timed_repetitions" && <DurationInput label="Hold per repetition" value={hold} suggested={suggested.hold} onChange={(value) => editMeasurement("hold", value, setHold)} invalid={invalidDuration} />}
        <label className="set-completion"><input type="checkbox" className="set-checkbox" aria-label="Save set" checked={false} disabled={saving || deleting} onChange={() => form.current?.requestSubmit()} /></label>
      </div>
      {(existing || workout) && <div className="set-edit-actions"><button type="button" className="secondary" disabled={saving || deleting} onClick={onCancel}>Cancel</button></div>}
      {exercise.equipment && exercise.allowBodyweight && <small className="set-weight-hint" id={hintId}>0 = BW</small>}
      {readError && <div className="save-error" role="alert"><span>{readError}</span><button type="button" onClick={() => setPrefillRetry((value) => value + 1)}><RotateCcw />Retry previous set</button></div>}
      {error && <div className="save-error" role="alert"><span>{error} Your values remain unsaved on this page.</span><button type="button" disabled={saving || deleting} onClick={() => void save()}><RotateCcw />Retry</button></div>}
    </form></SwipeSetRow>
  );
}
