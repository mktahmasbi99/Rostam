import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  children: ReactNode;
  className: string;
  backdropClassName: string;
  labelledBy?: string;
  label?: string;
  onClose: () => void;
  testId?: string;
  panelClassName?: string;
}

const layers: HTMLElement[] = [];
let originalOverflow = "";
const DialogDepth = createContext(0);

function syncLayers() {
  const app = document.querySelector<HTMLElement>("[data-rostam-app]");
  if (app) app.toggleAttribute("inert", layers.length > 0);
  layers.forEach((layer, index) => { layer.toggleAttribute("inert", index !== layers.length - 1); });
  document.body.style.overflow = layers.length ? "hidden" : originalOverflow;
}

function focusableWithin(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.closest("[inert]") && element.getAttribute("aria-hidden") !== "true");
}

export function AccessibleDialog({ children, className, backdropClassName, labelledBy, label, onClose, testId, panelClassName = "" }: Props) {
  const parentDepth = useContext(DialogDepth);
  const depth = parentDepth + 1;
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.activeElement as HTMLElement);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const layer = layerRef.current;
    const panel = panelRef.current;
    if (!layer || !panel) return;
    const before = previouslyFocusedRef.current;
    if (!layers.length) originalOverflow = document.body.style.overflow;
    layers.push(layer);
    layers.sort((left, right) => Number(left.dataset.dialogDepth) - Number(right.dataset.dialogDepth));
    syncLayers();
    queueMicrotask(() => {
      if (layers.at(-1) === layer) (focusableWithin(panel).find((element) => (element as HTMLInputElement).autofocus) ?? focusableWithin(panel)[0] ?? panel).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (layers.at(-1) !== layer) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableWithin(panel);
      if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      syncLayers();
      if (before?.isConnected && !before.closest("[inert]")) before.focus();
    };
  }, []);

  return (
    <DialogDepth.Provider value={depth}>
      {createPortal(
        <div ref={layerRef} className="dialog-layer" data-dialog-depth={depth} style={{ zIndex: 100 + depth }}>
          <div className={`${backdropClassName} ${className}`} data-testid={testId} onMouseDown={(event) => { if (event.target === event.currentTarget && layers.at(-1) === layerRef.current) onCloseRef.current(); }}>
            <section ref={panelRef} className={panelClassName} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={label} tabIndex={-1}>
              {children}
            </section>
          </div>
        </div>,
        document.body,
      )}
    </DialogDepth.Provider>
  );
}
