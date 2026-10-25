import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { getServerReachability, getWriteOutcomeUncertain, reportServerReachability } from "./connectivity";

describe("API connectivity contract", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("blocks mutations until a server response confirms reachability", async () => {
    expect(getServerReachability()).toBe("unknown");
    await expect(api.updateDailyNote("2026-10-25", "note")).rejects.toThrow(/not yet been confirmed/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats validation responses as reachable server errors", async () => {
    reportServerReachability("reachable");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Invalid note" }), { status: 422 }));
    await expect(api.updateDailyNote("2026-10-25", "note")).rejects.toThrow("Invalid note");
    expect(getServerReachability()).toBe("reachable");
    expect(getWriteOutcomeUncertain()).toBe(false);
  });

  it("locks further mutations after an interrupted write until the app reloads", async () => {
    reportServerReachability("reachable");
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.updateDailyNote("2026-10-25", "note")).rejects.toThrow(/may have reached Rostam/i);
    expect(getServerReachability()).toBe("disconnected");
    expect(getWriteOutcomeUncertain()).toBe(true);
    await expect(api.updateDailyNote("2026-10-25", "retry")).rejects.toThrow(/reload Rostam to reconcile/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
