import { useEffect, useState, useSyncExternalStore } from "react";
import { getServerReachability, subscribeServerReachability } from "../lib/connectivity";
import { getOfflineCopy, getOfflineRecord, subscribeOfflineCopy } from "../lib/offlineLedger";

export function useLedgerImage(path: string | undefined) {
  const reachability = useSyncExternalStore(subscribeServerReachability, getServerReachability, getServerReachability);
  const copy = useSyncExternalStore(subscribeOfflineCopy, getOfflineCopy, getOfflineCopy);
  const offline = Boolean(copy && reachability === "disconnected" && path?.startsWith("/api/"));
  const [local, setLocal] = useState<{ path: string; url: string | null }>();
  useEffect(() => {
    if (!offline || !path) return;
    let active = true;
    let url: string | null = null;
    void getOfflineRecord<Uint8Array<ArrayBuffer>>(decodeURIComponent(path)).catch(() => undefined).then((bytes) => {
      if (!active) return;
      url = bytes ? URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" })) : null;
      setLocal({ path, url });
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      setLocal((previous) => previous?.path === path ? undefined : previous);
    };
  }, [offline, path, copy?.id]);
  return offline ? (local?.path === path ? local?.url : undefined) : path;
}
