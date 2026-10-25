import { ChevronDown, Pause, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import type { Exercise, ExerciseRecommendations, MeasurementType, RecommendationItem, Rotation } from "../lib/types";
import { ExerciseEditor } from "./ExerciseEditor";
import { ExerciseImage } from "./ExerciseImage";
import { Modal } from "./Modal";
import { ReadState } from "./ReadState";

interface Props {
  day: string;
  today?: string;
  presentIds: number[];
  onChoose: (exercise: Exercise) => void;
  onClose: () => void;
}

type View = "library" | "recommendations";
type RecommendationMode = "rotation" | "exercise" | "muscle";

interface RecommendationRun {
  label: string;
  items: RecommendationItem[];
}

const elapsed = (days: number | null, label: string) =>
  days === null ? "Never done" : `${label} ${days === 1 ? "1 day" : `${days} days`} ago`;

function muscleLabel(slug: string | null | undefined, recommendations: ExerciseRecommendations): string {
  if (!slug) return "Muscles not set";
  return recommendations.muscleGroups.find((group) => group.slug === slug)?.name
    ?? slug.replaceAll("_", " ");
}

function exerciseRecommendationRuns(recommendations: ExerciseRecommendations): RecommendationRun[] {
  const ordered = [...recommendations.allExercises]
    .filter((item) => item.daysSinceLastDone !== null)
    .sort((left, right) => {
      const ageDifference = (right.daysSinceLastDone ?? 0) - (left.daysSinceLastDone ?? 0);
      return ageDifference || left.exercise.name.toLocaleLowerCase().localeCompare(right.exercise.name.toLocaleLowerCase());
    });
  return ordered.reduce<RecommendationRun[]>((runs, item) => {
    const label = muscleLabel(item.exercise.primaryMuscle, recommendations);
    const previous = runs.at(-1);
    if (previous?.label === label) {
      previous.items.push(item);
    } else {
      runs.push({ label, items: [item] });
    }
    return runs;
  }, []);
}

export function ExercisePicker({ day, today, presentIds, onChoose, onClose }: Props) {
  const [view, setView] = useState<View>("library");
  const [rotation, setRotation] = useState<Rotation | null>(null);
  const [loadingRotation, setLoadingRotation] = useState(true);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exercisesLoaded, setExercisesLoaded] = useState(false);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [recommendations, setRecommendations] = useState<ExerciseRecommendations | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [readRetry, setReadRetry] = useState(0);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 275);
  const [immediateQuery, setImmediateQuery] = useState<string | null>(null);
  const searchQuery = immediateQuery ?? debouncedQuery;
  const [filter, setFilter] = useState<"" | MeasurementType>("");
  const [includePaused, setIncludePaused] = useState(false);
  const [recommendationMode, setRecommendationMode] = useState<RecommendationMode>("exercise");
  const [neverOpen, setNeverOpen] = useState(false);
  const [openPauseId, setOpenPauseId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const exerciseSearchController = useRef<AbortController | null>(null);
  const dismissedPauseMenu = useRef(false);
  const restoringPreference = useRef(false);
  const rotationMode = recommendationMode === "rotation";

  useEffect(() => {
    let active = true;
    api.rotations().then((items) => {
      if (!active) return;
      const current = day === today ? items.find((item) => item.active) ?? null : null;
      setRotation(current);
      if (current) { setView("recommendations"); setRecommendationMode("rotation"); }
      else {
        const last = window.localStorage.getItem("rostam-picker-view");
        if (last === "exercise" || last === "muscle") {
          restoringPreference.current = true;
          setView("recommendations"); setRecommendationMode(last);
        }
      }
    }).catch(() => { /* Library remains available if rotations cannot load. */ })
      .finally(() => active && setLoadingRotation(false));
    return () => { active = false; };
  }, [day, today]);

  function selectRecommendationMode(mode: RecommendationMode) {
    restoringPreference.current = false;
    setRecommendationMode(mode);
    if (mode !== "rotation") window.localStorage.setItem("rostam-picker-view", mode);
  }

  useEffect(() => {
    if (view !== "library") return;
    const controller = new AbortController();
    exerciseSearchController.current = controller;
    let active = true;
    setError("");
    setLoadingExercises(true);
    api.exercises("active", searchQuery, filter, controller.signal)
      .then((items) => { if (active && !controller.signal.aborted) { setExercises(items); setExercisesLoaded(true); } })
      .catch((caught) => active && !controller.signal.aborted && setError(caught instanceof Error ? caught.message : "Could not load exercises."))
      .finally(() => active && !controller.signal.aborted && setLoadingExercises(false));
    return () => { active = false; controller.abort(); };
  }, [view, searchQuery, filter, readRetry]);

  useEffect(() => {
    if (view !== "recommendations" || rotationMode) return;
    let active = true;
    setError("");
    setLoadingRecommendations(true);
    api.exerciseRecommendations(day, { includePaused })
      .then((items) => {
        if (!active) return;
        setRecommendations(items);
        if (restoringPreference.current && !items.allExercises.some((item) => item.daysSinceLastDone !== null)) {
          setView("library");
          window.localStorage.setItem("rostam-picker-view", "library");
        }
        restoringPreference.current = false;
      })
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Could not load recommendations."))
      .finally(() => active && setLoadingRecommendations(false));
    return () => { active = false; };
  }, [view, day, includePaused, rotationMode, readRetry]);

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

  if (loadingRotation) return <Modal title="Add exercise" onClose={onClose} wide><p>Loading exercises…</p></Modal>;

  if (view === "recommendations") {
    const hasResults = Boolean(recommendations?.allExercises.length);
    const exerciseRuns = recommendations ? exerciseRecommendationRuns(recommendations) : [];
    return <Modal title="Recommendations" onClose={onClose} wide>
      <div className="recommendation-toolbar"><button className="secondary" onClick={() => { setView("library"); window.localStorage.setItem("rostam-picker-view", "library"); }}>Go to exercise library</button><button className="primary" onClick={() => setCreating(true)}><Plus />New exercise</button></div>
      <div className="segmented recommendation-mode" role="group" aria-label="Recommendation view">
        {rotation && <button type="button" className={recommendationMode === "rotation" ? "selected" : ""} aria-pressed={recommendationMode === "rotation"} onClick={() => selectRecommendationMode("rotation")}>Rotation</button>}
        <button type="button" className={recommendationMode === "exercise" ? "selected" : ""} aria-pressed={recommendationMode === "exercise"} onClick={() => selectRecommendationMode("exercise")}>By exercise</button>
        <button type="button" className={recommendationMode === "muscle" ? "selected" : ""} aria-pressed={recommendationMode === "muscle"} onClick={() => selectRecommendationMode("muscle")}>By muscle</button>
      </div>
      <p className="recommendation-intro">{recommendationMode === "rotation" ? "Your due exercise comes first, followed by the rest of your rotation." : recommendationMode === "exercise" ? "Suggestions are ordered by when you last did each exercise." : "Suggestions are ordered by the muscle groups you have trained least recently."}</p>
      {recommendationMode !== "rotation" && <label className="checkbox-row recommendation-paused"><input type="checkbox" checked={includePaused} onChange={(event) => setIncludePaused(event.target.checked)} />Show paused</label>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <ReadState loading={loadingRecommendations} error={error} hasData={recommendations !== null} onRetry={() => setReadRetry((value) => value + 1)} loadingText="Loading recommendations…" />
      <div className="exercise-results" onPointerDownCapture={(event) => {
        if (openPauseId === null || (event.target as HTMLElement).closest(".pause-menu")) return;
        setOpenPauseId(null);
        if ((event.target as HTMLElement).closest(".exercise-result")) dismissedPauseMenu.current = true;
      }}>
        {recommendationMode === "rotation" && rotation && <section className="recommendation-group rotation-recommendations"><h3>{rotation.name}</h3>{(() => {
          const dueIndex = rotation.duePosition ?? rotation.members.findIndex((member) => member.exercise.id === rotation.dueExerciseId);
          const ordered = dueIndex < 0 ? rotation.members : [...rotation.members.slice(dueIndex), ...rotation.members.slice(0, dueIndex)];
          const seen = new Map<number, number>();
          const totals = new Map<number, number>();
          rotation.members.forEach((member) => totals.set(member.exercise.id, (totals.get(member.exercise.id) ?? 0) + 1));
          return ordered.map((member, index) => {
            const memberPosition = member.position ?? rotation.members.indexOf(member);
            const occurrence = (seen.get(member.exercise.id) ?? 0) + 1;
            seen.set(member.exercise.id, occurrence);
            const due = memberPosition === dueIndex;
            const added = presentIds.includes(member.exercise.id);
            return <div className={due && day === today ? "rotation-due-row" : undefined} key={member.position ?? index}>
              <button className={`exercise-result rotation-result ${due ? "due" : ""} ${due && added ? "muted" : ""}`} disabled={added} onClick={() => choose(member.exercise)}><ExerciseImage imageKey={member.exercise.imageKey} name={member.exercise.name} /><span><strong>{member.exercise.name}{(totals.get(member.exercise.id) ?? 0) > 1 ? ` · ${occurrence}` : ""}</strong><small>{due && <b>Due · </b>}{elapsed(member.daysSinceLastDone, "Last done")}</small>{due && added && <em className="rotation-badge">Added today</em>}{!due && added && <small>Already added</small>}</span></button>
              {due && day === today && <div className="rotation-skip">{rotation.resolvedToday === "skipped" ? <><strong>Skipped today</strong><button className="secondary" onClick={async () => { try { setRotation(await api.undoRotationSkip(rotation.id)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not undo skip."); } }}>Undo skip</button></> : !rotation.resolvedToday && <button className="secondary" onClick={async () => { try { setRotation(await api.skipRotation(rotation.id)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not skip exercise."); } }}>Skip exercise</button>}</div>}
            </div>;
          });
        })()}</section>}
        {recommendationMode === "exercise"
          ? exerciseRuns.map((run, index) => <section className="recommendation-group" key={`${run.label}-${index}`}><h3>{run.label}</h3>{run.items.map(recommendationResult)}</section>)
          : recommendationMode === "muscle" ? <>
            {recommendations?.groups.map((group) => <section className="recommendation-group" key={group.muscle}><h3>{group.muscleName}<small>{elapsed(group.daysSinceLastTrained, "Last trained")}</small></h3>{group.exercises.map(recommendationResult)}</section>)}
            {recommendations?.unclassified.length ? <section className="recommendation-group"><h3>Muscles not set</h3>{recommendations.unclassified.map(recommendationResult)}</section> : null}
          </> : null}
        {recommendationMode !== "rotation" && recommendations?.neverTried.length ? <section className="never-tried"><button className="never-tried-toggle" onClick={() => setNeverOpen(!neverOpen)} aria-expanded={neverOpen}>Never tried ({recommendations.neverTried.length}) <ChevronDown className={neverOpen ? "rotated" : ""} /></button>{neverOpen && recommendations.neverTried.map(recommendationResult)}</section> : null}
      {recommendationMode !== "rotation" && recommendations && !hasResults && <p className="empty-copy">No recommendations available.</p>}
      </div>
    </Modal>;
  }

  return <Modal title="Add exercise" onClose={onClose} wide>
    <div className="picker-toolbar"><label className="search-box"><Search /><span className="sr-only">Search exercises</span><input type="search" placeholder="Search exercises" value={query} onChange={(event) => { exerciseSearchController.current?.abort(); setImmediateQuery(null); setQuery(event.target.value); }} autoFocus /></label><button className="primary" onClick={() => setCreating(true)}><Plus />New exercise</button></div>
    <div className="filter-row" aria-label="Measurement filter"><button className={!filter ? "selected" : ""} onClick={() => { setImmediateQuery(query); setFilter(""); }}>All</button><button className={filter === "repetitions" ? "selected" : ""} onClick={() => { setImmediateQuery(query); setFilter("repetitions"); }}>Reps</button><button className={filter === "duration" ? "selected" : ""} onClick={() => { setImmediateQuery(query); setFilter("duration"); }}>Duration</button><button className={filter === "timed_repetitions" ? "selected" : ""} onClick={() => { setImmediateQuery(query); setFilter("timed_repetitions"); }}>Timed reps</button></div>
    <button className="secondary recommendations-button icon-only-action" aria-label="Show recommendations" title="Show recommendations" onClick={() => { selectRecommendationMode(rotation ? "rotation" : "exercise"); setView("recommendations"); }}><Sparkles /></button>
    {notice && <p className="notice" role="status">{notice}</p>}
    <ReadState loading={loadingExercises} error={error} hasData={exercisesLoaded} onRetry={() => setReadRetry((value) => value + 1)} loadingText="Loading exercises…" />
    <div className="exercise-results">
      {exercises.map((exercise) => <button key={exercise.id} className="exercise-result" disabled={presentIds.includes(exercise.id)} onClick={() => choose(exercise)}><ExerciseImage imageKey={exercise.imageKey} name={exercise.name} /><span><strong>{exercise.name}</strong><small>{presentIds.includes(exercise.id) ? "Already added" : exercise.measurementType === "repetitions" ? "Reps" : exercise.measurementType === "duration" ? "Duration" : "Timed reps"}</small></span></button>)}
      {exercisesLoaded && !loadingExercises && !error && exercises.length === 0 && <p className="empty-copy">No matching exercises.</p>}
    </div>
  </Modal>;
}
