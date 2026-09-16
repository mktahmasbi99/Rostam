import { CalendarDays, Dumbbell, ListChecks, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CalendarPage } from "./components/CalendarPage";
import { DayPage } from "./components/DayPage";
import { ExercisesPage } from "./components/ExercisesPage";
import { SettingsPage } from "./components/SettingsPage";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { api } from "./lib/api";
import type { Config } from "./lib/types";

type Tab = "today" | "calendar" | "exercises" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
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
      {tab === "today" && <DayPage day={selectedDay} today={config.today} onDayChange={setSelectedDay} />}
      {tab === "calendar" && <CalendarPage today={config.today} onChooseDay={(day) => { setSelectedDay(day); setTab("today"); }} />}
      {tab === "exercises" && <ExercisesPage />}
      {tab === "settings" && <SettingsPage config={config} pwaInstall={pwaInstall} />}
    </div>
    <nav className="bottom-nav" aria-label="Primary navigation">
      <button className={tab === "today" ? "active" : ""} onClick={() => { setSelectedDay(config.today); setTab("today"); }}><ListChecks /><span>Today</span></button>
      <button className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}><CalendarDays /><span>Calendar</span></button>
      <button className={tab === "exercises" ? "active" : ""} onClick={() => setTab("exercises")}><Dumbbell /><span>Exercises</span></button>
      <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings /><span>Settings</span></button>
    </nav>
  </div>;
}
