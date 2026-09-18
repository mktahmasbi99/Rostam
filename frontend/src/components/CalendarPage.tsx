import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

interface Props {
  today: string;
  onChooseDay: (day: string) => void;
  onClose: () => void;
}

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftMonth(month: string, amount: number): string {
  const value = new Date(`${month}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + amount);
  return value.toISOString().slice(0, 7);
}

export function CalendarPage({ today, onChooseDay, onClose }: Props) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    api.calendar(month).then((result) => active && setActiveDates(result.activeDates)).catch((caught) => active && setError(caught instanceof Error ? caught.message : "Could not load calendar."));
    return () => { active = false; };
  }, [month]);

  const cells = useMemo(() => {
    const first = new Date(`${month}-01T12:00:00Z`);
    const offset = (first.getUTCDay() + 6) % 7;
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const count = Math.round((next.getTime() - first.getTime()) / 86400000);
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)];
  }, [month]);

  const title = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));

  return <div className="calendar-backdrop" data-testid="calendar-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-title">
      <header className="calendar-dialog-header"><h1 id="calendar-title">Calendar</h1><button className="icon-button" aria-label="Close calendar" onClick={onClose}><X /></button></header>
      <p className="calendar-description">A dot means at least one exercise occurred.</p>
      <div className="month-header"><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></button><h2>{title}</h2><button className="icon-button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></button></div>
      <div className="calendar-grid weekday-row">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{cells.map((day, index) => day ? <button key={day} className={`calendar-day ${day === today ? "today" : ""}`} disabled={day > today} onClick={() => onChooseDay(day)} aria-label={`${day}${activeDates.includes(day) ? ", exercise recorded" : ""}`}><span>{Number(day.slice(-2))}</span>{activeDates.includes(day) && <i className="activity-dot" />}</button> : <span key={`blank-${index}`} />)}</div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary calendar-jump" onClick={() => onChooseDay(today)}>Jump to Today</button>
    </section>
  </div>;
}
