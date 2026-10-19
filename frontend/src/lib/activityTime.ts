export function minuteOfDay(value: string) {
  const [hour = "00", minute = "00"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function timeFromMinuteOfDay(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function activityTime(date: string, time: string) {
  return `${date}T${time}`;
}

export function activityTimeOnly(value: string) {
  return value.slice(11, 16);
}
