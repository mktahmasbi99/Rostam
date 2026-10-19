import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("keeps focus inside an editor when the close callback changes during typing", () => {
    const firstClose = vi.fn();
    const { rerender } = render(
      <Modal title="Activity notes" onClose={firstClose}>
        <textarea aria-label="Activity notes" value="" onChange={() => undefined} />
      </Modal>,
    );
    const editor = screen.getByRole("textbox", { name: "Activity notes" });
    editor.focus();

    rerender(
      <Modal title="Activity notes" onClose={() => undefined}>
        <textarea aria-label="Activity notes" value="a" onChange={() => undefined} />
      </Modal>,
    );

    expect(document.activeElement).toBe(editor);
  });

  it("calls the latest close callback on Escape", () => {
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const { rerender } = render(<Modal title="Dialog" onClose={firstClose}><p>Body</p></Modal>);
    rerender(<Modal title="Dialog" onClose={latestClose}><p>Body</p></Modal>);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();
  });
});
