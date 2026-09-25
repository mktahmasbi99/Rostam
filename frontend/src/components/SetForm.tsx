import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Exercise, ExerciseSet, ResistanceKind, SetPayload } from "../lib/types";

interface Props {
  exercise: Exercise;
  day: string;
  existing?: ExerciseSet;
  onSaved: () => void;
  onCancel: () => void;
}

export function SetForm({ exercise, day, existing, onSaved, onCancel }: Props) {
  const [time, setTime] = useState(existing?.time ?? "");
  const [timeEdited, setTimeEdited] = useState(false);
  const [repetitions, setRepetitions] = useState(existing?.repetitions?.toString() ?? "");
  const [minutes, setMinutes] = useState(existing?.durationMinutes?.toString() ?? "");
  const [seconds, setSeconds] = useState(existing?.durationSeconds?.toString() ?? "");
  const [holdMinutes, setHoldMinutes] = useState(existing?.holdMinutes?.toString() ?? "");
  const [holdSeconds, setHoldSeconds] = useState(existing?.holdSeconds?.toString() ?? "");
  const [resistance, setResistance] = useState<ResistanceKind>(existing?.resistanceKind ?? (exercise.equipment ? "external" : "bodyweight"));
  const [weight, setWeight] = useState(existing?.weightKg ?? "");
  const [loading, setLoading] = useState(!existing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const measurementEdited = useRef({ repetitions: false, minutes: false, seconds: false, holdMinutes: false, holdSeconds: false });
  const resistanceEdited = useRef(false);
  const firstMeasurementInput = useRef<HTMLInputElement>(null);
  const [suggested, setSuggested] = useState({ repetitions: false, minutes: false, seconds: false, holdMinutes: false, holdSeconds: false, weight: false });

  useEffect(() => {
    const firstMeasurementSuggested = exercise.measurementType === "duration" ? suggested.minutes : suggested.repetitions;
    if (!existing && !loading && firstMeasurementInput.current && firstMeasurementSuggested) {
      firstMeasurementInput.current.select();
    }
  }, [existing, exercise.measurementType, loading, suggested.minutes, suggested.repetitions]);

  function applyPrefill(prefill: Awaited<ReturnType<typeof api.prefill>>) {
    if (!measurementEdited.current.repetitions) {
      setRepetitions(prefill.repetitions?.toString() ?? "");
      setSuggested((current) => ({ ...current, repetitions: prefill.source === "previous" && prefill.repetitions !== null }));
    }
    if (!measurementEdited.current.minutes) {
      setMinutes(prefill.durationMinutes?.toString() ?? "");
      setSuggested((current) => ({ ...current, minutes: prefill.source === "previous" && prefill.durationMinutes !== null }));
    }
    if (!measurementEdited.current.seconds) {
      setSeconds(prefill.durationSeconds?.toString() ?? "");
      setSuggested((current) => ({ ...current, seconds: prefill.source === "previous" && prefill.durationSeconds !== null }));
    }
    if (!measurementEdited.current.holdMinutes) {
      setHoldMinutes(prefill.holdMinutes?.toString() ?? "");
      setSuggested((current) => ({ ...current, holdMinutes: prefill.source === "previous" && prefill.holdMinutes !== null }));
    }
    if (!measurementEdited.current.holdSeconds) {
      setHoldSeconds(prefill.holdSeconds?.toString() ?? "");
      setSuggested((current) => ({ ...current, holdSeconds: prefill.source === "previous" && prefill.holdSeconds !== null }));
    }
    if (!resistanceEdited.current) {
      setResistance(prefill.resistanceKind);
      setWeight(prefill.weightKg ?? "");
      setSuggested((current) => ({ ...current, weight: prefill.source === "previous" && prefill.weightKg !== null }));
    }
    if (prefill.source === "previous" && document.activeElement instanceof HTMLInputElement && document.activeElement.type === "number") {
      document.activeElement.select();
    }
  }

  function editMeasurement(field: keyof typeof measurementEdited.current, value: string, update: (value: string) => void) {
    measurementEdited.current[field] = true;
    setSuggested((current) => ({ ...current, [field]: false }));
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
      applyPrefill(await api.prefill(exercise.id, day, atTime));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh the previous set.");
    }
  }

  useEffect(() => {
    if (existing) return;
    let active = true;
    Promise.all([api.config(), api.prefill(exercise.id, day)])
      .then(([config, prefill]) => {
        if (!active) return;
        const now = new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: config.timezone,
        }).format(new Date());
        setTime(now);
        applyPrefill(prefill);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load previous set."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [day, exercise.id, existing]);

  async function save() {
    setSaving(true);
    setError("");
    const payload: SetPayload = {
      time: timeEdited ? time : null,
      repetitions: exercise.measurementType === "repetitions" ? Number(repetitions) : null,
      durationMinutes: exercise.measurementType === "duration" ? Number(minutes || 0) : null,
      durationSeconds: exercise.measurementType === "duration" ? Number(seconds || 0) : null,
      holdMinutes: exercise.measurementType === "timed_repetitions" ? Number(holdMinutes || 0) : null,
      holdSeconds: exercise.measurementType === "timed_repetitions" ? Number(holdSeconds || 0) : null,
      resistanceKind: resistance,
      weightKg: resistance === "external" ? weight : null,
    };
    try {
      if (existing) await api.updateSet(existing.id, payload);
      else await api.addSet(day, exercise.id, payload);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Set was not saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="set-draft skeleton">Loading previous set…</div>;

  return (
    <form className="set-draft" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="set-form-grid">
        <label>Time<input type="time" value={time} onChange={(event) => { setTime(event.target.value); setTimeEdited(true); }} onBlur={() => void refreshPrefill(time)} required /></label>
        {exercise.equipment && exercise.allowBodyweight && <fieldset>
          <legend>Resistance</legend>
          <div className="segmented compact"><button type="button" className={resistance === "bodyweight" ? "selected" : ""} onClick={() => { resistanceEdited.current = true; setResistance("bodyweight"); }}>BW</button><button type="button" className={resistance === "external" ? "selected" : ""} onClick={() => { resistanceEdited.current = true; setResistance("external"); }}>kg</button></div>
        </fieldset>}
        {resistance === "external" && <>
          <label>kg<input className={suggested.weight ? "suggested-value" : ""} inputMode="decimal" value={weight} onFocus={(event) => suggested.weight && event.currentTarget.select()} onClick={(event) => suggested.weight && event.currentTarget.select()} onKeyDown={(event) => suggested.weight && event.currentTarget.select()} onChange={(event) => editWeight(event.target.value)} placeholder="0 = BW" required /></label>
        </>}
        {exercise.measurementType === "duration" ? <div className="duration-fields"><label>Minutes<input ref={firstMeasurementInput} className={suggested.minutes ? "suggested-value" : ""} type="number" min="0" step="1" inputMode="numeric" value={minutes} onFocus={(event) => suggested.minutes && event.currentTarget.select()} onClick={(event) => suggested.minutes && event.currentTarget.select()} onKeyDown={(event) => suggested.minutes && event.currentTarget.select()} onChange={(event) => editMeasurement("minutes", event.target.value, setMinutes)} autoFocus /></label><label>Seconds<input className={suggested.seconds ? "suggested-value" : ""} type="number" min="0" max="59" step="1" inputMode="numeric" value={seconds} onFocus={(event) => suggested.seconds && event.currentTarget.select()} onClick={(event) => suggested.seconds && event.currentTarget.select()} onKeyDown={(event) => suggested.seconds && event.currentTarget.select()} onChange={(event) => editMeasurement("seconds", event.target.value, setSeconds)} /></label></div> : exercise.measurementType === "timed_repetitions" ? <><label>Reps<input ref={firstMeasurementInput} className={suggested.repetitions ? "suggested-value" : ""} type="number" min="1" step="1" inputMode="numeric" value={repetitions} onFocus={(event) => suggested.repetitions && event.currentTarget.select()} onClick={(event) => suggested.repetitions && event.currentTarget.select()} onKeyDown={(event) => suggested.repetitions && event.currentTarget.select()} onChange={(event) => editMeasurement("repetitions", event.target.value, setRepetitions)} required autoFocus /></label><div className="duration-fields"><label>Hold minutes<input className={suggested.holdMinutes ? "suggested-value" : ""} type="number" min="0" step="1" inputMode="numeric" value={holdMinutes} onFocus={(event) => suggested.holdMinutes && event.currentTarget.select()} onClick={(event) => suggested.holdMinutes && event.currentTarget.select()} onKeyDown={(event) => suggested.holdMinutes && event.currentTarget.select()} onChange={(event) => editMeasurement("holdMinutes", event.target.value, setHoldMinutes)} /></label><label>Hold seconds<input className={suggested.holdSeconds ? "suggested-value" : ""} type="number" min="0" max="59" step="1" inputMode="numeric" value={holdSeconds} onFocus={(event) => suggested.holdSeconds && event.currentTarget.select()} onClick={(event) => suggested.holdSeconds && event.currentTarget.select()} onKeyDown={(event) => suggested.holdSeconds && event.currentTarget.select()} onChange={(event) => editMeasurement("holdSeconds", event.target.value, setHoldSeconds)} /></label></div></> : <label>Reps<input ref={firstMeasurementInput} className={suggested.repetitions ? "suggested-value" : ""} type="number" min="1" step="1" inputMode="numeric" value={repetitions} onFocus={(event) => suggested.repetitions && event.currentTarget.select()} onClick={(event) => suggested.repetitions && event.currentTarget.select()} onKeyDown={(event) => suggested.repetitions && event.currentTarget.select()} onChange={(event) => editMeasurement("repetitions", event.target.value, setRepetitions)} required autoFocus /></label>}
      </div>
      {error && <div className="save-error" role="alert"><span>{error} Your values remain unsaved on this page.</span><button type="button" onClick={() => void save()}><RotateCcw />Retry</button></div>}
      <div className="draft-actions"><button type="button" className="icon-button" aria-label="Cancel set" onClick={onCancel}><X /></button><button type="submit" className="save-set" aria-label="Save set" disabled={saving}><Check />{saving ? "Saving" : "Save"}</button></div>
    </form>
  );
}
