import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "./Modal";

export type ActivityDefinitionAction = "archive" | "restore" | "delete";

interface Props {
  activityName: string;
  action: ActivityDefinitionAction;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ActivityDefinitionActionDialog({ activityName, action, onClose, onConfirm }: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isDelete = action === "delete";
  const isArchive = action === "archive";
  const actionLabel = isDelete ? "Delete permanently" : isArchive ? "Archive" : "Restore";
  const cancelLabel = isDelete ? "Cancel" : isArchive ? "No, keep active" : "No, keep archived";
  const confirmLabel = isDelete ? actionLabel : `Yes, ${actionLabel.toLowerCase()}`;
  const Icon = isDelete ? Trash2 : isArchive ? Archive : RotateCcw;

  async function confirm() {
    if (isDelete && confirmation !== "DELETE") return;
    setSaving(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${action} activity.`);
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={`${actionLabel} ${activityName}?`} onClose={() => { if (!saving) onClose(); }}>
    <div className="stack">
      {isDelete ? <><p>This permanently deletes <strong>{activityName}</strong> and all of its session history. This cannot be undone.</p><p>Type <strong>DELETE</strong> to confirm.</p><label>Confirmation<input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={saving} /></label></> : <p>{isArchive ? <>Archive <strong>{activityName}</strong>? Its session history will remain available, and you can restore it later.</> : <>Restore <strong>{activityName}</strong>? It will be available again when starting a timed activity.</>}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions"><button className="secondary" disabled={saving} onClick={onClose}>{cancelLabel}</button><button className={isDelete ? "danger-button" : "primary"} disabled={saving || (isDelete && confirmation !== "DELETE")} onClick={() => void confirm()}><Icon />{saving ? `${actionLabel}…` : confirmLabel}</button></div>
    </div>
  </Modal>;
}
