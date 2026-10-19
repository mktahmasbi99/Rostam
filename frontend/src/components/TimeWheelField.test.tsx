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
});
