import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("focuses the initial field, traps Tab in both directions, and restores focus", () => {
    const originalOverflow = document.body.style.overflow;
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(<Modal title="Dialog" onClose={() => undefined}><input aria-label="Name" autoFocus /><button>First</button><button>Last</button></Modal>);
    const dialog = screen.getByRole("dialog", { name: "Dialog" });
    const first = within(dialog).getByRole("textbox", { name: "Name" });
    const firstButton = within(dialog).getByRole("button", { name: "Close Dialog" });
    const last = within(dialog).getByRole("button", { name: "Last" });
    expect(document.activeElement).toBe(first);
    expect(document.body.style.overflow).toBe("hidden");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(firstButton);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    unmount();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe(originalOverflow);
    trigger.remove();
  });

  it("keeps the background inert and only handles Escape in the top nested dialog", () => {
    const closeParent = vi.fn();
    const closeChild = vi.fn();
    render(<div data-rostam-app><button>Background</button><Modal title="Parent" onClose={closeParent}><button>Parent action</button><Modal title="Child" onClose={closeChild}><button>Child action</button></Modal></Modal></div>);
    const app = document.querySelector("[data-rostam-app]");
    expect(app).toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Parent" }).closest(".dialog-layer")).toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Child" }).closest(".dialog-layer")).not.toHaveAttribute("inert");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeChild).toHaveBeenCalledOnce();
    expect(closeParent).not.toHaveBeenCalled();
  });
});
