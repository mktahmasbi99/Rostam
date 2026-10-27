export function durationValue(minutes: number | null | undefined, seconds: number | null | undefined): string {
  return minutes == null && seconds == null ? "" : `${minutes ?? 0}:${String(seconds ?? 0).padStart(2, "0")}`;
}

export function formatDurationDigits(digits: string): string {
  if (!digits) return "";
  const normalized = digits.replace(/^0+(?=\d)/, "").padStart(3, "0");
  return `${normalized.slice(0, -2)}:${normalized.slice(-2)}`;
}

export function parseDurationValue(value: string): { minutes: number; seconds: number } | null {
  const match = /^(\d+):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const total = minutes * 60 + seconds;
  return total > 0 && total <= 86400 ? { minutes, seconds } : null;
}
