import { useRef, useState } from "react";

export function useSetDeletion(onDelete?: () => Promise<void> | void, disabled = false) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  async function remove() {
    if (!onDelete || disabled || busy.current) return;
    busy.current = true;
    setDeleting(true);
    setError("");
    try { await onDelete(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete this set."); }
    finally { busy.current = false; setDeleting(false); }
  }
  return { deleting, error, remove: () => void remove() };
}
