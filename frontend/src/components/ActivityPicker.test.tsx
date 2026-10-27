import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ActivityPicker } from "./ActivityPicker";

vi.mock("../lib/api", () => ({ api: {
  activities: vi.fn(),
  archiveActivity: vi.fn(),
  restoreActivity: vi.fn(),
  deleteActivityDefinition: vi.fn(),
} }));

describe("ActivityPicker activity management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.activities).mockImplementation(async (status) => status === "active"
      ? [{ id: 1, name: "Walking" }]
      : [{ id: 2, name: "Old run" }]);
  });

  it("confirms archive before changing activity status", async () => {
    const user = userEvent.setup();
    vi.mocked(api.archiveActivity).mockResolvedValue({ id: 1, name: "Walking" });
    render(<ActivityPicker day="2026-10-27" timezone="Europe/Warsaw" onClose={vi.fn()} onStarted={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "More actions for Walking" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive Walking" }));
    expect(api.archiveActivity).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, archive" }));

    await waitFor(() => expect(api.archiveActivity).toHaveBeenCalledWith(1));
  });

  it("deletes an activity from the picker after the typed confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(api.deleteActivityDefinition).mockResolvedValue(undefined);
    render(<ActivityPicker day="2026-10-27" timezone="Europe/Warsaw" onClose={vi.fn()} onStarted={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "More actions for Walking" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete Walking permanently" }));
    const confirmation = screen.getByRole("textbox", { name: "Confirmation" });
    await user.type(confirmation, "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(api.deleteActivityDefinition).toHaveBeenCalledWith(1, "DELETE"));
  });
});
