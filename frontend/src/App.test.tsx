import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./lib/api";
import { trackWrite } from "./lib/restartSafety";

vi.mock("./lib/api", () => ({
  api: {
    config: vi.fn(),
    day: vi.fn(),
    calendar: vi.fn(),
    exercises: vi.fn(),
    activities: vi.fn(),
    updateActivityDefinition: vi.fn(),
    rotations: vi.fn(),
    backups: vi.fn(),
  },
}));

describe("Rostam shell", () => {
  beforeEach(() => {
    vi.mocked(api.config).mockResolvedValue({ today: "2026-09-13", timezone: "Europe/Warsaw", version: "1.0.0" });
    vi.mocked(api.day).mockResolvedValue({ date: "2026-09-13", sections: [] });
    vi.mocked(api.calendar).mockResolvedValue({ month: "2026-09", activeDates: ["2026-09-13"] });
    vi.mocked(api.exercises).mockResolvedValue([]);
    vi.mocked(api.activities).mockResolvedValue([]);
    vi.mocked(api.rotations).mockResolvedValue([]);
    vi.mocked(api.backups).mockResolvedValue([]);
  });

  it("starts on an empty observational day", async () => {
    const { container } = render(<App />);
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(await screen.findByText("No activity recorded")).toBeInTheDocument();
    expect(screen.queryByText(/goal/i)).not.toBeInTheDocument();
    const backdrop = container.querySelector(".site-backdrop");
    expect(backdrop?.querySelector('source[type="image/webp"]')).toHaveAttribute("media", "(max-width: 768px)");
    expect(backdrop?.querySelector('source[type="image/jpeg"]')).toHaveAttribute("media", "(max-width: 768px)");
    const emptyLogo = container.querySelector(".empty-state picture");
    expect(emptyLogo?.querySelector('source[type="image/webp"]')).toBeInTheDocument();
    expect(emptyLogo?.querySelector("img")).toHaveAttribute("srcset", expect.stringContaining(".png"));
  });

  it("opens Rotations from the primary navigation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Rotations" }));
    expect(await screen.findByRole("heading", { name: "Rotations" })).toBeInTheDocument();
    expect(api.rotations).toHaveBeenCalled();
  });

  it("opens Activities after the exercise library", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Activities" }));
    expect(await screen.findByRole("heading", { name: "Activities" })).toBeInTheDocument();
    expect(api.activities).toHaveBeenCalledWith("active");
    expect(api.activities).toHaveBeenCalledWith("archived");
  });

  it("opens the calendar from the day heading and returns through the standard ledger", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "Choose a day" }));
    await waitFor(() => expect(api.calendar).toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "Calendar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2026-09-12" }));
    await waitFor(() => expect(api.day).toHaveBeenLastCalledWith("2026-09-12", expect.any(AbortSignal)));
    expect(screen.queryByRole("button", { name: "Calendar" })).not.toBeInTheDocument();
  });

  it("jumps from the calendar back to today", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Choose a day" }));
    await user.click(screen.getByRole("button", { name: "Jump to Today" }));
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
  });

  it("returns to Today when the header logo is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Exercises" }));
    expect(await screen.findByRole("heading", { name: "Exercises" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to Today" }));
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
  });

  it("navigates between days from the ledger header without allowing future dates", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Today" });
    expect(screen.queryByRole("button", { name: "Next day" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(api.day).toHaveBeenLastCalledWith("2026-09-12", expect.any(AbortSignal)));
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
    expect(screen.queryByText("2026-09-12")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(api.day).toHaveBeenLastCalledWith("2026-09-13", expect.any(AbortSignal)));
  });

  it("closes the calendar when its backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Choose a day" }));
    await user.click(screen.getByTestId("calendar-backdrop"));
    expect(screen.queryByRole("dialog", { name: "Calendar" })).not.toBeInTheDocument();
  });
});


it("keeps an unsaved daily note open when the server day changes", async () => {
  const user = userEvent.setup();
  vi.mocked(api.config).mockResolvedValue({ today: "2026-10-30", timezone: "Europe/Warsaw", version: "2.0.0" });
  vi.mocked(api.day).mockResolvedValue({ date: "2026-10-30", sections: [], dailyNote: null });
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Open daily note" }));
  await user.type(screen.getByRole("textbox", { name: "Note" }), "Keep my midnight draft");
  vi.mocked(api.config).mockResolvedValue({ today: "2026-10-31", timezone: "Europe/Warsaw", version: "2.0.0" });
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument());
  expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Keep my midnight draft");
  expect(api.day).toHaveBeenLastCalledWith("2026-10-30", expect.any(AbortSignal));
});


it("keeps the selected day while a save is pending at midnight", async () => {
  vi.mocked(api.config).mockResolvedValue({ today: "2026-10-30", timezone: "Europe/Warsaw", version: "2.0.0" });
  vi.mocked(api.day).mockResolvedValue({ date: "2026-10-30", sections: [] });
  render(<App />);
  await screen.findByRole("heading", { name: "Today" });
  let finish!: () => void;
  const saving = trackWrite(() => new Promise<void>((resolve) => { finish = resolve; }));
  try {
    vi.mocked(api.config).mockResolvedValue({ today: "2026-10-31", timezone: "Europe/Warsaw", version: "2.0.0" });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await screen.findByRole("heading", { name: "Yesterday" });
    expect(api.day).toHaveBeenLastCalledWith("2026-10-30", expect.any(AbortSignal));
  } finally {
    finish();
    await saving;
  }
});
