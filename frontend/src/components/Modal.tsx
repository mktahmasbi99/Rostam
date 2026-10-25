import { X } from "lucide-react";
import { type ReactNode } from "react";
import { AccessibleDialog } from "./AccessibleDialog";

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  fullScreen?: boolean;
  closePositionLeft?: boolean;
  titleHidden?: boolean;
  headerAction?: ReactNode;
  groupHeaderActionWithClose?: boolean;
  dirtyLabel?: string;
}

export function Modal({ title, children, onClose, wide = false, fullScreen = false, closePositionLeft = false, titleHidden = false, headerAction, groupHeaderActionWithClose = false, dirtyLabel }: Props) {
  return (
    <AccessibleDialog
      backdropClassName={`modal-backdrop ${fullScreen ? "modal-fullscreen-backdrop" : ""}`}
      className=""
      panelClassName={`modal-sheet ${wide ? "modal-wide" : ""} ${fullScreen ? "modal-fullscreen" : ""}`}
      label={title}
      onClose={onClose}
    >
      <div data-update-dirty={dirtyLabel ? "modal-draft" : undefined} data-update-dirty-label={dirtyLabel}>
        <div className="modal-header">
          {closePositionLeft && <button className="icon-button modal-close-framed" onClick={onClose} aria-label={`Close ${title}`}><X /></button>}
          {!titleHidden && <h2>{title}</h2>}
          {!closePositionLeft && groupHeaderActionWithClose
            ? <div className="modal-header-actions">{headerAction}<button className="icon-button modal-close-framed" onClick={onClose} aria-label={`Close ${title}`}><X /></button></div>
            : <>{headerAction}{!closePositionLeft && <button className="icon-button modal-close-framed" onClick={onClose} aria-label={`Close ${title}`}><X /></button>}</>}
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </AccessibleDialog>
  );
}
