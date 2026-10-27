import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";
import { SetForm } from "./SetForm";

vi.mock("../lib/api", () => ({
  api: {
    rotations: vi.fn(),
    config: vi.fn(),
    prefill: vi.fn(),
    addSet: vi.fn(),
    updateSet: vi.fn(),
  },
}));

const exercise: Exercise = {
  id: 2,
  name: "Overhead Press (Resistance Bands)",
  baseName: "Overhead Press",
  measurementType: "repetitions",
  equipment: "resistance_band",
  customEquipment: null,
  allowBodyweight: true,
  imageKey: null,
  exerciseNote: null,
  archivedAt: null,
  hasHistory: true,
};

describe("SetForm", () => {
  it("keeps rotation choices out of set entry", async () => {
    const user = userEvent.setup();
    vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
    vi.mocked(api.prefill).mockResolvedValue({ source: "defaults", time: null, repetitions: null, durationMinutes: null, durationSeconds: null, holdMinutes: null, holdSeconds: null, resistanceKind: "bodyweight", weightKg: null });
    vi.mocked(api.addSet).mockResolvedValue({});
    render(<SetForm exercise={exercise} day="2026-09-16" onSaved={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByLabelText("Reps");
    await user.type(screen.getByLabelText("Reps"), "8");
    await user.click(screen.getByRole("checkbox", { name: "Save set" }));
    await waitFor(() => expect(api.addSet).toHaveBeenCalled());
    expect(vi.mocked(api.addSet).mock.calls[0][2]).toHaveProperty("enrollInRotation", false);
  });

  it("uses fixed equipment without presenting an equipment picker", async () => {
    const user = userEvent.setup();
    vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
    vi.mocked(api.prefill).mockResolvedValue({
      source: "previous",
      time: null,
      repetitions: 12,
      durationMinutes: null,
      durationSeconds: null,
      holdMinutes: null,
      holdSeconds: null,
      resistanceKind: "external",
      weightKg: "40",
    });
    vi.mocked(api.addSet).mockResolvedValue({});
    render(<SetForm exercise={exercise} day="2026-09-16" onSaved={vi.fn()} onCancel={vi.fn()} />);

    await screen.findByDisplayValue("12");
    expect(screen.queryByLabelText("Equipment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "BW" })).not.toBeInTheDocument();
    expect(screen.getByText("0 = BW")).toBeInTheDocument();
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Save set" }));

    await waitFor(() => expect(api.addSet).toHaveBeenCalled());
    expect(vi.mocked(api.addSet).mock.calls[0][2]).not.toHaveProperty("equipment");
  });

  it("does not show bodyweight or accept zero for an equipment-only exercise", async () => {
    const user = userEvent.setup();
    render(<SetForm
      exercise={{ ...exercise, allowBodyweight: false }}
      day="2026-09-16"
      existing={{
        id: 3,
        exerciseId: exercise.id,
        date: "2026-09-16",
        occurredAt: "2026-09-16T10:00:00+00:00",
        time: "12:00",
        repetitions: 10,
        durationMinutes: null,
        durationSeconds: null,
        holdMinutes: null,
        holdSeconds: null,
        resistanceKind: "external",
        weightKg: "40",
        equipment: "resistance_band",
        customEquipment: null,
        createdAt: "2026-09-16T10:00:00+00:00",
      }}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />);

    expect(screen.queryByRole("button", { name: "BW" })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("kg"));
    await user.type(screen.getByLabelText("kg"), "0");
    const calls = vi.mocked(api.updateSet).mock.calls.length;
    await user.click(screen.getByRole("checkbox", { name: "Save set" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Weight must be greater than zero");
    expect(api.updateSet).toHaveBeenCalledTimes(calls);
  });

  it("shows previous numeric values as suggestions and replaces them on typing", async () => {
    const user = userEvent.setup();
    vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
    vi.mocked(api.prefill).mockResolvedValue({
      source: "previous",
      time: null,
      repetitions: 12,
      durationMinutes: null,
      durationSeconds: null,
      holdMinutes: null,
      holdSeconds: null,
      resistanceKind: "external",
      weightKg: "40",
    });
    render(<SetForm exercise={exercise} day="2026-09-16" onSaved={vi.fn()} onCancel={vi.fn()} />);

    const reps = await screen.findByLabelText("Reps");
    expect(reps).toHaveClass("suggested-value");
    await user.click(reps);
    await user.keyboard("15");
    expect(reps).toHaveValue(15);
    expect(reps).not.toHaveClass("suggested-value");

    const weight = screen.getByLabelText("kg");
    expect(weight).toHaveClass("suggested-value");
  });

  it.each([false, true])("saves timed repetitions with prefilled or manually entered values (edited: %s)", async (edited) => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
    vi.mocked(api.prefill).mockResolvedValue({
      source: "previous",
      time: null,
      repetitions: 4,
      durationMinutes: null,
      durationSeconds: null,
      holdMinutes: 0,
      holdSeconds: 10,
      resistanceKind: "bodyweight",
      weightKg: null,
    });
    vi.mocked(api.addSet).mockResolvedValue({});
    render(<SetForm
      exercise={{ ...exercise, name: "Side Plank Leg Lift", measurementType: "timed_repetitions", equipment: null }}
      day="2026-09-16"
      onSaved={onSaved}
      onCancel={vi.fn()}
    />);

    await screen.findByDisplayValue("4");
    expect(screen.getByLabelText("Reps")).toHaveClass("suggested-value");
    if (edited) {
      await user.clear(screen.getByLabelText("Reps"));
      await user.type(screen.getByLabelText("Reps"), "8");
      await user.clear(screen.getByLabelText("Hold per repetition"));
      await user.type(screen.getByLabelText("Hold per repetition"), "15");
      expect(screen.getByLabelText("Reps")).not.toHaveClass("suggested-value");
      expect(screen.getByLabelText("Hold per repetition")).not.toHaveClass("suggested-value");
    }
    await user.click(screen.getByRole("checkbox", { name: "Save set" }));

    await waitFor(() => expect(api.addSet).toHaveBeenLastCalledWith("2026-09-16", exercise.id, {
      enrollInRotation: false,
      time: null,
      repetitions: edited ? 8 : 4,
      durationMinutes: null,
      durationSeconds: null,
      holdMinutes: 0,
      holdSeconds: edited ? 15 : 10,
      resistanceKind: "bodyweight",
      weightKg: null,
    }));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("edits timed repetitions with a per-repetition hold", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(api.updateSet).mockResolvedValue({});
    render(<SetForm
      exercise={{ ...exercise, measurementType: "timed_repetitions", equipment: null }}
      day="2026-09-16"
      existing={{
        id: 4,
        exerciseId: exercise.id,
        date: "2026-09-16",
        occurredAt: "2026-09-16T10:00:00+00:00",
        time: "12:00",
        repetitions: 4,
        durationMinutes: null,
        durationSeconds: null,
        holdMinutes: 0,
        holdSeconds: 10,
        resistanceKind: "bodyweight",
        weightKg: null,
        equipment: null,
        customEquipment: null,
        createdAt: "2026-09-16T10:00:00+00:00",
      }}
      onSaved={onSaved}
      onCancel={vi.fn()}
    />);

    expect(screen.getByLabelText("Reps")).toHaveValue(4);
    expect(screen.getByLabelText("Hold per repetition")).toHaveValue("0:10");
    await user.clear(screen.getByLabelText("Reps"));
    await user.type(screen.getByLabelText("Reps"), "6");
    await user.click(screen.getByRole("checkbox", { name: "Save set" }));

    await waitFor(() => expect(api.updateSet).toHaveBeenLastCalledWith(4, {
      time: null,
      repetitions: 6,
      durationMinutes: null,
      durationSeconds: null,
      holdMinutes: 0,
      holdSeconds: 10,
      resistanceKind: "bodyweight",
      weightKg: null,
    }));
    expect(onSaved).toHaveBeenCalledOnce();
  });
});

it.each(["duration", "timed_repetitions"] as const)("round-trips %s through one field and retains values after a failed save", async (measurementType) => {
  const user = userEvent.setup();
  vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
  vi.mocked(api.prefill).mockResolvedValue({ source: "previous", time: null, repetitions: 4, durationMinutes: measurementType === "duration" ? 1 : null, durationSeconds: measurementType === "duration" ? 30 : null, holdMinutes: measurementType === "timed_repetitions" ? 1 : null, holdSeconds: measurementType === "timed_repetitions" ? 30 : null, resistanceKind: "external", weightKg: "40" });
  vi.mocked(api.addSet).mockRejectedValueOnce(new Error("Server unavailable")).mockResolvedValue({});
  render(<SetForm exercise={{ ...exercise, measurementType }} day="2026-09-16" onSaved={vi.fn()} onCancel={vi.fn()} />);
  const input = await screen.findByLabelText(measurementType === "duration" ? "Duration" : "Hold per repetition");
  expect(input).toHaveValue("1:30");
  await user.click(input);
  await user.keyboard("9059");
  expect(input).toHaveValue("90:59");
  await user.click(screen.getByRole("checkbox", { name: "Save set" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
  expect(input).toHaveValue("90:59");
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(api.addSet).toHaveBeenLastCalledWith("2026-09-16", exercise.id, expect.objectContaining(measurementType === "duration" ? { durationMinutes: 90, durationSeconds: 59, holdMinutes: null, holdSeconds: null } : { holdMinutes: 90, holdSeconds: 59, durationMinutes: null, durationSeconds: null })));
});

it("rejects an invalid combined hold before writing and keeps edits during prefill refresh", async () => {
  const user = userEvent.setup();
  const prefill = { source: "previous" as const, time: null, repetitions: 4, durationMinutes: null, durationSeconds: null, holdMinutes: 0, holdSeconds: 10, resistanceKind: "bodyweight" as const, weightKg: null };
  vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
  vi.mocked(api.prefill).mockResolvedValue(prefill);
  render(<SetForm exercise={{ ...exercise, measurementType: "timed_repetitions" }} day="2026-09-16" onSaved={vi.fn()} onCancel={vi.fn()} />);
  const hold = await screen.findByLabelText("Hold per repetition");
  await user.click(hold);
  await user.keyboard("160");
  const calls = vi.mocked(api.addSet).mock.calls.length;
  await user.click(screen.getByRole("checkbox", { name: "Save set" }));
  expect(screen.getByRole("alert")).toHaveTextContent("seconds between 00 and 59");
  expect(hold).toHaveValue("1:60");
  expect(api.addSet).toHaveBeenCalledTimes(calls);
  await user.clear(hold);
  await user.type(hold, "130");
  await user.clear(screen.getByLabelText("kg"));
  await user.type(screen.getByLabelText("kg"), "25");
  vi.mocked(api.prefill).mockResolvedValue({ ...prefill, repetitions: 12, holdSeconds: 20 });
  const time = screen.getByLabelText("Time");
  await user.clear(time);
  await user.type(time, "09:00");
  await user.tab();
  await waitFor(() => expect(api.prefill).toHaveBeenLastCalledWith(exercise.id, "2026-09-16", "09:00"));
  expect(hold).toHaveValue("1:30");
  expect(screen.getByLabelText("kg")).toHaveValue("25");
  expect(screen.getByLabelText("Reps")).toHaveValue(12);
});

it("maps zero kg to bodyweight and removes the entry actions menu", async () => {
  const user = userEvent.setup();
  vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
  vi.mocked(api.prefill).mockResolvedValue({ source: "previous", time: null, repetitions: 4, durationMinutes: null, durationSeconds: null, holdMinutes: null, holdSeconds: null, resistanceKind: "external", weightKg: "40" });
  const cancel = vi.fn();
  render(<SetForm exercise={exercise} day="2026-09-16" onSaved={vi.fn()} onCancel={cancel} />);
  const kg = await screen.findByLabelText("kg");
  await user.clear(kg);
  await user.type(kg, "0");
  await user.click(screen.getByRole("checkbox", { name: "Save set" }));
  await waitFor(() => expect(api.addSet).toHaveBeenLastCalledWith("2026-09-16", exercise.id, expect.objectContaining({ resistanceKind: "bodyweight", weightKg: null })));
  expect(screen.queryByRole("button", { name: "Entry actions" })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Discard entry" })).not.toBeInTheDocument();
  expect(cancel).not.toHaveBeenCalled();
});

it("cancels editing a saved set without deleting it", async () => {
  const user = userEvent.setup();
  const cancel = vi.fn();
  const remove = vi.fn();
  render(<SetForm exercise={exercise} day="2026-09-16" onSaved={vi.fn()} onCancel={cancel} onDelete={remove} existing={{
    id: 5,
    exerciseId: exercise.id,
    date: "2026-09-16",
    occurredAt: "2026-09-16T10:00:00+00:00",
    createdAt: "2026-09-16T10:00:00+00:00",
    time: "12:00",
    repetitions: 10,
    durationMinutes: null,
    durationSeconds: null,
    holdMinutes: null,
    holdSeconds: null,
    resistanceKind: "bodyweight",
    weightKg: null,
    equipment: null,
    customEquipment: null,
  }} />);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(remove).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Entry actions" })).not.toBeInTheDocument();
});

it("keeps the checkbox unchecked until confirmation and prevents duplicate writes", async () => {
  const user = userEvent.setup();
  vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
  vi.mocked(api.prefill).mockResolvedValue({ source: "previous", time: null, repetitions: 12, durationMinutes: null, durationSeconds: null, holdMinutes: null, holdSeconds: null, resistanceKind: "bodyweight", weightKg: null });
  let finish!: (value: unknown) => void;
  vi.mocked(api.addSet).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const saved = vi.fn();
  render(<SetForm exercise={exercise} day="2026-09-16" onSaved={saved} onCancel={vi.fn()} />);
  const checkbox = await screen.findByRole("checkbox", { name: "Save set" });
  const calls = vi.mocked(api.addSet).mock.calls.length;
  await user.click(checkbox);
  await user.click(checkbox);
  expect(checkbox).toBeDisabled();
  expect(checkbox).not.toBeChecked();
  expect(api.addSet).toHaveBeenCalledTimes(calls + 1);
  expect(saved).not.toHaveBeenCalled();
  finish({});
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
});

it("does not save an invalid row when its checkbox is clicked", async () => {
  const user = userEvent.setup();
  vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
  vi.mocked(api.prefill).mockResolvedValue({ source: "previous", time: null, repetitions: 12, durationMinutes: null, durationSeconds: null, holdMinutes: null, holdSeconds: null, resistanceKind: "bodyweight", weightKg: null });
  render(<SetForm exercise={exercise} day="2026-09-16" onSaved={vi.fn()} onCancel={vi.fn()} />);
  const input = await screen.findByLabelText("Reps");
  await user.clear(input);
  const calls = vi.mocked(api.addSet).mock.calls.length;
  const checkbox = screen.getByRole("checkbox", { name: "Save set" });
  await user.click(checkbox);
  expect(checkbox).not.toBeChecked();
  expect(input).toBeInvalid();
  expect(api.addSet).toHaveBeenCalledTimes(calls);
});
