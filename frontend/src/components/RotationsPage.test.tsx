import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Exercise, Rotation } from "../lib/types";
import { RotationsPage } from "./RotationsPage";

vi.mock("../lib/api", () => ({ api: {
  rotations: vi.fn(), exercises: vi.fn(), rotationRecommendations: vi.fn(),
  setRotationMembers: vi.fn(), activateRotation: vi.fn(), createRotation: vi.fn(),
  renameRotation: vi.fn(), deleteRotation: vi.fn(), deactivateRotation: vi.fn(),
  archiveRotation: vi.fn(), restoreRotation: vi.fn(),
  createExercise: vi.fn(), uploadExerciseImage: vi.fn(),
} }));

const squat: Exercise = {
  id: 3, name: "Squats", baseName: "Squats", measurementType: "repetitions",
  equipment: null, customEquipment: null, allowBodyweight: true, imageKey: null,
  exerciseNote: null, archivedAt: null, hasHistory: true, primaryMuscle: "quadriceps", secondaryMuscles: [],
};

const rotation = (members: Rotation["members"]): Rotation => ({
  id: 1, name: "Morning", active: false, dueExerciseId: null, duePosition: null,
  resolvedToday: null, members,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.exercises).mockResolvedValue([squat]);
  vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [rotation([])]);
  vi.mocked(api.rotationRecommendations).mockResolvedValue([
    { exercise: squat, date: "2026-10-20" },
    { exercise: squat, date: "2026-10-19" },
  ]);
  vi.mocked(api.createRotation).mockResolvedValue(rotation([]));
  vi.mocked(api.setRotationMembers).mockImplementation(async (_id, ids) => rotation(ids.map((_, index) => ({
    exercise: squat, position: index, lastDoneDate: null, daysSinceLastDone: null,
  }))));
});

describe("RotationsPage", () => {
  it("opens a newly created rotation directly in edit mode without activating it", async () => {
    const created = { ...rotation([]), name: "Evening" };
    vi.mocked(api.createRotation).mockResolvedValue(created);
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [created]);
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(screen.getByRole("button", { name: "Create rotation" }));
    await user.type(screen.getByRole("textbox", { name: "Rotation name" }), "Evening");
    await user.click(screen.getByRole("button", { name: /^Create$/ }));
    await waitFor(() => expect(api.createRotation).toHaveBeenCalledWith("Evening"));
    expect(await screen.findByRole("dialog", { name: "Evening" })).toBeInTheDocument();
    expect(screen.getByText("Build from recent exercises")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(api.activateRotation).not.toHaveBeenCalled();
  });

  it("opens a read-only full-screen view and exposes editing controls only from the pencil", async () => {
    const repeated = rotation([
      { exercise: squat, position: 0, lastDoneDate: null, daysSinceLastDone: null },
      { exercise: squat, position: 1, lastDoneDate: null, daysSinceLastDone: null },
    ]);
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [repeated]);
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(await screen.findByRole("button", { name: "Open Morning" }));
    expect(await screen.findByRole("dialog", { name: "Morning" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Squats · 1" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Morning" }));
    expect(await screen.findByRole("button", { name: "Remove Squats · 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "View Morning" }));
    expect(screen.getByRole("switch", { name: "Choose a different starting exercise" })).not.toBeChecked();
    expect(screen.queryByLabelText("Due first")).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Choose a different starting exercise" }));
    expect(screen.getByLabelText("Due first")).toBeInTheDocument();
  });

  it("opens read-only rotation details when the compact pencil is tapped", async () => {
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [rotation([])]);
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(await screen.findByRole("button", { name: "View Morning" }));
    expect(await screen.findByRole("dialog", { name: "Morning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Morning" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  });

  it("opens the exercise chooser from the plus button and shows muscle groups", async () => {
    const withOne = rotation([{ exercise: squat, position: 0, lastDoneDate: null, daysSinceLastDone: null }]);
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [withOne]);
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(await screen.findByRole("button", { name: "Open Morning" }));
    await user.click(screen.getByRole("button", { name: "Edit Morning" }));
    expect(screen.getAllByText("Quadriceps").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Add exercise to Morning" }));
    expect(await screen.findByRole("dialog", { name: "Add to Morning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Squats to Morning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create New Exercise" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Squats to Morning" }));
    expect(await screen.findByRole("button", { name: "Remove Squats · 2" })).toBeInTheDocument();
  });

  it("discards staged member changes when the close button is used", async () => {
    const withOne = rotation([{ exercise: squat, position: 0, lastDoneDate: null, daysSinceLastDone: null }]);
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [withOne]);
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(await screen.findByRole("button", { name: "View Morning" }));
    await user.click(screen.getByRole("button", { name: "Edit Morning" }));
    await user.click(screen.getByRole("button", { name: "Remove Squats" }));
    expect(screen.queryByRole("button", { name: "Remove Squats" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close Morning" }));
    expect(await screen.findByRole("dialog", { name: "Morning" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Squats" })).not.toBeInTheDocument();
    expect(api.setRotationMembers).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close Morning" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Open Morning" }));
    expect(screen.getAllByText("Squats").length).toBeGreaterThan(0);
  });

  it("shows a gradual preview fade only when a rotation has more than three members", async () => {
    const long = rotation(Array.from({ length: 5 }, (_, position) => ({
      exercise: squat, position, lastDoneDate: null, daysSinceLastDone: null,
    })));
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [long]);
    render(<RotationsPage />);
    await screen.findByRole("button", { name: "Open Morning" });
    expect(document.querySelector(".rotation-preview")).toHaveClass("has-more");
    expect(screen.queryByText("+2 more")).not.toBeInTheDocument();
  });

  it("applies daily history suggestions only in edit mode", async () => {
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [rotation([])]);
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(await screen.findByRole("button", { name: "View Morning" }));
    await user.click(screen.getByRole("button", { name: "Edit Morning" }));
    expect(await screen.findByText("Build from recent exercises")).toBeInTheDocument();
    const range = screen.getByRole("spinbutton", { name: "Look back days for Morning" });
    await user.clear(range);
    await user.type(range, "30");
    await user.click(screen.getByRole("button", { name: "Use range" }));
    expect(api.setRotationMembers).not.toHaveBeenCalled();
    expect(screen.getByText("Squats · 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(api.setRotationMembers).toHaveBeenCalledWith(1, [3, 3]));
    expect(api.rotationRecommendations).toHaveBeenCalledWith(30);
  });

  it("starts at the first list position by default and offers a starting-position override", async () => {
    const withMembers = rotation([
      { exercise: squat, position: 0, lastDoneDate: null, daysSinceLastDone: null },
      { exercise: squat, position: 1, lastDoneDate: null, daysSinceLastDone: null },
    ]);
    let active = false;
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [{ ...withMembers, active }]);
    vi.mocked(api.activateRotation).mockImplementation(async () => { active = true; return withMembers; });
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(await screen.findByRole("button", { name: "View Morning" }));
    await user.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(api.activateRotation).toHaveBeenCalledWith(1, 0));
    expect(await screen.findByText("Morning activated")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByRole("dialog", { name: "Morning · Active" })).toBeInTheDocument();
  });

  it("offers only Deactivate when a rotation is already active", async () => {
    const active = { ...rotation([{ exercise: squat, position: 0, lastDoneDate: null, daysSinceLastDone: null }]), active: true, dueExerciseId: 3, duePosition: 0 };
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [active]);
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(await screen.findByRole("button", { name: "Open Morning" }));
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
  });

  it("shows deactivation confirmation and keeps the rotation detail open", async () => {
    let active = true;
    const activeRotation = { ...rotation([{ exercise: squat, position: 0, lastDoneDate: null, daysSinceLastDone: null }]), active: true, dueExerciseId: 3, duePosition: 0 };
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [{ ...activeRotation, active }]);
    vi.mocked(api.deactivateRotation).mockImplementation(async () => { active = false; return activeRotation; });
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(await screen.findByRole("button", { name: "Open Morning" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(await screen.findByText("Morning deactivated")).toBeInTheDocument();
    expect(screen.getByRole("status").querySelector(".rotation-activation-check")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("deactivated");
    await waitFor(() => expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByRole("dialog", { name: "Morning" })).toBeInTheDocument();
  });

  it("archives and restores rotations through the kebab menu", async () => {
    const archivedRotation = { ...rotation([]), archivedAt: "2026-10-24" };
    let isArchived = false;
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? (isArchived ? [archivedRotation] : []) : (isArchived ? [] : [rotation([])]));
    vi.mocked(api.archiveRotation).mockImplementation(async () => { isArchived = true; return archivedRotation; });
    vi.mocked(api.restoreRotation).mockImplementation(async () => { isArchived = false; return rotation([]); });
    const user = userEvent.setup();
    render(<RotationsPage />);
    await user.click(await screen.findByRole("button", { name: "More actions for Morning" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive Morning" }));
    expect(api.archiveRotation).toHaveBeenCalledWith(1);
    await user.click(await screen.findByRole("button", { name: "More actions for Morning" }));
    await user.click(screen.getByRole("menuitem", { name: "Restore Morning" }));
    expect(api.restoreRotation).toHaveBeenCalledWith(1);
  });

  it("shows occurrence numbers on the compact card and full-screen view", async () => {
    vi.mocked(api.rotations).mockImplementation(async (status) => status === "archived" ? [] : [rotation([
      { exercise: squat, position: 0, lastDoneDate: null, daysSinceLastDone: null },
      { exercise: squat, position: 1, lastDoneDate: null, daysSinceLastDone: null },
    ])]);
    const user = userEvent.setup();
    render(<RotationsPage />);
    expect(await screen.findByText("Squats · 1")).toBeInTheDocument();
    expect(screen.getByText("Squats · 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Morning" }));
    expect(screen.getAllByText("Squats · 1")).toHaveLength(2);
    expect(screen.getAllByText("Squats · 2")).toHaveLength(2);
  });
});
