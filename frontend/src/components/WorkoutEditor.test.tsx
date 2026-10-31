import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Workout } from "../lib/types";
import { WorkoutDetailsForm, WorkoutEditor } from "./WorkoutEditor";

vi.mock("../lib/api", () => ({ api: {
  workout: vi.fn(), updateWorkout: vi.fn(), finishWorkout: vi.fn(), deleteWorkout: vi.fn(), orderWorkoutExercises: vi.fn(),
} }));
const workout: Workout = { id: 1, name: "Gym", startedAt: "2026-10-30T08:00:23Z", endedAt: null, exerciseCount: 0, setCount: 0, exercises: [] };

beforeEach(() => vi.clearAllMocks());

describe("WorkoutEditor", () => {
  it("retries failed loads and prevents finishing empty workouts", async () => {
    const user = userEvent.setup();
    vi.mocked(api.workout).mockRejectedValueOnce(new Error("Server unavailable")).mockResolvedValue(workout);
    render(<WorkoutEditor id={1} today="2026-10-30" timezone="Europe/Warsaw" onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Finish workout" })).toBeDisabled();
    expect(screen.getByText("Your workout starts here")).toBeInTheDocument();
  });

  it("requires confirmation before deleting a populated workout", async () => {
    const user = userEvent.setup();
    vi.mocked(api.workout).mockResolvedValue({ ...workout, setCount: 3 });
    const onClose = vi.fn();
    render(<WorkoutEditor id={1} today="2026-10-30" timezone="Europe/Warsaw" onClose={onClose} onChanged={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Delete workout" }));
    expect(api.deleteWorkout).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.deleteWorkout).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete workout" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.deleteWorkout).toHaveBeenCalledWith(1, true));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps precise timestamps when only renaming a completed workout", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WorkoutDetailsForm workout={{ ...workout, endedAt: "2026-10-30T09:00:44Z" }} day="2026-10-30" today="2026-10-31" timezone="Europe/Warsaw" onSave={onSave} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Workout start time")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Workout end time")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Workout name"));
    await user.type(screen.getByLabelText("Workout name"), "Leg day");
    await user.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: "Leg day" }));
  });

  it("preserves backfill values after a rejected save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Workout times cannot be in the future."));
    render(<WorkoutDetailsForm day="2026-10-30" today="2026-10-31" timezone="Europe/Warsaw" onSave={onSave} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Workout name"), "Evening gym");
    await user.click(screen.getByRole("button", { name: "Save workout" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot be in the future");
    expect(screen.getByLabelText("Workout name")).toHaveValue("Evening gym");
    expect(onSave).toHaveBeenCalledWith({ name: "Evening gym", startedAt: "2026-10-30T09:00" });
    expect(screen.getByLabelText("Workout name")).toHaveValue("Evening gym");
  });

  it("edits only the start time while a workout is active", async () => {
    const user = userEvent.setup();
    vi.mocked(api.workout).mockResolvedValue(workout);
    vi.mocked(api.updateWorkout).mockResolvedValue({ ...workout, startedAt: "2026-10-30T08:30:00Z" });
    render(<WorkoutEditor id={1} today="2026-10-30" timezone="Europe/Warsaw" onClose={vi.fn()} onChanged={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Edit workout time" }));
    expect(screen.getByLabelText("Workout start time")).toHaveValue("09:00");
    expect(screen.queryByLabelText("Workout end time")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Workout start time"));
    await user.type(screen.getByLabelText("Workout start time"), "1030");
    await user.click(screen.getByRole("button", { name: "Save time" }));
    await waitFor(() => expect(api.updateWorkout).toHaveBeenCalledWith(1, { startedAt: "2026-10-30T10:30" }));
  });

  it("edits both times after a workout is finished while keeping its dates", async () => {
    const user = userEvent.setup();
    const finished = { ...workout, startedAt: "2026-10-30T08:00:23Z", endedAt: "2026-10-30T09:00:44Z" };
    vi.mocked(api.workout).mockResolvedValue(finished);
    vi.mocked(api.updateWorkout).mockResolvedValue(finished);
    render(<WorkoutEditor id={1} today="2026-10-30" timezone="Europe/Warsaw" onClose={vi.fn()} onChanged={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Edit workout time" }));
    expect(screen.getByLabelText("Workout start time")).toHaveValue("09:00");
    expect(screen.getByLabelText("Workout end time")).toHaveValue("10:00");
    await user.click(screen.getByRole("button", { name: "Save time" }));
    await waitFor(() => expect(api.updateWorkout).toHaveBeenCalledWith(1, { startedAt: "2026-10-30T09:00", endedAt: "2026-10-30T10:00" }));
  });
});
