import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  fullScreen?: boolean;
  closePositionLeft?: boolean;
  titleHidden?: boolean;
  headerAction?: ReactNode;
}

export function Modal({ title, children, onClose, wide = false, fullScreen = false, closePositionLeft = false, titleHidden = false, headerAction }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, []);

  return (
    <div className={`modal-backdrop ${fullScreen ? "modal-fullscreen-backdrop" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal-sheet ${wide ? "modal-wide" : ""} ${fullScreen ? "modal-fullscreen" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-header">
          {closePositionLeft && <button className="icon-button modal-close-framed" onClick={onClose} aria-label={`Close ${title}`}><X /></button>}
          {!titleHidden && <h2>{title}</h2>}
          {headerAction}
          {!closePositionLeft && <button className="icon-button modal-close-framed" onClick={onClose} aria-label={`Close ${title}`}><X /></button>}
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
