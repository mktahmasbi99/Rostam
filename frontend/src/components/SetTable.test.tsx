import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { Exercise, ExerciseSet } from "../lib/types";
import { SetTable } from "./SetTable";
import { SetRow } from "./SetRow";

const exercise: Exercise = { id: 1, name: "Weighted hold", baseName: "Weighted hold", measurementType: "timed_repetitions", equipment: "dumbbell", allowBodyweight: true, imageKey: null, exerciseNote: null, archivedAt: null, customEquipment: null, hasHistory: true };
const set: ExerciseSet = { id: 1, exerciseId: 1, date: "2026-10-27", time: "14:17", occurredAt: "", createdAt: "", repetitions: 4, durationMinutes: null, durationSeconds: null, holdMinutes: 0, holdSeconds: 10, resistanceKind: "external", weightKg: "10", equipment: "dumbbell", customEquipment: null };

it("shows shared headers and separate measurements, including mixed bodyweight sets", () => {
  render(<SetTable exercise={exercise}><SetRow exercise={exercise} set={set} index={0} /><SetRow exercise={exercise} set={{ ...set, id: 2, resistanceKind: "bodyweight", weightKg: null }} index={1} /></SetTable>);
  expect(screen.getAllByText("kg")).toHaveLength(1);
  expect(screen.getAllByText("Reps")).toHaveLength(1);
  expect(screen.getAllByText("Hold")).toHaveLength(1);
  expect(screen.getByLabelText("10 kg")).toHaveTextContent("10");
  expect(screen.getByLabelText("Bodyweight")).toHaveTextContent("BW");
  expect(screen.getAllByLabelText("Hold per repetition")[0]).toHaveTextContent("0:10");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("opens row actions with keyboard, dismisses with Escape, and invokes edit/delete", async () => {
  const user = userEvent.setup();
  const edit = vi.fn();
  const remove = vi.fn();
  render(<SetTable exercise={exercise} editable><SetRow exercise={exercise} set={set} index={0} onEdit={edit} onDelete={remove} /></SetTable>);
  const trigger = screen.getByRole("button", { name: "Actions for set 1" });
  expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  trigger.focus();
  await user.keyboard("{Enter}");
  const menu = screen.getByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Edit set 1" })).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(within(menu).getByRole("menuitem", { name: "Delete set 1" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Edit set 1" }));
  expect(edit).toHaveBeenCalledOnce();
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Delete set 1" }));
  expect(remove).toHaveBeenCalledOnce();
});
