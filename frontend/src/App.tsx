import { Dumbbell, Images, ListChecks, NotebookPen, RotateCw, Ruler, Settings } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { DayPage } from "./components/DayPage";
import { DeferredBoundary } from "./components/DeferredBoundary";
import { UpdateBanner } from "./components/UpdateBanner";
const ExercisesPage = lazy(() => import("./components/ExercisesPage").then((module) => ({ default: module.ExercisesPage })));
const SettingsPage = lazy(() => import("./components/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const NotesPage = lazy(() => import("./components/NotesPage").then((module) => ({ default: module.NotesPage })));
const PhotosPage = lazy(() => import("./components/PhotosPage").then((module) => ({ default: module.PhotosPage })));
const MeasurementsPage = lazy(() => import("./components/MeasurementsPage").then((module) => ({ default: module.MeasurementsPage })));
const RotationsPage = lazy(() => import("./components/RotationsPage").then((module) => ({ default: module.RotationsPage })));
const CalendarPage = lazy(() => import("./components/CalendarPage").then((module) => ({ default: module.CalendarPage })));
import { usePwaInstall } from "./hooks/usePwaInstall";
import { api } from "./lib/api";
import type { Config } from "./lib/types";
import { artwork } from "./artwork";

type Tab = "today" | "notes" | "photos" | "measurements" | "exercises" | "rotations" | "settings";

function Backdrop() {
  return <picture className="site-backdrop">
    <source media="(max-width: 768px)" type="image/webp" srcSet={artwork.background768.webp} />
    <source media="(max-width: 768px)" type="image/jpeg" srcSet={artwork.background768.jpeg} />
    <source type="image/webp" srcSet={artwork.background1214.webp} />
    <img src={artwork.background1214.jpeg} alt="" />
  </picture>;
}

function Logo({ className, sizes }: { className: string; sizes: string }) {
  return <picture>
    <source type="image/webp" srcSet={artwork.logo.webp} sizes={sizes} />
    <img className={className} src={artwork.logo.src} srcSet={artwork.logo.png} sizes={sizes} alt="" />
  </picture>;
}

function shiftDay(day: string, amount: number): string {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [error, setError] = useState("");
  const pwaInstall = usePwaInstall();

  const loadConfig = useCallback(async () => {
    try {
      const next = await api.config();
      setConfig((current) => {
        if (!selectedDay || selectedDay === current?.today) setSelectedDay(next.today);
        return next;
      });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach Rostam.");
    }
  }, [selectedDay]);

  useEffect(() => { void loadConfig(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const refresh = () => void loadConfig();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, [loadConfig]);

  if (!config) return <><Backdrop /><div className="startup"><Logo className="app-logo startup-logo" sizes="112px" /><h1>Rostam</h1>{error ? <><p className="error">{error}</p><button onClick={() => void loadConfig()}>Retry</button></> : <p>Loading your ledger…</p>}</div></>;

  const goToToday = () => {
    setSelectedDay(config.today);
    setTab("today");
    setCalendarOpen(false);
  };

  return <><Backdrop /><div data-rostam-app className="app-shell">
    <UpdateBanner />
    <div className="brand"><button className="brand-home" aria-label="Go to Today" title="Go to Today" onClick={goToToday}><Logo className="app-logo brand-logo" sizes="44px" /></button></div>
    <div className="content">
      <DeferredBoundary key={tab}><Suspense fallback={<div className="deferred-loading" role="status">Loading page…</div>}>
      {tab === "today" && <DayPage key={selectedDay}
        day={selectedDay}
        today={config.today}
        timezone={config.timezone}
        onOpenCalendar={() => setCalendarOpen(true)}
        onPreviousDay={() => setSelectedDay(shiftDay(selectedDay, -1))}
        onNextDay={() => setSelectedDay(shiftDay(selectedDay, 1))}
        onChooseDay={(day) => setSelectedDay(day)}
      />}
      {tab === "notes" && <NotesPage today={config.today} onChooseDay={(day) => { setSelectedDay(day); setTab("today"); }} />}
      {tab === "photos" && <PhotosPage onChooseDay={(day) => { setSelectedDay(day); setTab("today"); }} />}
      {tab === "measurements" && <MeasurementsPage today={config.today} />}
      {tab === "exercises" && <ExercisesPage />}
      {tab === "rotations" && <RotationsPage />}
      {tab === "settings" && <SettingsPage config={config} pwaInstall={pwaInstall} />}
      </Suspense></DeferredBoundary>
    </div>
    {calendarOpen && <DeferredBoundary key="calendar"><Suspense fallback={<div className="deferred-loading" role="status">Loading calendar…</div>}><CalendarPage today={config.today} onChooseDay={(day) => { setSelectedDay(day); setTab("today"); setCalendarOpen(false); }} onClose={() => setCalendarOpen(false)} /></Suspense></DeferredBoundary>}
    <nav className="bottom-nav" aria-label="Primary navigation">
      <button aria-label="Today" title="Today" className={tab === "today" ? "active" : ""} onClick={goToToday}><ListChecks /></button>
      <button aria-label="Exercises" title="Exercises" className={tab === "exercises" ? "active" : ""} onClick={() => { setTab("exercises"); setCalendarOpen(false); }}><Dumbbell /></button>
      <button aria-label="Rotations" title="Rotations" className={tab === "rotations" ? "active" : ""} onClick={() => { setTab("rotations"); setCalendarOpen(false); }}><RotateCw /></button>
      <button aria-label="Notes" title="Notes" className={tab === "notes" ? "active" : ""} onClick={() => { setTab("notes"); setCalendarOpen(false); }}><NotebookPen /></button>
      <button aria-label="Photos" title="Photos" className={tab === "photos" ? "active" : ""} onClick={() => { setTab("photos"); setCalendarOpen(false); }}><Images /></button>
      <button aria-label="Measurements" title="Measurements" className={tab === "measurements" ? "active" : ""} onClick={() => { setTab("measurements"); setCalendarOpen(false); }}><Ruler /></button>
      <button aria-label="Settings" title="Settings" className={tab === "settings" ? "active" : ""} onClick={() => { setTab("settings"); setCalendarOpen(false); }}><Settings /></button>
    </nav>
  </div></>;
}
