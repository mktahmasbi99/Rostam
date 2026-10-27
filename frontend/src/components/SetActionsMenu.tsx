import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Action { label: string; onClick: () => void; danger?: boolean }
export function SetActionsMenu({ label, actions, disabled = false }: { label: string; actions: Action[]; disabled?: boolean }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  function close() { setPosition(null); }
  function open() {
    const box = trigger.current?.getBoundingClientRect();
    if (box) setPosition({ top: Math.max(8, box.top - actions.length * 44 - 10), left: Math.max(8, Math.min(window.innerWidth - 164, box.right - 156)) });
  }
  useEffect(() => {
    if (!position) return;
    popup.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: Event) => {
      if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setPosition(null);
    };
    const dismiss = (event: Event) => {
      // Long values scroll inside compact inputs; that does not move the menu anchor.
      if (event.type === "scroll" && event.target instanceof Element && event.target.matches("input, textarea")) return;
      setPosition(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [position]);
  return <div className="set-actions-menu" onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); trigger.current?.focus(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!position) { open(); return; }
      const items = [...(popup.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button type="button" ref={trigger} disabled={disabled} className="set-actions-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(position)} onClick={() => position ? close() : open()}><Ellipsis /></button>
    {position && createPortal(<div className="set-actions-popover" ref={popup} role="menu" aria-label={label} style={position}>
      {actions.map((action) => <button type="button" role="menuitem" key={action.label} className={action.danger ? "danger" : ""} onClick={() => { close(); trigger.current?.focus(); action.onClick(); }}>{action.label}</button>)}
    </div>, document.body)}
  </div>;
}
