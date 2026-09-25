import { exercises as artworkCatalog } from "@bryllim/workout-guide";
import { Check, ImageOff } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { equipmentLabels, exerciseTitle } from "../lib/format";
import type { Equipment, Exercise, MeasurementType } from "../lib/types";
import { ExerciseImage } from "./ExerciseImage";

const equipment = Object.entries(equipmentLabels) as [Equipment, string][];
const muscleGroups = [
  ["abs", "Abs"], ["back", "Back"], ["biceps", "Biceps"], ["calves", "Calves"],
  ["chest", "Chest"], ["forearms", "Forearms"], ["glutes", "Glutes"],
  ["hamstrings", "Hamstrings"], ["hip_flexors", "Hip Flexors"],
  ["quadriceps", "Quadriceps"], ["shoulders", "Shoulders"], ["triceps", "Triceps"],
] as const;

interface Props {
  exercise?: Exercise;
  onSaved: (exercise: Exercise) => void;
  onCancel: () => void;
}

export function ExerciseEditor({ exercise, onSaved, onCancel }: Props) {
  const [baseName, setBaseName] = useState(exercise?.baseName ?? "");
  const [measurement, setMeasurement] = useState<MeasurementType>(exercise?.measurementType ?? "repetitions");
  const [usesEquipment, setUsesEquipment] = useState(Boolean(exercise?.equipment));
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment>(exercise?.equipment ?? "dumbbell");
  const [customEquipment, setCustomEquipment] = useState(exercise?.customEquipment ?? "");
  const [allowBodyweight, setAllowBodyweight] = useState(exercise?.allowBodyweight ?? true);
  const [imageKey, setImageKey] = useState<string | null>(exercise?.imageKey ?? null);
  const [primaryMuscle, setPrimaryMuscle] = useState(exercise?.primaryMuscle ?? "");
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>(exercise?.secondaryMuscles ?? []);
  const [imageSearch, setImageSearch] = useState("");
  const [showPictures, setShowPictures] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const pictures = useMemo(() => {
    const query = imageSearch.trim().toLocaleLowerCase();
    return artworkCatalog.filter((item) => !query || item.name.toLocaleLowerCase().includes(query));
  }, [imageSearch]);
  const fixedEquipment = usesEquipment ? selectedEquipment : null;
  const usesGeneratedTitle = !exercise || exercise.name === exerciseTitle(
    exercise.baseName,
    exercise.equipment,
    exercise.customEquipment ?? "",
  );
  const title = usesGeneratedTitle
    ? exerciseTitle(baseName, fixedEquipment, customEquipment)
    : baseName.trim().replace(/\s+/g, " ");

  async function save() {
    setSaving(true);
      setError("");
      try {
        const saved = exercise
        ? await api.updateExercise(exercise.id, {
            baseName,
            imageKey,
            primaryMuscle: primaryMuscle || null,
            secondaryMuscles,
          })
        : await api.createExercise({
            baseName,
            measurementType: measurement,
            equipment: fixedEquipment,
            customEquipment: fixedEquipment === "other" ? customEquipment : null,
            allowBodyweight,
            imageKey,
            primaryMuscle: primaryMuscle || null,
            secondaryMuscles,
          });
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save exercise.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label>Exercise name<input value={baseName} onChange={(event) => setBaseName(event.target.value)} autoFocus required maxLength={100} /></label>
      {title && <p className="name-preview"><span>Displayed as</span><strong>{title}</strong></p>}
      <fieldset>
        <legend>Measurement</legend>
        <div className="segmented">
          <button type="button" className={measurement === "repetitions" ? "selected" : ""} onClick={() => setMeasurement("repetitions")} disabled={Boolean(exercise)}>Repetitions</button>
          <button type="button" className={measurement === "duration" ? "selected" : ""} onClick={() => setMeasurement("duration")} disabled={Boolean(exercise)}>Duration</button>
          <button type="button" className={measurement === "timed_repetitions" ? "selected" : ""} onClick={() => setMeasurement("timed_repetitions")} disabled={Boolean(exercise)}>Timed repetitions</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>Fixed equipment</legend>
        <div className="segmented">
          <button type="button" className={!usesEquipment ? "selected" : ""} onClick={() => { setUsesEquipment(false); setAllowBodyweight(true); }} disabled={Boolean(exercise)}>None</button>
          <button type="button" className={usesEquipment ? "selected" : ""} onClick={() => setUsesEquipment(true)} disabled={Boolean(exercise)}>Equipment</button>
        </div>
        {exercise && <small>Measurement, equipment, and bodyweight eligibility are permanent after creation.</small>}
      </fieldset>
      {usesEquipment && <div className="form-grid">
        <label>Equipment<select value={selectedEquipment} onChange={(event) => setSelectedEquipment(event.target.value as Equipment)} disabled={Boolean(exercise)}>{equipment.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {selectedEquipment === "other" && <label className="full">Equipment name<input value={customEquipment} onChange={(event) => setCustomEquipment(event.target.value)} required disabled={Boolean(exercise)} /></label>}
      </div>}
      <label className="checkbox-row"><input type="checkbox" checked={allowBodyweight} onChange={(event) => setAllowBodyweight(event.target.checked)} disabled={Boolean(exercise) || !usesEquipment} />Allow bodyweight sets</label>
      {!usesEquipment && <small>Bodyweight is required when an exercise has no equipment.</small>}
      <fieldset>
        <legend>Muscle groups <small>Optional</small></legend>
        <label>Primary muscle group<select value={primaryMuscle} onChange={(event) => {
          const next = event.target.value;
          setPrimaryMuscle(next);
          setSecondaryMuscles((current) => current.filter((muscle) => muscle !== next));
        }}><option value="">Not set</option>{muscleGroups.map(([slug, name]) => <option value={slug} key={slug}>{name}</option>)}</select></label>
        <span className="field-label">Secondary muscle groups</span>
        <div className="muscle-options">
          {muscleGroups.filter(([slug]) => slug !== primaryMuscle).map(([slug, name]) => <label className="checkbox-row" key={slug}><input type="checkbox" checked={secondaryMuscles.includes(slug)} onChange={(event) => setSecondaryMuscles((current) => event.target.checked ? [...current, slug] : current.filter((muscle) => muscle !== slug))} />{name}</label>)}
        </div>
      </fieldset>
      <div>
        <span className="field-label">Picture</span>
        <button type="button" className="picture-choice" onClick={() => setShowPictures(!showPictures)}>
          <ExerciseImage imageKey={imageKey} name={title || "Exercise"} />
          <span>{imageKey ? artworkCatalog.find((item) => item.slug === imageKey)?.name ?? imageKey : "No picture"}</span>
        </button>
      </div>
      {showPictures && <div className="picture-picker">
        <input type="search" placeholder="Search pictures" value={imageSearch} onChange={(event) => setImageSearch(event.target.value)} />
        <div className="picture-grid">
          <button type="button" className={imageKey === null ? "selected" : ""} onClick={() => { setImageKey(null); setShowPictures(false); }}><ImageOff /><span>No picture</span></button>
          {pictures.map((item) => <button type="button" key={item.slug} className={imageKey === item.slug ? "selected" : ""} onClick={() => { setImageKey(item.slug); setShowPictures(false); }}><ExerciseImage imageKey={item.slug} name={item.name} /><span>{item.name}</span></button>)}
        </div>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="submit" className="primary" disabled={saving || !baseName.trim() || (!usesEquipment && !allowBodyweight)}><Check />{saving ? "Saving…" : "Save exercise"}</button></div>
    </form>
  );
}
