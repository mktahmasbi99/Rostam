import { beforeEach, describe, expect, it } from "vitest";
import { clearRestartDrafts, getRestartSnapshot, setRestartPreparing, trackWrite } from "./restartSafety";

describe("update restart safety", () => {
  beforeEach(() => {
    setRestartPreparing(false);
    clearRestartDrafts();
    document.body.innerHTML = "";
  });

  it("tracks a dirty control, clears it when restored, and drops it when its form closes", async () => {
    const form = document.createElement("form");
    form.dataset.updateDirty = "daily-note";
    form.dataset.updateDirtyLabel = "Daily note";
    const input = document.createElement("textarea");
    form.append(input);
    document.body.append(form);
    input.focus();
    input.value = "draft";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(getRestartSnapshot().dirty).toEqual(["Daily note"]);
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(getRestartSnapshot().dirty).toEqual([]);
    input.value = "draft";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getRestartSnapshot().dirty).toEqual([]);
  });

  it("counts writes until their responses finish and rejects new writes while preparing", async () => {
    let finish!: (response: Response) => void;
    const pending = trackWrite(() => new Promise<Response>((resolve) => { finish = resolve; }));
    expect(getRestartSnapshot().pendingWrites).toBe(1);
    setRestartPreparing(true);
    await expect(trackWrite(async () => new Response())).rejects.toThrow("restart is being prepared");
    setRestartPreparing(false);
    finish(new Response("{}", { status: 200 }));
    await pending;
    expect(getRestartSnapshot().pendingWrites).toBe(0);
  });

  it("retains a draft after a failed write", async () => {
    const form = document.createElement("form");
    const input = document.createElement("input");
    form.append(input);
    document.body.append(form);
    input.focus();
    input.value = "changed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await trackWrite(async () => new Response("failure", { status: 500 }));
    expect(getRestartSnapshot().dirty).toHaveLength(1);
  });

  it("keeps the parent draft after an auxiliary upload succeeds", async () => {
    const form = document.createElement("form");
    form.dataset.updateDirty = "exercise-editor";
    const input = document.createElement("input");
    form.append(input);
    document.body.append(form);
    input.focus();
    input.value = "changed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await trackWrite(async () => new Response("{}", { status: 200 }), false);
    expect(getRestartSnapshot().dirty).toHaveLength(1);
  });
});
