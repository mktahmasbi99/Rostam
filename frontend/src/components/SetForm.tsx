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
  const [resistance, setResistance] = useState<ResistanceKind>(existing?.resistanceKind ?? (exercise.equipment ? "external" : "bodyweight"));
  const [weight, setWeight] = useState(existing?.weightKg ?? exercise.defaultWeightKg ?? "");
  const [loading, setLoading] = useState(!existing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const measurementEdited = useRef(false);
  const resistanceEdited = useRef(false);

  function applyPrefill(prefill: Awaited<ReturnType<typeof api.prefill>>) {
    if (!measurementEdited.current) {
      setRepetitions(prefill.repetitions?.toString() ?? "");
      setMinutes(prefill.durationMinutes?.toString() ?? "");
      setSeconds(prefill.durationSeconds?.toString() ?? "");
    }
    if (!resistanceEdited.current) {
      setResistance(prefill.resistanceKind);
      setWeight(prefill.weightKg ?? "");
    }
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
          <label>kg<input inputMode="decimal" value={weight} onChange={(event) => { resistanceEdited.current = true; setWeight(event.target.value); }} placeholder="0 = BW" required /></label>
        </>}
        {exercise.measurementType === "repetitions" ? <label>Reps<input type="number" min="1" step="1" inputMode="numeric" value={repetitions} onChange={(event) => { measurementEdited.current = true; setRepetitions(event.target.value); }} required autoFocus /></label> : <div className="duration-fields"><label>Minutes<input type="number" min="0" step="1" inputMode="numeric" value={minutes} onChange={(event) => { measurementEdited.current = true; setMinutes(event.target.value); }} autoFocus /></label><label>Seconds<input type="number" min="0" max="59" step="1" inputMode="numeric" value={seconds} onChange={(event) => { measurementEdited.current = true; setSeconds(event.target.value); }} /></label></div>}
      </div>
      {error && <div className="save-error" role="alert"><span>{error} Your values remain unsaved on this page.</span><button type="button" onClick={() => void save()}><RotateCcw />Retry</button></div>}
      <div className="draft-actions"><button type="button" className="icon-button" aria-label="Cancel set" onClick={onCancel}><X /></button><button type="submit" className="save-set" aria-label="Save set" disabled={saving}><Check />{saving ? "Saving" : "Save"}</button></div>
    </form>
  );
}
