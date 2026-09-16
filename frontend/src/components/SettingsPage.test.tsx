import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    backups: vi.fn(),
    createBackup: vi.fn(),
    deleteBackup: vi.fn(),
    restoreBackup: vi.fn(),
    restoreUploadedBackup: vi.fn(),
  },
}));

const config = { today: "2026-09-16", timezone: "Europe/Warsaw", version: "1.0.0" };
const pwaInstall = { canPrompt: false, install: vi.fn(), installed: false, isIos: false, isSecure: true };

beforeEach(() => {
  vi.mocked(api.backups).mockResolvedValue([
    { id: "on-demand-20260916T120000000000Z.sqlite3", category: "on-demand", createdAt: "2026-09-16T12:00:00Z", sizeBytes: 1024 },
  ]);
  vi.mocked(api.restoreBackup).mockResolvedValue({ source: "backup", safetyBackup: { id: "safety.sqlite3", category: "on-demand", createdAt: "2026-09-16T12:01:00Z", sizeBytes: 1024 } });
  vi.mocked(api.restoreUploadedBackup).mockResolvedValue({ source: "upload", safetyBackup: { id: "safety.sqlite3", category: "on-demand", createdAt: "2026-09-16T12:01:00Z", sizeBytes: 1024 } });
});

describe("Settings restore", () => {
  it("requires typed confirmation before restoring a listed backup", async () => {
    const user = userEvent.setup();
    render(<SettingsPage config={config} pwaInstall={pwaInstall} />);
    await screen.findByRole("button", { name: /Restore on-demand/ });
    await user.click(screen.getByRole("button", { name: /Restore on-demand/ }));
    const restore = screen.getByRole("button", { name: "Restore database" });
    expect(restore).toBeDisabled();
    await user.type(screen.getByLabelText("Confirmation"), "RESTORE");
    await user.click(screen.getByRole("button", { name: "Restore database" }));
    await waitFor(() => expect(api.restoreBackup).toHaveBeenCalledWith("on-demand-20260916T120000000000Z.sqlite3", "RESTORE"));
  });

  it("restores a selected uploaded SQLite file", async () => {
    const user = userEvent.setup();
    render(<SettingsPage config={config} pwaInstall={pwaInstall} />);
    const file = new File(["sqlite"], "older-ledger.sqlite3", { type: "application/x-sqlite3" });
    await user.upload(screen.getByLabelText("Upload a SQLite backup"), file);
    await user.click(screen.getByRole("button", { name: "Restore uploaded backup" }));
    await user.type(screen.getByLabelText("Confirmation"), "RESTORE");
    await user.click(screen.getByRole("button", { name: "Restore database" }));
    await waitFor(() => expect(api.restoreUploadedBackup).toHaveBeenCalledWith(file, "RESTORE"));
  });
});
