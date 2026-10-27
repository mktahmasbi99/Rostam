import { useRef, useState } from "react";
import type { ReactNode } from "react";

interface Props {
  onDelete?: () => void;
  error?: string;
  disabled?: boolean;
  children: ReactNode;
}

export function SwipeSetRow({ onDelete, disabled = false, error, children }: Props) {
  const [swiping, setSwiping] = useState(false);
  const [offset, setOffset] = useState(0);
  const distance = useRef(0);
  const gesture = useRef<{ id: number; x: number; y: number; initial: number; locked: boolean } | null>(null);
  function move(value: number) { distance.current = value; setOffset(value); }
  function remove() {
    if (!onDelete || disabled) return;
    move(0);
    onDelete();
  }
  return <div className="set-swipe" aria-busy={disabled || undefined}>
    {onDelete && <button type="button" className="set-swipe-delete" style={{ width: Math.max(72, -offset), visibility: offset < 0 ? "visible" : "hidden" }} tabIndex={offset < 0 ? 0 : -1} aria-hidden={offset === 0} disabled={disabled || offset === 0} onClick={() => void remove()}>Delete</button>}
    <div className={`set-swipe-content${swiping ? " swiping" : ""}`} style={{ transform: `translateX(${offset}px)` }} onFocusCapture={() => { if (distance.current) move(0); }} onPointerDown={(event) => {
      if (!onDelete || disabled || event.button !== 0 || !event.isPrimary) return;
      if ((event.target as Element).closest("input, button, a, textarea, select, label, .set-actions-menu, [role=menu], [role=checkbox]")) { move(0); return; }
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, initial: distance.current, locked: false };
    }} onPointerMove={(event) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.locked) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) { gesture.current = null; return; }
        current.locked = true;
        setSwiping(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      move(Math.max(-event.currentTarget.clientWidth, Math.min(0, current.initial + dx)));
    }} onPointerUp={(event) => {
      const current = gesture.current;
      gesture.current = null;
      setSwiping(false);
      if (!current || current.id !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (!current.locked) return;
      if (-distance.current >= Math.max(144, event.currentTarget.clientWidth * .6)) void remove();
      else move(distance.current <= -36 ? -72 : 0);
    }} onPointerCancel={() => { gesture.current = null; setSwiping(false); move(0); }} onLostPointerCapture={(event) => {
      // Touch starts with implicit capture on a child; transferring it here is not cancellation.
      if (event.target !== event.currentTarget) return;
      if (gesture.current) { gesture.current = null; setSwiping(false); move(0); }
    }}>
      {children}
    </div>
    {error && <p className="set-delete-error" role="alert">{error}</p>}
  </div>;
}
