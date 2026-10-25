import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { AccessibleDialog } from "./AccessibleDialog";
import { ReadState } from "./ReadState";

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
  const [activeDatesMonth, setActiveDatesMonth] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    api.calendar(month, controller.signal).then((result) => { if (active) { setActiveDates(result.activeDates); setActiveDatesMonth(month); setLoaded(true); } }).catch((caught) => active && !controller.signal.aborted && setError(caught instanceof Error ? caught.message : "Could not load calendar.")).finally(() => active && setLoading(false));
    return () => { active = false; controller.abort(); };
  }, [month, retry]);

  const cells = useMemo(() => {
    const first = new Date(`${month}-01T12:00:00Z`);
    const offset = (first.getUTCDay() + 6) % 7;
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const count = Math.round((next.getTime() - first.getTime()) / 86400000);
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)];
  }, [month]);

  const title = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));

  return <AccessibleDialog backdropClassName="calendar-backdrop" className="" panelClassName="calendar-dialog" labelledBy="calendar-title" onClose={onClose} testId="calendar-backdrop">
      <header className="calendar-dialog-header"><h1 id="calendar-title">Calendar</h1><button className="icon-button" aria-label="Close calendar" onClick={onClose}><X /></button></header>
      <div className="calendar-dialog-body">
        <p className="calendar-description">A dot means at least one exercise occurred.</p>
        <div className="month-header"><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></button><h2>{title}</h2><button className="icon-button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></button></div>
        <div className="calendar-grid weekday-row">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <ReadState loading={loading} error={error} hasData={loaded && activeDatesMonth === month} onRetry={() => setRetry((value) => value + 1)} loadingText="Loading calendar…" />
        <div className="calendar-grid">{cells.map((day, index) => day ? <button key={day} className={`calendar-day ${day === today ? "today" : ""}`} disabled={day > today} onClick={() => onChooseDay(day)} aria-label={`${day}${activeDatesMonth === month && activeDates.includes(day) ? ", exercise recorded" : ""}`}><span>{Number(day.slice(-2))}</span>{activeDatesMonth === month && activeDates.includes(day) && <i className="activity-dot" />}</button> : <span key={`blank-${index}`} />)}</div>
      </div>
      <button className="primary calendar-jump" onClick={() => onChooseDay(today)}>Jump to Today</button>
  </AccessibleDialog>;
}
