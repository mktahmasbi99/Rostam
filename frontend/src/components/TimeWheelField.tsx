import { Check, Clock3, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const ROW_HEIGHT = 36;
const MAX_MINUTE = 23 * 60 + 59;

function parseTime(value: string) {
  const [hour = "00", minute = "00"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}
function formatTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function Wheel({ label, values, selected, onSelect, disabledValues = [] }: { label: string; values: number[]; selected: number; onSelect: (value: number) => void; disabledValues?: number[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const lastSelection = useRef(selected);
  const mouseDrag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const valuesKey = values.join(",");
  useLayoutEffect(() => {
    // Only external changes reposition the wheel; its own scroll updates must
    // leave the browser's touch momentum uninterrupted.
    clearTimeout(settleTimer.current);
    if (scroller.current) scroller.current.scrollTop = values.indexOf(selected) * ROW_HEIGHT;
    lastSelection.current = selected;
    // The range can change when the other wheel changes hour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey]);
  useLayoutEffect(() => {
    if (selected !== lastSelection.current && scroller.current) {
      clearTimeout(settleTimer.current);
      scroller.current.scrollTop = values.indexOf(selected) * ROW_HEIGHT;
      lastSelection.current = selected;
    }
  }, [selected, values]);
  useEffect(() => () => clearTimeout(settleTimer.current), []);
  const disabled = new Set(disabledValues);
  const moveToEnabled = (target: number, direction: number) => {
    let next = Math.max(0, Math.min(values.length - 1, target));
    while (next >= 0 && next < values.length && disabled.has(values[next])) next += direction;
    if (next < 0 || next >= values.length) {
      next = Math.max(0, Math.min(values.length - 1, target - direction));
      while (next >= 0 && next < values.length && disabled.has(values[next])) next -= direction;
    }
    return next >= 0 && next < values.length && !disabled.has(values[next]) ? values[next] : undefined;
  };
  const step = (amount: number) => {
    const index = values.indexOf(selected);
    const direction = amount < 0 ? -1 : 1;
    const next = moveToEnabled(index + amount, direction);
    if (next !== undefined) onSelect(next);
  };
  useEffect(() => {
    const element = scroller.current?.parentElement;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY !== 0) step(event.deltaY > 0 ? 1 : -1);
    };
    element?.addEventListener("wheel", handleWheel, { passive: false });
    return () => element?.removeEventListener("wheel", handleWheel);
  });
  const handleScroll = () => {
    const element = scroller.current;
    if (!element) return;
    const index = Math.round(element.scrollTop / ROW_HEIGHT);
    const direction = index < values.indexOf(lastSelection.current) ? -1 : 1;
    const next = moveToEnabled(index, direction);
    if (next !== undefined && next !== lastSelection.current) {
      lastSelection.current = next;
      onSelect(next);
    }
    clearTimeout(settleTimer.current);
    // Scroll events keep this pending throughout native inertia. Once it stops,
    // align any unavailable value to the nearest permitted row.
    settleTimer.current = setTimeout(() => {
      if (next !== undefined && Math.abs(element.scrollTop - values.indexOf(next) * ROW_HEIGHT) > 1) {
        element.scrollTo({ top: values.indexOf(next) * ROW_HEIGHT, behavior: "smooth" });
      }
    }, 160);
  };
  return <div className="time-wheel-column">
    <span className="time-wheel-label">{label}</span>
    <div className="time-wheel" role="spinbutton" aria-label={label} aria-valuenow={selected} aria-valuemin={values[0]} aria-valuemax={values.at(-1)} tabIndex={0}
      onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowRight") { event.preventDefault(); step(1); } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") { event.preventDefault(); step(-1); } else if (event.key === "Home") { event.preventDefault(); const next = moveToEnabled(0, 1); if (next !== undefined) onSelect(next); } else if (event.key === "End") { event.preventDefault(); const next = moveToEnabled(values.length - 1, -1); if (next !== undefined) onSelect(next); } }}>
      <div className="time-wheel-fade" />
      <div className="time-wheel-scroll" ref={scroller} onScroll={handleScroll}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          clearTimeout(settleTimer.current);
          mouseDrag.current = { y: event.clientY, top: event.currentTarget.scrollTop, moved: false };
        }}
        onPointerMove={(event) => {
          const drag = mouseDrag.current;
          if (!drag || event.pointerType !== "mouse" || !(event.buttons & 1)) return;
          const distance = drag.y - event.clientY;
          if (Math.abs(distance) > 4) {
            drag.moved = true;
            event.currentTarget.style.scrollSnapType = "none";
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.scrollTop = drag.top + distance;
          }
        }}
        onPointerUp={(event) => {
          if (event.pointerType !== "mouse") return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          event.currentTarget.style.scrollSnapType = "";
          handleScroll();
        }}
        onPointerCancel={(event) => { mouseDrag.current = null; event.currentTarget.style.scrollSnapType = ""; }}
        onClickCapture={(event) => {
          if (mouseDrag.current?.moved) { event.preventDefault(); event.stopPropagation(); }
          mouseDrag.current = null;
        }}>
        {values.map((value) => <button type="button" tabIndex={-1} aria-hidden="true" disabled={disabled.has(value)} key={value} className={`time-wheel-option ${value === selected ? "selected" : ""} ${disabled.has(value) ? "disabled" : ""}`} onClick={() => onSelect(value)}>{String(value).padStart(2, "0")}</button>)}
      </div>
    </div>
  </div>;
}

export function TimeWheelField({ label, value, onChange, min = 0, max = MAX_MINUTE, blockedIntervals = [] }: { label: string; value: string; onChange: (value: string) => void; min?: number; max?: number; blockedIntervals?: { startMinute: number; endMinute: number }[] }) {
  const boundedMin = Math.max(0, Math.min(MAX_MINUTE, min));
  const boundedMax = Math.max(boundedMin, Math.min(MAX_MINUTE, max));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(parseTime(value));
  const safeValue = Math.max(boundedMin, Math.min(boundedMax, parseTime(value)));
  const selected = Math.max(boundedMin, Math.min(boundedMax, draft));
  useEffect(() => { if (open) setDraft(safeValue); }, [open, safeValue]);
  const hour = Math.floor(selected / 60);
  const minute = selected % 60;
  const hours = Array.from({ length: Math.floor(boundedMax / 60) - Math.floor(boundedMin / 60) + 1 }, (_, index) => Math.floor(boundedMin / 60) + index);
  const minutes = Array.from({ length: 60 }, (_, index) => index).filter((item) => hour * 60 + item >= boundedMin && hour * 60 + item <= boundedMax);
  const isBlocked = (minuteOfDay: number) => blockedIntervals.some((interval) => minuteOfDay >= interval.startMinute && minuteOfDay < interval.endMinute);
  const disabledHours = hours.filter((item) => {
    const allowedMinutes = Array.from({ length: 60 }, (_, index) => item * 60 + index).filter((minuteOfDay) => minuteOfDay >= boundedMin && minuteOfDay <= boundedMax);
    return allowedMinutes.length > 0 && allowedMinutes.every(isBlocked);
  });
  const disabledMinutes = minutes.filter((item) => isBlocked(hour * 60 + item));
  function chooseHour(nextHour: number) {
    const allowed = Array.from({ length: 60 }, (_, item) => nextHour * 60 + item)
      .filter((item) => item >= boundedMin && item <= boundedMax && !isBlocked(item));
    const next = allowed.sort((a, b) => Math.abs(a % 60 - minute) - Math.abs(b % 60 - minute))[0];
    if (next !== undefined) setDraft(next);
  }
  function chooseMinute(nextMinute: number) {
    setDraft(Math.max(boundedMin, Math.min(boundedMax, hour * 60 + nextMinute)));
  }
  return <div className="time-wheel-field">
    <span className="time-wheel-field-label">{label}</span>
    <button type="button" className="time-wheel-trigger" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><Clock3 />{formatTime(safeValue)}</button>
    {open && <div className="time-wheel-popover">
      <div className="time-wheel-columns"><Wheel label="Hour" values={hours} selected={hour} onSelect={chooseHour} disabledValues={disabledHours} /><span className="time-wheel-separator">:</span><Wheel label="Minute" values={minutes} selected={minute} onSelect={chooseMinute} disabledValues={disabledMinutes} /></div>
      <div className="time-wheel-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}><X />Cancel</button><button type="button" className="primary" onClick={() => { onChange(formatTime(selected)); setOpen(false); }}><Check />Set time</button></div>
    </div>}
  </div>;
}
