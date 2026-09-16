import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstallAppPanel, type PwaInstallState } from "./InstallAppPanel";

const installState = (overrides: Partial<PwaInstallState> = {}): PwaInstallState => ({
  canPrompt: false,
  install: vi.fn(() => Promise.resolve()),
  installed: false,
  isIos: false,
  isSecure: true,
  ...overrides,
});

describe("InstallAppPanel", () => {
  it("offers the captured browser installation prompt", async () => {
    const user = userEvent.setup();
    const install = vi.fn(() => Promise.resolve());
    render(<InstallAppPanel state={installState({ canPrompt: true, install })} />);

    await user.click(screen.getByRole("button", { name: "Install Rostam" }));

    expect(install).toHaveBeenCalledOnce();
  });

  it("explains iOS, insecure, and installed states", () => {
    const { rerender } = render(<InstallAppPanel state={installState({ isIos: true })} />);
    expect(screen.getByText("In Safari, tap Share, then Add to Home Screen.")).toBeInTheDocument();

    rerender(<InstallAppPanel state={installState({ isSecure: false })} />);
    expect(screen.getByText(/requires Rostam’s HTTPS address/)).toBeInTheDocument();

    rerender(<InstallAppPanel state={installState({ installed: true })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Installed on this device.");
  });
});
