import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { PhotosPage } from "./PhotosPage";

vi.mock("../lib/api", () => ({ api: { photos: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe("PhotosPage", () => {
  it("offers a read retry and shows empty only after a successful response", async () => {
    const user = userEvent.setup();
    vi.mocked(api.photos).mockRejectedValueOnce(new Error("Server unavailable")).mockResolvedValueOnce({ items: [], nextBeforeDate: null });
    render(<PhotosPage onChooseDay={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading photos");
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No daily photos yet.")).toBeInTheDocument();
    expect(api.photos).toHaveBeenCalledTimes(2);
  });

  it("loads complete older date groups on demand and lazy-loads thumbnails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.photos)
      .mockResolvedValueOnce({ items: [{ date: "2026-10-25", photos: [{ id: 1, date: "2026-10-25", displayOrder: 1, width: 20, height: 20, createdAt: "", thumbnailUrl: "/thumb/1", url: "/photo/1" }] }], nextBeforeDate: "2026-10-24" })
      .mockResolvedValueOnce({ items: [{ date: "2026-10-24", photos: [] }], nextBeforeDate: null });
    render(<PhotosPage onChooseDay={vi.fn()} />);

    expect(await screen.findByRole("img", { name: "Photo from 2026-10-25" })).toHaveAttribute("loading", "lazy");
    await user.click(screen.getByRole("button", { name: "Load older photos" }));
    expect(await screen.findByRole("button", { name: "2026-10-24" })).toBeInTheDocument();
    expect(api.photos).toHaveBeenLastCalledWith({ beforeDate: "2026-10-24" });
  });

  it("retries a failed older-page request from the same cursor", async () => {
    const user = userEvent.setup();
    vi.mocked(api.photos)
      .mockResolvedValueOnce({ items: [], nextBeforeDate: "2026-10-24" })
      .mockRejectedValueOnce(new Error("Page unavailable"))
      .mockResolvedValueOnce({ items: [{ date: "2026-10-24", photos: [] }], nextBeforeDate: null });
    render(<PhotosPage onChooseDay={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Load older photos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Page unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "2026-10-24" })).toBeInTheDocument();
    expect(api.photos).toHaveBeenLastCalledWith({ beforeDate: "2026-10-24" });
  });
});
