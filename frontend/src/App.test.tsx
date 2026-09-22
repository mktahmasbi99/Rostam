import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./lib/api";

vi.mock("./lib/api", () => ({
  api: {
    config: vi.fn(),
    day: vi.fn(),
    calendar: vi.fn(),
    exercises: vi.fn(),
    backups: vi.fn(),
  },
}));

describe("Rostam shell", () => {
  beforeEach(() => {
    vi.mocked(api.config).mockResolvedValue({ today: "2026-09-13", timezone: "Europe/Warsaw", version: "1.0.0" });
    vi.mocked(api.day).mockResolvedValue({ date: "2026-09-13", sections: [] });
    vi.mocked(api.calendar).mockResolvedValue({ month: "2026-09", activeDates: ["2026-09-13"] });
    vi.mocked(api.exercises).mockResolvedValue([]);
    vi.mocked(api.backups).mockResolvedValue([]);
  });

  it("starts on an empty observational day", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(await screen.findByText("No sets recorded")).toBeInTheDocument();
    expect(screen.queryByText(/goal/i)).not.toBeInTheDocument();
  });

  it("opens the calendar from the day heading and returns through the standard ledger", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "Choose a day" }));
    await waitFor(() => expect(api.calendar).toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "Calendar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2026-09-12" }));
    await waitFor(() => expect(api.day).toHaveBeenLastCalledWith("2026-09-12"));
    expect(screen.queryByRole("button", { name: "Calendar" })).not.toBeInTheDocument();
  });

  it("jumps from the calendar back to today", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Choose a day" }));
    await user.click(screen.getByRole("button", { name: "Jump to Today" }));
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
  });

  it("navigates between days from the ledger header without allowing future dates", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Today" });
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(api.day).toHaveBeenLastCalledWith("2026-09-12"));
    expect(screen.getByText("2026-09-12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(api.day).toHaveBeenLastCalledWith("2026-09-13"));
  });

  it("closes the calendar when its backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Choose a day" }));
    await user.click(screen.getByTestId("calendar-backdrop"));
    expect(screen.queryByRole("dialog", { name: "Calendar" })).not.toBeInTheDocument();
  });
});
