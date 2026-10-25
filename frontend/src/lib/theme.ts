export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "rostam-theme-preference";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readThemePreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // Keep the system default if browser storage is unavailable.
  }
  return "system";
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // The current selection still applies for this session without storage.
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  const dark = preference === "dark"
    || (preference === "system" && window.matchMedia(DARK_QUERY).matches);
  const theme = dark ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#071a2d" : "#eee4d2");
}

export function systemThemeQuery(): MediaQueryList {
  return window.matchMedia(DARK_QUERY);
}
