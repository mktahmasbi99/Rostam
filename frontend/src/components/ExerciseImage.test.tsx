import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExerciseImage } from "./ExerciseImage";

describe("ExerciseImage theme treatment", () => {
  it("marks bundled monochrome artwork separately from custom photos", () => {
    const { rerender } = render(<ExerciseImage imageKey="push-up" name="Push up" />);
    expect(document.querySelector("img")).toHaveClass("bundled-exercise-art");
    rerender(<ExerciseImage imageKey="custom:abc" name="Push up" />);
    expect(document.querySelector("img")).toHaveClass("custom-exercise-art");
  });
});
