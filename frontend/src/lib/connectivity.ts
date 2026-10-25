export type ServerReachability = "unknown" | "reachable" | "disconnected";

type Listener = () => void;
const listeners = new Set<Listener>();
let reachability: ServerReachability = "unknown";
let writeOutcomeUncertain = false;

export function getServerReachability(): ServerReachability { return reachability; }

export function subscribeServerReachability(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWriteOutcomeUncertain(): boolean { return writeOutcomeUncertain; }

export function reportUncertainWrite(): void {
  if (writeOutcomeUncertain) return;
  writeOutcomeUncertain = true;
  listeners.forEach((listener) => listener());
}

export function reportServerReachability(next: Exclude<ServerReachability, "unknown">): void {
  if (reachability === next) return;
  reachability = next;
  listeners.forEach((listener) => listener());
}

export class ServerConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConnectionError";
  }
}

export function requireReachableServer(): void {
  if (writeOutcomeUncertain) {
    throw new ServerConnectionError("A previous save has an uncertain result. Reload Rostam to reconcile server data before editing or saving again.");
  }
  if (reachability !== "reachable") {
    throw new ServerConnectionError(reachability === "unknown"
      ? "Rostam connection has not yet been confirmed. Wait for the server check before saving."
      : "Rostam is disconnected. Reconnect and refresh before trying again; an interrupted save may have an uncertain result.");
  }
}
