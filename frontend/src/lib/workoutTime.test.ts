import { describe, expect, it } from "vitest";
import { workoutElapsed, workoutTimeRange } from "./workoutTime";

describe("workout time display", () => {
  it("shows only clock times in the session header", () => {
    expect(workoutTimeRange("2026-10-30T08:00:00Z", null, "Europe/Warsaw")).toMatch(/^09:00 AM – In progress$/);
    expect(workoutTimeRange("2026-10-30T08:00:00Z", "2026-10-30T09:10:00Z", "Europe/Warsaw"))
      .toMatch(/^09:00 AM – 10:10 AM$/);
  });

  it("calculates live and stopped elapsed time", () => {
    expect(workoutElapsed("2026-10-30T08:00:00Z", null, Date.parse("2026-10-30T09:01:05Z")))
      .toBe("01:01:05");
    expect(workoutElapsed("2026-10-30T08:00:00Z", "2026-10-30T09:01:05Z", Date.parse("2026-10-30T10:00:00Z")))
      .toBe("01:01:05");
  });
});
