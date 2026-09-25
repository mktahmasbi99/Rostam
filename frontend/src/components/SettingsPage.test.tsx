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
    backupSettings: vi.fn(),
    updateBackupSettings: vi.fn(),
  },
}));

const config = { today: "2026-09-16", timezone: "Europe/Warsaw", version: "1.0.0" };
const pwaInstall = { canPrompt: false, install: vi.fn(), installed: false, isIos: false, isSecure: true };

beforeEach(() => {
  vi.mocked(api.backups).mockResolvedValue([
    { id: "on-demand-20260916T120000000000Z.sqlite3", category: "on-demand", createdAt: "2026-09-16T12:00:00Z", sizeBytes: 1024 },
  ]);
  vi.mocked(api.backupSettings).mockResolvedValue({ dailyEnabled: true, dailyTime: "02:00", dailyRetention: 7, weeklyEnabled: true, weeklyWeekday: 0, weeklyTime: "03:00", weeklyRetention: 8, safetyRetention: 3 });
  vi.mocked(api.updateBackupSettings).mockResolvedValue({ dailyEnabled: true, dailyTime: "02:00", dailyRetention: 7, weeklyEnabled: true, weeklyWeekday: 0, weeklyTime: "03:00", weeklyRetention: 8, safetyRetention: 3 });
  vi.mocked(api.restoreBackup).mockResolvedValue({ source: "backup", safetyBackup: { id: "safety.sqlite3", category: "on-demand", createdAt: "2026-09-16T12:01:00Z", sizeBytes: 1024 } });
  vi.mocked(api.restoreUploadedBackup).mockResolvedValue({ source: "upload", safetyBackup: { id: "safety.sqlite3", category: "on-demand", createdAt: "2026-09-16T12:01:00Z", sizeBytes: 1024 } });
});

describe("Backup schedule", () => {
  it("shows saving and saved feedback, then clears it when edited", async () => {
    const user = userEvent.setup();
    let resolveSave!: (settings: ReturnType<typeof api.updateBackupSettings> extends Promise<infer Result> ? Result : never) => void;
    vi.mocked(api.updateBackupSettings).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    render(<SettingsPage config={config} pwaInstall={pwaInstall} />);

    const retention = await screen.findByLabelText("Daily retention");
    await user.clear(retention);
    await user.type(retention, "14");
    await user.click(screen.getByRole("button", { name: "Save backup schedule" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();

    resolveSave({ dailyEnabled: true, dailyTime: "02:00", dailyRetention: 14, weeklyEnabled: true, weeklyWeekday: 0, weeklyTime: "03:00", weeklyRetention: 8, safetyRetention: 3 });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Backup schedule saved."));
    expect(screen.getByRole("button", { name: "Saved" })).toBeEnabled();

    await user.clear(retention);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports schedule save failures and allows retry", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateBackupSettings).mockRejectedValueOnce(new Error("Schedule unavailable"));
    render(<SettingsPage config={config} pwaInstall={pwaInstall} />);
    await screen.findByLabelText("Daily retention");
    await user.click(screen.getByRole("button", { name: "Save backup schedule" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Schedule unavailable"));
    expect(screen.getByRole("button", { name: "Save backup schedule" })).toBeEnabled();
  });
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
