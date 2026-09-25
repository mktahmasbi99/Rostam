import { ChevronDown, Pause, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Exercise, ExerciseRecommendations, MeasurementType, RecommendationItem } from "../lib/types";
import { ExerciseEditor } from "./ExerciseEditor";
import { ExerciseImage } from "./ExerciseImage";
import { Modal } from "./Modal";

interface Props {
  day: string;
  presentIds: number[];
  onChoose: (exercise: Exercise) => void;
  onClose: () => void;
}

type View = "library" | "recommendations";

const elapsed = (days: number | null, label: string) =>
  days === null ? "Never done" : `${label} ${days === 1 ? "1 day" : `${days} days`} ago`;

export function ExercisePicker({ day, presentIds, onChoose, onClose }: Props) {
  const [view, setView] = useState<View>("library");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [recommendations, setRecommendations] = useState<ExerciseRecommendations | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"" | MeasurementType>("");
  const [includePaused, setIncludePaused] = useState(false);
  const [neverOpen, setNeverOpen] = useState(false);
  const [openPauseId, setOpenPauseId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const dismissedPauseMenu = useRef(false);

  useEffect(() => {
    if (view !== "library") return;
    let active = true;
    setError("");
    api.exercises("active", query, filter)
      .then((items) => active && setExercises(items))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Could not load exercises."));
    return () => { active = false; };
  }, [view, query, filter]);

  useEffect(() => {
    if (view !== "recommendations") return;
    let active = true;
    setError("");
    api.exerciseRecommendations(day, { includePaused })
      .then((items) => active && setRecommendations(items))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Could not load recommendations."));
    return () => { active = false; };
  }, [view, day, includePaused]);

  function choose(exercise: Exercise) {
    if (dismissedPauseMenu.current) {
      dismissedPauseMenu.current = false;
      return;
    }
    if (presentIds.includes(exercise.id)) {
      setNotice(`${exercise.name} is already added to this day.`);
      return;
    }
    onChoose(exercise);
  }

  async function pause(item: RecommendationItem, period: "week" | "month" | "six_months" | "year" | "forever" | "resume") {
    try {
      await api.updateRecommendationPause(item.exercise.id, period);
      setNotice(period === "resume" ? `${item.exercise.name} resumed.` : `${item.exercise.name} paused from recommendations.`);
      setRecommendations(await api.exerciseRecommendations(day, { includePaused }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update recommendation pause.");
    }
  }

  function recommendationResult(item: RecommendationItem) {
    const alreadyAdded = presentIds.includes(item.exercise.id);
    return <article className="exercise-result-row" key={item.exercise.id}>
      <button className="exercise-result" disabled={alreadyAdded} onClick={() => choose(item.exercise)}>
        <ExerciseImage imageKey={item.exercise.imageKey} name={item.exercise.name} />
        <span><strong>{item.exercise.name}</strong><small>{alreadyAdded ? "Already added" : `${elapsed(item.daysSinceLastDone, "Last done")} · ${item.exercise.primaryMuscle?.replaceAll("_", " ") ?? "Muscles not set"}`}</small></span>
      </button>
      <details className="pause-menu" open={openPauseId === item.exercise.id} onToggle={(event) => setOpenPauseId(event.currentTarget.open ? item.exercise.id : null)}>
        <summary aria-label={`Pause recommendations for ${item.exercise.name}`}><Pause /></summary>
        <div>{item.paused ? <button onClick={() => void pause(item, "resume")}>Resume recommendations</button> : <><span>Pause recommendations</span><button onClick={() => void pause(item, "week")}>1 week</button><button onClick={() => void pause(item, "month")}>1 month</button><button onClick={() => void pause(item, "six_months")}>6 months</button><button onClick={() => void pause(item, "year")}>1 year</button><button onClick={() => void pause(item, "forever")}>Indefinitely</button></>}</div>
      </details>
    </article>;
  }

  if (creating) {
    return <Modal title="New exercise" onClose={() => setCreating(false)} wide>
      <ExerciseEditor onCancel={() => setCreating(false)} onSaved={onChoose} />
    </Modal>;
  }

  if (view === "recommendations") {
    const hasResults = Boolean(recommendations?.allExercises.length);
    return <Modal title="Recommendations" onClose={onClose} wide>
      <div className="recommendation-toolbar"><button className="secondary" onClick={() => setView("library")}>Back to exercise library</button><button className="primary" onClick={() => setCreating(true)}><Plus />New exercise</button></div>
      <p className="recommendation-intro">Suggestions are ordered by the muscle groups you have trained least recently.</p>
      <label className="checkbox-row recommendation-paused"><input type="checkbox" checked={includePaused} onChange={(event) => setIncludePaused(event.target.checked)} />Show paused</label>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="exercise-results" onPointerDownCapture={(event) => {
        if (openPauseId === null || (event.target as HTMLElement).closest(".pause-menu")) return;
        setOpenPauseId(null);
        if ((event.target as HTMLElement).closest(".exercise-result")) dismissedPauseMenu.current = true;
      }}>
        {recommendations?.groups.map((group) => <section className="recommendation-group" key={group.muscle}><h3>{group.muscleName}<small>{elapsed(group.daysSinceLastTrained, "Last trained")}</small></h3>{group.exercises.map(recommendationResult)}</section>)}
        {recommendations?.unclassified.length ? <section className="recommendation-group"><h3>Muscles not set</h3>{recommendations.unclassified.map(recommendationResult)}</section> : null}
        {recommendations?.neverTried.length ? <section className="never-tried"><button className="never-tried-toggle" onClick={() => setNeverOpen(!neverOpen)} aria-expanded={neverOpen}>Never tried ({recommendations.neverTried.length}) <ChevronDown className={neverOpen ? "rotated" : ""} /></button>{neverOpen && recommendations.neverTried.map(recommendationResult)}</section> : null}
        {!error && recommendations && !hasResults && <p className="empty-copy">No recommendations available.</p>}
      </div>
    </Modal>;
  }

  return <Modal title="Add exercise" onClose={onClose} wide>
    <div className="picker-toolbar"><label className="search-box"><Search /><span className="sr-only">Search exercises</span><input type="search" placeholder="Search exercises" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus /></label><button className="primary" onClick={() => setCreating(true)}><Plus />New exercise</button></div>
    <div className="filter-row" aria-label="Measurement filter"><button className={!filter ? "selected" : ""} onClick={() => setFilter("")}>All</button><button className={filter === "repetitions" ? "selected" : ""} onClick={() => setFilter("repetitions")}>Repetitions</button><button className={filter === "duration" ? "selected" : ""} onClick={() => setFilter("duration")}>Duration</button><button className={filter === "timed_repetitions" ? "selected" : ""} onClick={() => setFilter("timed_repetitions")}>Timed repetitions</button></div>
    <button className="secondary recommendations-button" onClick={() => setView("recommendations")}><Sparkles />Show recommendations</button>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="exercise-results">
      {exercises.map((exercise) => <button key={exercise.id} className="exercise-result" onClick={() => choose(exercise)}><ExerciseImage imageKey={exercise.imageKey} name={exercise.name} /><span><strong>{exercise.name}</strong><small>{exercise.measurementType === "repetitions" ? "Repetitions" : exercise.measurementType === "duration" ? "Duration" : "Timed repetitions"}</small></span></button>)}
      {!error && exercises.length === 0 && <p className="empty-copy">No matching exercises.</p>}
    </div>
  </Modal>;
}
