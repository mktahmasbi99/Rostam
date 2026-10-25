import { exercises } from "@bryllim/workout-guide";
import { describe, expect, it } from "vitest";
import catalog from "./exercise-catalog.json";

describe("generated illustration catalog", () => {
  it("preserves every upstream illustration choice using only its name and slug", () => {
    expect(catalog.map((item) => item.slug)).toEqual(exercises.map((item) => item.slug));
    expect(catalog.map((item) => item.name)).toEqual(exercises.map((item) => item.name));
    expect(catalog.every((item) => Object.keys(item).sort().join(",") === "name,slug")).toBe(true);
  });
});
