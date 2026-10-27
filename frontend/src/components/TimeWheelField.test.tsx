import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimeWheelField } from "./TimeWheelField";

describe("TimeWheelField", () => {
  it("uses a 24-hour hour and minute wheel and commits keyboard selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeWheelField label="Start time" value="17:05" onChange={onChange} max={1438} />);
    await user.click(screen.getByRole("button", { name: "Start time" }));
    expect(screen.getByRole("spinbutton", { name: "Hour" })).toHaveAttribute("aria-valuenow", "17");
    expect(screen.getByRole("spinbutton", { name: "Minute" })).toHaveAttribute("aria-valuenow", "5");
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Hour" }), { key: "ArrowUp" });
    await user.click(screen.getByRole("button", { name: "Set time" }));
    expect(onChange).toHaveBeenCalledWith("18:05");
  });

  it("limits the end wheel to at least one minute after the start", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeWheelField label="End time" value="17:05" onChange={onChange} min={17 * 60 + 6} />);
    await user.click(screen.getByRole("button", { name: "End time" }));
    const minuteWheel = screen.getByRole("spinbutton", { name: "Minute" });
    expect(minuteWheel).toHaveAttribute("aria-valuemin", "6");
    expect(minuteWheel).toHaveAttribute("aria-valuenow", "6");
    await user.click(screen.getByRole("button", { name: "Set time" }));
    expect(onChange).toHaveBeenCalledWith("17:06");
  });
  it("updates throughout scrolling without resetting the native scroll position", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeWheelField label="Start time" value="12:20" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Start time" }));
    const wheel = screen.getByRole("spinbutton", { name: "Minute" });
    const scroller = wheel.querySelector(".time-wheel-scroll")!;
    expect(scroller.scrollTop).toBe(20 * 36);
    fireEvent.scroll(scroller, { target: { scrollTop: 23 * 36 + 8 } });
    expect(wheel).toHaveAttribute("aria-valuenow", "23");
    expect(scroller.scrollTop).toBe(23 * 36 + 8);
    fireEvent.scroll(scroller, { target: { scrollTop: 30 * 36 } });
    expect(wheel).toHaveAttribute("aria-valuenow", "30");
    await user.click(screen.getByRole("button", { name: "Set time" }));
    expect(onChange).toHaveBeenCalledWith("12:30");
  });

  it("skips blocked times during scrolling and realigns for keyboard input", async () => {
    const user = userEvent.setup();
    render(<TimeWheelField label="Start time" value="12:20" onChange={vi.fn()} blockedIntervals={[{ startMinute: 12 * 60 + 21, endMinute: 12 * 60 + 25 }]} />);
    await user.click(screen.getByRole("button", { name: "Start time" }));
    const wheel = screen.getByRole("spinbutton", { name: "Minute" });
    const scroller = wheel.querySelector(".time-wheel-scroll")!;
    fireEvent.scroll(scroller, { target: { scrollTop: 22 * 36 } });
    expect(wheel).toHaveAttribute("aria-valuenow", "25");
    fireEvent.keyDown(wheel, { key: "ArrowDown" });
    expect(wheel).toHaveAttribute("aria-valuenow", "20");
    expect(scroller.scrollTop).toBe(20 * 36);
  });

});
