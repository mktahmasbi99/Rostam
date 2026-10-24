import { exercises as artworkCatalog } from "@bryllim/workout-guide";
import { Check, ImageOff, ImagePlus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { equipmentLabels, equipmentTitleLabels, exerciseTitle } from "../lib/format";
import type { Equipment, Exercise, MeasurementType } from "../lib/types";
import { ExerciseImage } from "./ExerciseImage";

const equipment = Object.entries(equipmentLabels) as [Equipment, string][];
const measurementLabels: Record<MeasurementType, string> = {
  repetitions: "Reps",
  duration: "Duration",
  timed_repetitions: "Timed reps",
};
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
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(exercise?.equipment ?? null);
  const [customEquipment, setCustomEquipment] = useState(exercise?.customEquipment ?? "");
  const [allowBodyweight, setAllowBodyweight] = useState(exercise?.allowBodyweight ?? true);
  const [imageKey, setImageKey] = useState<string | null>(exercise?.imageKey ?? null);
  const [primaryMuscle, setPrimaryMuscle] = useState(exercise?.primaryMuscle ?? "");
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>(exercise?.secondaryMuscles ?? []);
  const [imageSearch, setImageSearch] = useState("");
  const [showPictures, setShowPictures] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [pictureError, setPictureError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pictureInput = useRef<HTMLInputElement>(null);

  const pictures = useMemo(() => {
    const query = imageSearch.trim().toLocaleLowerCase();
    return artworkCatalog.filter((item) => !query || item.name.toLocaleLowerCase().includes(query));
  }, [imageSearch]);
  const fixedEquipment = selectedEquipment;
  const usesGeneratedTitle = !exercise || exercise.name === exerciseTitle(
    exercise.baseName,
    exercise.equipment,
    exercise.customEquipment ?? "",
  );
  const title = usesGeneratedTitle
    ? exerciseTitle(baseName, fixedEquipment, customEquipment)
    : baseName.trim().replace(/\s+/g, " ");
  const pictureName = imageKey === null
    ? "No picture"
    : imageKey.startsWith("custom:")
      ? "Custom picture"
      : artworkCatalog.find((item) => item.slug === imageKey)?.name ?? imageKey;

  async function uploadPicture(file?: File) {
    if (!file) return;
    setUploadingPicture(true);
    setPictureError("");
    try {
      const uploaded = await api.uploadExerciseImage(file);
      setImageKey(uploaded.imageKey);
      setShowPictures(false);
    } catch (caught) {
      setPictureError(caught instanceof Error ? caught.message : "Could not upload this picture.");
    } finally {
      setUploadingPicture(false);
      if (pictureInput.current) pictureInput.current.value = "";
    }
  }

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
      <label>Exercise name<input value={baseName} onChange={(event) => setBaseName(event.target.value)} required maxLength={100} /></label>
      {title && <p className="name-preview"><span>Displayed as</span><strong>{title}</strong></p>}
      {exercise ? <div className="immutable-summary">
        <div><span>Measurement</span><strong>{measurementLabels[measurement]}</strong></div>
        <div><span>Fixed equipment</span><strong>{fixedEquipment ? (fixedEquipment === "other" ? customEquipment || "Other" : equipmentTitleLabels[fixedEquipment]) : "None"}</strong></div>
        <div><span>Bodyweight sets</span><strong>{allowBodyweight ? "Allowed" : "Not allowed"}</strong></div>
      </div> : <div className="form-grid exercise-definition-fields">
        <label>Measurement<select value={measurement} onChange={(event) => setMeasurement(event.target.value as MeasurementType)}>{Object.entries(measurementLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Fixed equipment<select value={selectedEquipment ?? ""} onChange={(event) => {
          const value = event.target.value as Equipment | "";
          setSelectedEquipment(value || null);
          if (!value) setAllowBodyweight(true);
        }}><option value="">None</option>{equipment.map(([value]) => <option value={value} key={value}>{value === "other" ? "Other" : equipmentTitleLabels[value as Exclude<Equipment, "other">]}</option>)}</select></label>
        {selectedEquipment === "other" && <label className="full">Equipment name<input value={customEquipment} onChange={(event) => setCustomEquipment(event.target.value)} required /></label>}
      </div>}
      {!exercise && <div className="bodyweight-setting">
        <label className="switch-row"><span>Bodyweight sets</span><span className="switch-control"><input type="checkbox" role="switch" aria-label="Bodyweight sets allowed" checked={allowBodyweight} onChange={(event) => setAllowBodyweight(event.target.checked)} disabled={!selectedEquipment} /><span aria-hidden="true" /></span></label>
        <small>{!selectedEquipment ? "Required when fixed equipment is None." : allowBodyweight ? "Allowed" : "Not allowed"}</small>
      </div>}
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
          <span>{pictureName}</span>
        </button>
      </div>
      {showPictures && <div className="picture-picker">
        <div className="picture-picker-actions"><input type="search" aria-label="Search pictures" placeholder="Search pictures" value={imageSearch} onChange={(event) => setImageSearch(event.target.value)} /><button type="button" className="secondary icon-only-action" aria-label={uploadingPicture ? "Uploading picture" : "Choose from device"} title={uploadingPicture ? "Uploading picture" : "Choose from device"} disabled={uploadingPicture} onClick={() => pictureInput.current?.click()}><ImagePlus /></button></div>
        <input ref={pictureInput} className="visually-hidden" type="file" accept="image/*" onChange={(event) => void uploadPicture(event.currentTarget.files?.[0])} />
        {pictureError && <p className="error" role="alert">{pictureError}</p>}
        <div className="picture-grid">
          <button type="button" className={imageKey === null ? "selected" : ""} onClick={() => { setImageKey(null); setShowPictures(false); }}><ImageOff /><span>No picture</span></button>
          {pictures.map((item) => <button type="button" key={item.slug} className={imageKey === item.slug ? "selected" : ""} onClick={() => { setImageKey(item.slug); setShowPictures(false); }}><ExerciseImage imageKey={item.slug} name={item.name} /><span>{item.name}</span></button>)}
        </div>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="submit" className="primary icon-only-action" aria-label={saving ? "Saving exercise" : "Save exercise"} title={saving ? "Saving exercise" : "Save exercise"} disabled={saving || uploadingPicture || !baseName.trim() || (!selectedEquipment && !allowBodyweight)}><Check /></button></div>
    </form>
  );
}
