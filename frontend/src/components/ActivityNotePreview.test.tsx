import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityNotePreview } from "./ActivityNotePreview";

describe("ActivityNotePreview", () => {
  let height = 120;
  let resize: () => void;
  const disconnect = vi.fn();

  beforeEach(() => {
    height = 120;
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => height);
    const getStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const style = getStyle(element);
      style.lineHeight = "20px";
      return style;
    });
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect = disconnect;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("expands the complete note from the preview and collapses with the keyboard", async () => {
    const user = userEvent.setup();
    const note = "Guard retention\nArm drags\nPassing\nEscapes\nFinal takeaway";
    render(<ActivityNotePreview note={note} />);
    const body = document.querySelector(".activity-note-body")!;
    expect(body.textContent).toBe(note);
    expect(body).toHaveClass("is-collapsed");
    expect(screen.getByRole("button", { name: "Show more" })).toHaveAttribute("aria-expanded", "false");
    await user.click(body);
    expect(body).not.toHaveClass("is-collapsed");
    const toggle = screen.getByRole("button", { name: "Show less" });
    expect(toggle).toHaveAttribute("aria-controls", body.id);
    toggle.focus();
    await user.keyboard(" ");
    expect(body).toHaveClass("is-collapsed");
    await user.keyboard("{Enter}");
    expect(body).not.toHaveClass("is-collapsed");
    expect(body.textContent).toBe(note);
  });

  it("leaves notes of up to three lines fully visible without a toggle", () => {
    height = 60;
    render(<ActivityNotePreview note="Short note" />);
    expect(screen.getByText("Short note")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("remeasures on resize and text updates while preserving expansion during refresh", async () => {
    const user = userEvent.setup();
    const { rerender, unmount } = render(<ActivityNotePreview note="Training details" />);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    rerender(<ActivityNotePreview note="Training details" />);
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
    height = 40;
    act(() => resize());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    height = 100;
    rerender(<ActivityNotePreview note="Updated training details" />);
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("keeps expansion independent for each note", async () => {
    const user = userEvent.setup();
    render(<><ActivityNotePreview note="First session" /><ActivityNotePreview note="Second session" /></>);
    await user.click(screen.getAllByRole("button", { name: "Show more" })[0]);
    expect(screen.getAllByRole("button", { name: "Show less" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Show more" })).toHaveLength(1);
  });
});
