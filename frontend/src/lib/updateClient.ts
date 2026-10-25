import { canRestart, clearRestartDrafts, getRestartSnapshot, setRestartPreparing, subscribeRestartSafety } from "./restartSafety";

type WorkerMessage = { type: string; transactionId?: string; buildId?: string; clientId?: string; discardConfirmed?: boolean; reason?: string };
const buildId = document.querySelector<HTMLMetaElement>('meta[name="rostam-build"]')?.content ?? "unknown";
const clientId = crypto.randomUUID();
let waiting: ServiceWorker | null = null;
let transactionId: string | null = null;
let discardAfterCommit = false;
let discardConfirmedTransaction: string | null = null;
const listeners = new Set<() => void>();
let blockReason = "";
const updateChannel = typeof BroadcastChannel === "function" ? new BroadcastChannel("rostam-update") : null;

export function subscribeUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getUpdateState() {
  const snapshot = getRestartSnapshot();
  return {
    ready: waiting !== null,
    preparing: transactionId !== null,
    blocked: snapshot.pendingWrites > 0 || (transactionId !== null && !canRestart(snapshot)),
    blockReason: snapshot.pendingWrites > 0 ? "A save is still finishing." : blockReason,
  };
}
function notify(): void { for (const listener of listeners) listener(); }

function receive(event: MessageEvent<WorkerMessage>): void {
  const message = event.data;
  if (message.type === "ROSTAM_UPDATE_READY") {
    void navigator.serviceWorker.getRegistration().then((registration) => { waiting = registration?.waiting ?? null; notify(); });
  } else if (message.type === "ROSTAM_PREPARE_RESTART") {
    transactionId = message.transactionId ?? null;
    discardConfirmedTransaction = message.clientId === clientId && message.discardConfirmed ? transactionId : null;
    setRestartPreparing(true);
    const state = getRestartSnapshot();
    const requester = message.clientId === clientId;
    const ready = state.pendingWrites === 0 && (state.dirty.length === 0 || (requester && message.discardConfirmed === true));
    event.ports[0]?.postMessage({ type: "ROSTAM_PREPARE_ACK", transactionId, clientId, ready,
      reason: state.pendingWrites ? "A save is still finishing." : state.dirty.length ? "This tab has unsaved changes." : undefined });
    notify();
  } else if (message.type === "ROSTAM_CONFIRM_RESTART") {
    const state = getRestartSnapshot();
    const allowedDirty = message.clientId === clientId && message.discardConfirmed === true && message.transactionId === discardConfirmedTransaction;
    const ready = message.transactionId === transactionId && state.pendingWrites === 0 && (state.dirty.length === 0 || allowedDirty);
    event.ports[0]?.postMessage({ type: "ROSTAM_PREPARE_ACK", transactionId: message.transactionId, clientId, ready,
      reason: state.pendingWrites ? "A save is still finishing." : state.dirty.length && !allowedDirty ? "This tab has unsaved changes." : undefined });
  } else if (message.type === "ROSTAM_ABORT_RESTART") {
    if (message.transactionId === transactionId) { transactionId = null; discardConfirmedTransaction = null; blockReason = message.reason ?? "Another tab is not ready."; setRestartPreparing(false); notify(); }
  } else if (message.type === "ROSTAM_UPDATE_BLOCKED") {
    if (message.transactionId === transactionId) { transactionId = null; discardConfirmedTransaction = null; blockReason = message.reason ?? "Another tab is not ready."; setRestartPreparing(false); notify(); }
  } else if (message.type === "ROSTAM_COMMIT_RESTART" && message.transactionId && message.transactionId === transactionId) {
    if (discardAfterCommit) clearRestartDrafts();
    transactionId = null;
    setRestartPreparing(false);
    sessionStorage.setItem(`rostam-reloaded-${message.buildId ?? "update"}`, "1");
    window.location.reload();
  }
}

export function restartToUpdate(): void {
  if (!waiting || transactionId || !navigator.serviceWorker.controller) return;
  const state = getRestartSnapshot();
  if (state.pendingWrites) return;
  if (state.dirty.length && !window.confirm("Discard this tab’s unsaved changes and restart to update?")) return;
  discardAfterCommit = state.dirty.length > 0;
  transactionId = crypto.randomUUID();
  blockReason = "";
  setRestartPreparing(true);
  waiting.postMessage({ type: "ROSTAM_REQUEST_RESTART", transactionId, buildId, clientId,
    discardConfirmed: state.dirty.length > 0 });
  notify();
}

export function startUpdateClient(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", receive);
  updateChannel?.addEventListener("message", () => {
    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration?.waiting) { waiting = registration.waiting; notify(); }
    });
  });
  let lastCheck = 0;
  const check = async () => {
    if (document.visibilityState !== "visible" || Date.now() - lastCheck < 5 * 60_000) return;
    lastCheck = Date.now();
    let registration: ServiceWorkerRegistration | undefined;
    try {
      registration = await navigator.serviceWorker.ready;
      registration.addEventListener("updatefound", () => {
        const installing = registration?.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller && registration?.waiting) {
            waiting = registration.waiting;
            updateChannel?.postMessage({ type: "ready" });
            notify();
          }
        });
      });
      await registration.update();
    } catch { /* Current app remains available offline. */ }
    registration ??= await navigator.serviceWorker.getRegistration();
    if (registration?.waiting) { waiting = registration.waiting; updateChannel?.postMessage({ type: "ready" }); notify(); }
  };
  window.addEventListener("load", () => { void check(); });
  window.addEventListener("focus", () => { void check(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void check(); });
  window.setInterval(() => { if (Date.now() - lastCheck >= 60 * 60_000) void check(); }, 60 * 60_000);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!transactionId) return;
    if (discardAfterCommit) clearRestartDrafts();
    sessionStorage.setItem(`rostam-reloaded-${buildId}`, "1");
    transactionId = null;
    setRestartPreparing(false);
    window.location.reload();
  });
  subscribeRestartSafety(notify);
  void buildId;
}
