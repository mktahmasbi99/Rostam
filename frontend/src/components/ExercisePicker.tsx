import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Exercise, MeasurementType } from "../lib/types";
import { ExerciseEditor } from "./ExerciseEditor";
import { ExerciseImage } from "./ExerciseImage";
import { Modal } from "./Modal";

interface Props {
  presentIds: number[];
  onChoose: (exercise: Exercise) => void;
  onClose: () => void;
}

export function ExercisePicker({ presentIds, onChoose, onClose }: Props) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"" | MeasurementType>("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.exercises("active", query, filter).then((items) => active && setExercises(items)).catch((caught) => active && setError(caught instanceof Error ? caught.message : "Could not load exercises."));
    return () => { active = false; };
  }, [query, filter]);

  if (creating) return <Modal title="New exercise" onClose={() => setCreating(false)} wide><ExerciseEditor onCancel={() => setCreating(false)} onSaved={(exercise) => onChoose(exercise)} /></Modal>;

  return (
    <Modal title="Add exercise" onClose={onClose} wide>
      <div className="picker-toolbar"><label className="search-box"><Search /><span className="sr-only">Search exercises</span><input type="search" placeholder="Search exercises" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus /></label><button className="primary" onClick={() => setCreating(true)}><Plus />New exercise</button></div>
      <div className="filter-row" aria-label="Measurement filter"><button className={!filter ? "selected" : ""} onClick={() => setFilter("")}>All</button><button className={filter === "repetitions" ? "selected" : ""} onClick={() => setFilter("repetitions")}>Repetitions</button><button className={filter === "duration" ? "selected" : ""} onClick={() => setFilter("duration")}>Duration</button><button className={filter === "timed_repetitions" ? "selected" : ""} onClick={() => setFilter("timed_repetitions")}>Timed repetitions</button></div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="exercise-results">
        {exercises.map((exercise) => <button key={exercise.id} className="exercise-result" onClick={() => { if (presentIds.includes(exercise.id)) { setNotice(`${exercise.name} is already added to this day.`); return; } onChoose(exercise); }}><ExerciseImage imageKey={exercise.imageKey} name={exercise.name} /><span><strong>{exercise.name}</strong><small>{exercise.measurementType === "repetitions" ? "Repetitions" : exercise.measurementType === "duration" ? "Duration" : "Timed repetitions"}</small></span></button>)}
        {!error && exercises.length === 0 && <p className="empty-copy">No matching exercises.</p>}
      </div>
    </Modal>
  );
}
