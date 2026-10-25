export interface RestartSnapshot {
  dirty: string[];
  pendingWrites: number;
  preparing: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();
const dirty = new Map<string, string>();
const baselines = new WeakMap<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, string>();
const ownerIds = new WeakMap<HTMLElement, string>();
const owners = new Map<string, HTMLElement>();
let nextOwnerId = 1;
let pendingWrites = 0;
let preparing = false;
let snapshot: RestartSnapshot = { dirty: [], pendingWrites, preparing };

function publish(): void {
  snapshot = { dirty: [...dirty.values()], pendingWrites, preparing };
  for (const listener of listeners) listener();
}

export function getRestartSnapshot(): RestartSnapshot { return snapshot; }

export function subscribeRestartSafety(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function controlValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (element instanceof HTMLInputElement && element.type === "checkbox") return `checked:${element.checked}`;
  if (element instanceof HTMLInputElement && element.type === "radio") return `checked:${element.checked}`;
  if (element instanceof HTMLInputElement && element.type === "file") return [...(element.files ?? [])].map((file) => `${file.name}:${file.size}`).join("|");
  return element.value;
}

function ownerKey(owner: HTMLElement | null): string {
  if (!owner) return "current form";
  const key = owner.dataset.updateDirty || owner.id || ownerIds.get(owner) || `form-${nextOwnerId++}`;
  ownerIds.set(owner, key);
  owners.set(key, owner);
  return key;
}

function updateOwner(owner: HTMLElement | null, element?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  const key = ownerKey(owner);
  const controls = owner ? [...owner.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")] : element ? [element] : [];
  const changed = controls.some((control) => baselines.has(control) && baselines.get(control) !== controlValue(control));
  if (changed) dirty.set(key, owner?.dataset.updateDirtyLabel || element?.labels?.[0]?.innerText?.trim() || "Unsaved form changes");
  else dirty.delete(key);
  publish();
}

export function registerDirtyInput(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  if (!baselines.has(element)) {
    const initial = element instanceof HTMLInputElement
      ? element.type === "file" ? "" : element.type === "checkbox" || element.type === "radio" ? `checked:${element.defaultChecked}` : element.defaultValue
      : element instanceof HTMLTextAreaElement ? element.defaultValue
        : [...element.options].map((option) => option.defaultSelected ? option.value : "").join("|");
    baselines.set(element, initial);
  }
  const owner = element.closest<HTMLElement>("[data-update-dirty], form");
  updateOwner(owner, element);
}

export function clearDirtyOwner(key: string): void {
  dirty.delete(key);
  publish();
}

export async function trackWrite<T>(operation: () => Promise<T>, clearOwnerOnSuccess = true): Promise<T> {
  if (preparing) throw new Error("A restart is being prepared. Try again after the tabs finish updating.");
  const active = document.activeElement;
  const owner = active instanceof HTMLElement ? active.closest<HTMLElement>("[data-update-dirty], form") : null;
  pendingWrites += 1;
  publish();
  try {
    const result = await operation();
    if (clearOwnerOnSuccess && result instanceof Response && result.ok && owner) {
      for (const control of owner.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")) {
        baselines.set(control, controlValue(control));
      }
      clearDirtyOwner(ownerKey(owner));
    }
    return result;
  }
  finally { pendingWrites -= 1; publish(); }
}

export function setRestartPreparing(value: boolean): void {
  preparing = value;
  document.documentElement.classList.toggle("update-preparing", value);
  publish();
}

export function canRestart(snapshotValue = snapshot): boolean {
  return snapshotValue.pendingWrites === 0;
}

export function clearRestartDrafts(): void {
  dirty.clear();
  publish();
}

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    if (!baselines.has(target)) baselines.set(target, target.value);
  }
}, true);
document.addEventListener("pointerdown", (event) => {
  if (preparing && !(event.target instanceof Element && event.target.closest("[data-update-control]"))) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
document.addEventListener("click", (event) => {
  if (!preparing && event.target instanceof Element) {
    const button = event.target.closest("button");
    const owner = button?.closest<HTMLElement>("[data-update-dirty], form");
    if (owner) {
      const key = ownerKey(owner);
      dirty.set(key, owner.dataset.updateDirtyLabel || "Unsaved form changes");
      publish();
    }
  }
  if (preparing && !(event.target instanceof Element && event.target.closest("[data-update-control]"))) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
document.addEventListener("input", (event) => {
  const target = event.target;
  if (preparing) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) registerDirtyInput(target);
}, true);
document.addEventListener("change", (event) => {
  const target = event.target;
  if (preparing) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) registerDirtyInput(target);
}, true);
document.addEventListener("submit", (event) => {
  if (preparing) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
window.addEventListener("beforeunload", (event) => {
  if (snapshot.dirty.length || snapshot.pendingWrites) {
    event.preventDefault();
    event.returnValue = "";
  }
});

const cleanupDisconnectedDrafts = new MutationObserver(() => {
  let changed = false;
  for (const [key, owner] of owners) {
    if (!owner.isConnected) {
      owners.delete(key);
      if (dirty.delete(key)) changed = true;
    }
  }
  if (changed) publish();
});
cleanupDisconnectedDrafts.observe(document.documentElement, { childList: true, subtree: true });
