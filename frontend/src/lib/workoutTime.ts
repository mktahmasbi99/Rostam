/** HTML local fields use the server timezone, regardless of the browser's timezone. */
export function workoutLocalTime(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function workoutRange(start: string, end: string | null, timezone: string): string {
  const format = new Intl.DateTimeFormat(undefined, { timeZone: timezone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${format.format(new Date(start))} – ${end ? format.format(new Date(end)) : "In progress"}`;
}
