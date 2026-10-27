import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DurationInput } from "./DurationInput";
import { parseDurationValue } from "../lib/duration";

function Editor({ initial = "" }) {
  const [value, setValue] = useState(initial);
  return <DurationInput label="Duration" value={value} onChange={setValue} suggested={false} />;
}

describe("combined duration entry", () => {
  it("inserts a colon, supports backspace to empty, and replaces selected digits", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const input = screen.getByLabelText("Duration");
    await user.type(input, "130");
    expect(input).toHaveValue("1:30");
    await user.keyboard("{Backspace}");
    expect(input).toHaveValue("0:13");
    await user.keyboard("{Backspace}{Backspace}");
    expect(input).toHaveValue("");
    await user.type(input, "10");
    expect(input).toHaveValue("0:10");
    await user.clear(input);
    await user.type(input, "123");
    (input as HTMLInputElement).setSelectionRange(2, 4);
    await user.keyboard("45");
    expect(input).toHaveValue("1:45");
    (input as HTMLInputElement).setSelectionRange(0, 4);
    await user.keyboard("{Delete}");
    expect(input).toHaveValue("");
  });

  it("accepts pasted m:ss, single-digit seconds, and values longer than an hour", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const input = screen.getByLabelText("Duration");
    await user.click(input);
    await user.paste("1:30");
    expect(input).toHaveValue("1:30");
    await user.clear(input);
    await user.paste("1:5");
    expect(input).toHaveValue("1:05");
    await user.clear(input);
    await user.type(input, "9059");
    expect(input).toHaveValue("90:59");
  });

  it.each(["", "0:00", "1:60", "1440:01", "-1:10", "bad"])("rejects invalid duration %s", (value) => {
    expect(parseDurationValue(value)).toBeNull();
  });

  it("preserves the existing 24-hour boundary", () => {
    expect(parseDurationValue("1440:00")).toEqual({ minutes: 1440, seconds: 0 });
    expect(parseDurationValue("0:01")).toEqual({ minutes: 0, seconds: 1 });
  });
});
