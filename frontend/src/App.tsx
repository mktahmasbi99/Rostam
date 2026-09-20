import { Dumbbell, Images, ListChecks, NotebookPen, Ruler, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CalendarPage } from "./components/CalendarPage";
import { DayPage } from "./components/DayPage";
import { ExercisesPage } from "./components/ExercisesPage";
import { SettingsPage } from "./components/SettingsPage";
import { NotesPage } from "./components/NotesPage";
import { PhotosPage } from "./components/PhotosPage";
import { MeasurementsPage } from "./components/MeasurementsPage";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { api } from "./lib/api";
import type { Config } from "./lib/types";

type Tab = "today" | "notes" | "photos" | "measurements" | "exercises" | "settings";

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

  if (!config) return <div className="startup"><img className="app-logo startup-logo" src="/rostam-logo.png" alt="" /><h1>Rostam</h1>{error ? <><p className="error">{error}</p><button onClick={() => void loadConfig()}>Retry</button></> : <p>Loading your ledger…</p>}</div>;

  return <div className="app-shell">
    <div className="brand"><img className="app-logo brand-logo" src="/rostam-logo.png" alt="" /><strong>Rostam</strong></div>
    <div className="content">
      {tab === "today" && <DayPage day={selectedDay} today={config.today} onOpenCalendar={() => setCalendarOpen(true)} />}
      {tab === "notes" && <NotesPage onChooseDay={(day) => { setSelectedDay(day); setTab("today"); }} />}
      {tab === "photos" && <PhotosPage onChooseDay={(day) => { setSelectedDay(day); setTab("today"); }} />}
      {tab === "measurements" && <MeasurementsPage today={config.today} />}
      {tab === "exercises" && <ExercisesPage />}
      {tab === "settings" && <SettingsPage config={config} pwaInstall={pwaInstall} />}
    </div>
    {calendarOpen && <CalendarPage today={config.today} onChooseDay={(day) => { setSelectedDay(day); setTab("today"); setCalendarOpen(false); }} onClose={() => setCalendarOpen(false)} />}
    <nav className="bottom-nav" aria-label="Primary navigation">
      <button aria-label="Today" title="Today" className={tab === "today" ? "active" : ""} onClick={() => { setSelectedDay(config.today); setTab("today"); setCalendarOpen(false); }}><ListChecks /></button>
      <button aria-label="Exercises" title="Exercises" className={tab === "exercises" ? "active" : ""} onClick={() => { setTab("exercises"); setCalendarOpen(false); }}><Dumbbell /></button>
      <button aria-label="Notes" title="Notes" className={tab === "notes" ? "active" : ""} onClick={() => { setTab("notes"); setCalendarOpen(false); }}><NotebookPen /></button>
      <button aria-label="Photos" title="Photos" className={tab === "photos" ? "active" : ""} onClick={() => { setTab("photos"); setCalendarOpen(false); }}><Images /></button>
      <button aria-label="Measurements" title="Measurements" className={tab === "measurements" ? "active" : ""} onClick={() => { setTab("measurements"); setCalendarOpen(false); }}><Ruler /></button>
      <button aria-label="Settings" title="Settings" className={tab === "settings" ? "active" : ""} onClick={() => { setTab("settings"); setCalendarOpen(false); }}><Settings /></button>
    </nav>
  </div>;
}
