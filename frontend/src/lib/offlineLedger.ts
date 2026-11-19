import { trackWrite } from "./restartSafety";
import type { Config } from "./types";

interface OfflineCopy {
  id: string;
  buildId: string;
  downloadedAt: string;
  ledgerGeneration: string;
  bytes: number;
  assetCount: number;
}

interface OfflineAsset { url: string; bytes: number; sha256: string; }
interface AssetList { buildId: string; files: OfflineAsset[]; }

const activeKey = "active";
const listeners = new Set<() => void>();
const channel = typeof window !== "undefined" && typeof window.BroadcastChannel === "function"
  ? new window.BroadcastChannel("rostam-offline-ledger") : undefined;
const buildId = typeof document === "undefined" ? undefined : document.querySelector<HTMLMetaElement>('meta[name="rostam-build"]')?.content;
let connection: Promise<IDBDatabase> | undefined;
let copy: (OfflineCopy & { ready: boolean }) | undefined;
let liveGeneration: string | undefined;
let reading = 0;

export const supportsOfflineLedger = Boolean(buildId && typeof indexedDB !== "undefined" &&
  typeof caches !== "undefined" && typeof navigator !== "undefined" && navigator.serviceWorker);

function assetCache(id: string) { return `rostam-offline-assets-${id}`; }

function openDatabase(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("rostam-offline-ledger", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      db.onclose = () => { connection = undefined; };
      resolve(db);
    };
  }).catch((error) => { connection = undefined; throw error; });
  return connection;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finish(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline storage was interrupted."));
  });
}

function store(db: IDBDatabase) { return db.transaction("records").objectStore("records"); }
function keys(id: string) { return IDBKeyRange.bound([id], [id, []]); }

export function getOfflineCopy() { return copy; }
export function subscribeOfflineCopy(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function readOfflineCopy() {
  if (!supportsOfflineLedger) return;
  const revision = ++reading;
  const metadata: OfflineCopy | undefined = await result(store(await openDatabase()).get(activeKey));
  const ready = Boolean(metadata && metadata.buildId === buildId &&
    await caches.has(assetCache(metadata.buildId)) &&
    (await (await caches.open(assetCache(metadata.buildId))).keys()).length === metadata.assetCount);
  if (revision !== reading) return;
  copy = metadata && metadata.ledgerGeneration === (liveGeneration ?? metadata.ledgerGeneration)
    ? { ...metadata, ready } : undefined;
  listeners.forEach((listener) => listener());
}

channel?.addEventListener("message", () => { void readOfflineCopy().catch(() => {}); });

async function publishCopy() {
  channel?.postMessage(null);
  await readOfflineCopy();
}

export async function getOfflineRecord<T>(path: string): Promise<T | undefined> {
  if (!supportsOfflineLedger) return undefined;
  const records = store(await openDatabase());
  return new Promise((resolve, reject) => {
    const metadata = records.get(activeKey);
    metadata.onerror = () => reject(metadata.error);
    metadata.onsuccess = () => {
      const saved: OfflineCopy | undefined = metadata.result;
      if (!saved || (liveGeneration && saved.ledgerGeneration !== liveGeneration)) {
        resolve(undefined);
        return;
      }
      const request = records.get([saved.id, path]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
  });
}

async function replaceCopy(next: OfflineCopy | undefined, shouldReplace: (previous: OfflineCopy | undefined) => boolean) {
  const db = await openDatabase();
  const transaction = db.transaction("records", "readwrite", { durability: "strict" });
  const saved = finish(transaction);
  const records = transaction.objectStore("records");
  const active = records.get(activeKey);
  let changed = false;
  active.onsuccess = () => {
    const previous: OfflineCopy | undefined = active.result;
    if (!shouldReplace(previous)) return;
    changed = true;
    if (previous) records.delete(keys(previous.id));
    if (next) records.put(next, activeKey);
    else records.delete(activeKey);
  };
  await saved;
  if (changed) await publishCopy().catch(() => {});
  return changed;
}

export async function validateOfflineGeneration(generation: string) {
  liveGeneration = generation;
  if (!supportsOfflineLedger) return;
  await replaceCopy(undefined, (previous) => Boolean(previous && previous.ledgerGeneration !== generation));
}

async function listOfflineAssets(signal: AbortSignal): Promise<AssetList> {
  const response = await fetch("/offline-assets.json", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not download Rostam’s asset list.");
  const manifest: AssetList = await response.json();
  const urls = new Set<string>();
  if (manifest.buildId !== buildId || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error("Rostam updated. Reload the app and try again.");
  }
  for (const file of manifest.files) {
    if (!/^\/(assets|exercise-assets)\/(?:[\w.-]+\/)*[\w.-]+$/.test(file.url) ||
      new URL(file.url, location.origin).pathname !== file.url ||
      !Number.isSafeInteger(file.bytes) || file.bytes < 1 ||
      !/^[a-f0-9]{64}$/.test(file.sha256) || urls.has(file.url)) {
      throw new Error("Rostam’s offline asset list is invalid.");
    }
    urls.add(file.url);
  }
  return manifest;
}

async function cacheAssets(manifest: AssetList, signal: AbortSignal, progress: (message: string) => void) {
  const cache = await caches.open(assetCache(manifest.buildId));
  let completed = 0;
  for (const file of manifest.files) {
    signal.throwIfAborted();
    if (!(await cache.match(file.url))) {
      const response = await fetch(`${file.url}?offline-download`, { cache: "no-store", signal });
      if (!response.ok) throw new Error(`Could not download ${file.url}.`);
      const bytes = await response.clone().arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const checksum = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (bytes.byteLength !== file.bytes || checksum !== file.sha256) {
        throw new Error("Rostam’s offline assets changed. Reload the app and try again.");
      }
      await cache.put(file.url, response);
    }
    progress(`Downloading app files (${++completed}/${manifest.files.length})…`);
  }
}

function mediaRecord(path: string, value: unknown) {
  if (!/^\/api\/(photos\/\d+(?:\/thumbnail)?|exercise-images\/custom:[\w-]+)$/.test(path)) return value;
  if (typeof value !== "string") throw new Error("Invalid offline image.");
  return Uint8Array.from(atob(value), (byte) => byte.charCodeAt(0));
}

async function stageLedger(response: Response, id: string, signal: AbortSignal, progress: (message: string) => void) {
  if (!response.ok || !response.body || !response.headers.get("Content-Type")?.includes("application/x-ndjson")) {
    throw new Error("Could not download the ledger.");
  }
  const db = await openDatabase();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const paths = new Set<string>();
  let buffer = "";
  let bytes = 0;
  let downloadedAt = "";
  let generation = "";
  let complete = false;
  const expected = Number(response.headers.get("X-Rostam-Snapshot-Bytes"));
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      if (!lines.length) continue;
      const rows: [string, unknown][] = [];
      for (const line of lines) {
        const [path, value] = JSON.parse(line);
        if (typeof path !== "string" || paths.has(path) || complete) throw new Error("Invalid offline ledger.");
        if (!paths.size && path !== "meta") throw new Error("Missing offline ledger version.");
        paths.add(path);
        if (path === "meta") {
          if (value?.schema !== 1 || !Number.isFinite(Date.parse(value.downloadedAt))) {
            throw new Error("This offline ledger version is unsupported.");
          }
          downloadedAt = value.downloadedAt;
        } else if (path === "complete") {
          complete = value === true;
        } else {
          if (!path.startsWith("/api/")) throw new Error("Invalid offline ledger record.");
          if (path === "/api/config") {
            if (!value?.ledgerGeneration || !value?.timezone || !value?.today) {
              throw new Error("The ledger is missing its configuration.");
            }
            generation = value.ledgerGeneration;
          }
          rows.push([path, mediaRecord(path, value)]);
        }
      }
      if (rows.length) {
        const transaction = db.transaction("records", "readwrite");
        const saved = finish(transaction);
        const records = transaction.objectStore("records");
        for (const [path, value] of rows) records.add(value, [id, path]);
        await saved;
      }
      progress(expected > 0 ? `Downloading ledger (${Math.min(100, Math.floor(bytes / expected * 100))}%)…` : "Downloading ledger…");
    }
    if (buffer || decoder.decode() || !downloadedAt || !generation || !complete || (expected > 0 && expected !== bytes)) {
      throw new Error("The offline ledger download was incomplete.");
    }
    return { id, downloadedAt, ledgerGeneration: generation, bytes };
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function download(signal: AbortSignal, progress: (message: string) => void) {
  if (!supportsOfflineLedger || !navigator.serviceWorker.controller) {
    throw new Error("Open Rostam as an installed web app and reload once to finish setup.");
  }
  const manifest = await listOfflineAssets(signal);
  const assetBytes = manifest.files.reduce((total, file) => total + file.bytes, 0);
  const startingCopy: OfflineCopy | undefined = await result(store(await openDatabase()).get(activeKey));
  void navigator.storage?.persist?.().catch(() => false);
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const controller = new AbortController();
  const downloadSignal = AbortSignal.any([signal, controller.signal]);
  const response = await fetch("/api/offline/snapshot", { cache: "no-store", signal: downloadSignal });
  progress("Downloading ledger…");
  const ledgerBytes = Number(response.headers.get("X-Rostam-Snapshot-Bytes")) || 0;
  const required = ledgerBytes + (startingCopy?.buildId === manifest.buildId ? 0 : assetBytes);
  const id = crypto.randomUUID();
  let activated = false;
  try {
    if (estimate?.quota !== undefined && estimate.usage !== undefined && estimate.quota - estimate.usage < required) {
      throw new Error("There is not enough storage for the offline copy.");
    }
    const metadata = await stageLedger(response, id, downloadSignal, progress);
    await cacheAssets(manifest, downloadSignal, progress);
    const configResponse = await fetch("/api/config", { cache: "no-store", signal: downloadSignal });
    const current: Config = await configResponse.json();
    if (!configResponse.ok || current.ledgerGeneration !== metadata.ledgerGeneration) {
      throw new Error("The server ledger changed. Download a new offline copy.");
    }
    downloadSignal.throwIfAborted();
    activated = await replaceCopy({
      ...metadata,
      bytes: metadata.bytes + assetBytes,
      buildId: manifest.buildId,
      assetCount: manifest.files.length,
    }, (previous) => previous?.id === startingCopy?.id);
    if (!activated) throw new Error("The offline copy was changed in another window. Try again.");
    if (startingCopy && startingCopy.buildId !== manifest.buildId) {
      await caches.delete(assetCache(startingCopy.buildId)).catch(() => {});
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("There is not enough storage for the offline copy.", { cause: error });
    }
    throw error;
  } finally {
    controller.abort();
    if (!activated) {
      if (startingCopy?.buildId !== manifest.buildId) {
        await caches.delete(assetCache(manifest.buildId)).catch(() => {});
      }
      const db = await openDatabase();
      const transaction = db.transaction("records", "readwrite");
      const deleted = finish(transaction);
      transaction.objectStore("records").delete(keys(id));
      await deleted.catch(() => {});
    }
  }
}

function withCopyLock<T>(action: () => Promise<T>) {
  return navigator.locks ? navigator.locks.request("rostam-offline-copy", { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error("The offline copy is already being changed in another window.");
    return action();
  }) : action();
}

export function downloadOfflineCopy(signal: AbortSignal, progress: (message: string) => void) {
  return trackWrite(() => withCopyLock(() => download(signal, progress)), false);
}

export function removeOfflineCopy() {
  return withCopyLock(async () => {
    const current = copy;
    if (await replaceCopy(undefined, (previous) => Boolean(current && previous?.id === current.id)) && current) {
      await caches.delete(assetCache(current.buildId));
    }
  });
}
