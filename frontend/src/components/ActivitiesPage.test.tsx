import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ActivitiesPage } from "./ActivitiesPage";

vi.mock("../lib/api", () => ({ api: { activities: vi.fn(), updateActivityDefinition: vi.fn(), archiveActivity: vi.fn(), restoreActivity: vi.fn(), deleteActivityDefinition: vi.fn() } }));

describe("ActivitiesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.activities).mockImplementation(async (status) => status === "active"
      ? [{ id: 1, name: "Walking" }]
      : [{ id: 2, name: "Old run" }]);
  });

  it("shows active and archived activities and lets the user rename one", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateActivityDefinition).mockResolvedValue({ id: 1, name: "Outdoor walk" });
    render(<ActivitiesPage />);

    expect(await screen.findByText("Walking")).toBeInTheDocument();
    await user.click(screen.getByText("Archived"));
    expect(await screen.findByText("Old run")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rename Walking" }));
    const name = screen.getByRole("textbox", { name: "Activity name for Walking" });
    await user.clear(name);
    await user.type(name, "Outdoor walk");
    await user.click(screen.getByRole("button", { name: "Save Walking" }));

    await waitFor(() => expect(api.updateActivityDefinition).toHaveBeenCalledWith(1, "Outdoor walk"));
    expect(api.activities).toHaveBeenCalledWith("archived");
  });

  it("archives an activity from its actions menu", async () => {
    const user = userEvent.setup();
    vi.mocked(api.archiveActivity).mockResolvedValue({ id: 1, name: "Walking" });
    render(<ActivitiesPage />);

    await user.click(await screen.findByRole("button", { name: "More actions for Walking" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive Walking" }));
    expect(api.archiveActivity).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, archive" }));

    await waitFor(() => expect(api.archiveActivity).toHaveBeenCalledWith(1));
    expect(api.activities).toHaveBeenCalledWith("active");
  });

  it("requires typing DELETE before permanently deleting activity history", async () => {
    const user = userEvent.setup();
    vi.mocked(api.deleteActivityDefinition).mockResolvedValue(undefined);
    render(<ActivitiesPage />);

    await user.click(await screen.findByRole("button", { name: "More actions for Walking" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete Walking permanently" }));
    expect(screen.getByText(/all of its session history/)).toBeInTheDocument();
    const confirm = screen.getByRole("textbox", { name: "Confirmation" });
    expect(screen.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
    await user.type(confirm, "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(api.deleteActivityDefinition).toHaveBeenCalledWith(1, "DELETE"));
  });

  it("requires confirmation before restoring an archived activity", async () => {
    const user = userEvent.setup();
    vi.mocked(api.restoreActivity).mockResolvedValue({ id: 2, name: "Old run" });
    render(<ActivitiesPage />);

    await user.click(await screen.findByText("Archived"));
    await user.click(await screen.findByRole("button", { name: "More actions for Old run" }));
    await user.click(screen.getByRole("menuitem", { name: "Restore Old run" }));
    expect(api.restoreActivity).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, restore" }));

    await waitFor(() => expect(api.restoreActivity).toHaveBeenCalledWith(2));
  });
});
