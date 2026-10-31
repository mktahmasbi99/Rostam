import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { PhotosPage } from "./PhotosPage";

vi.mock("../lib/api", () => ({ api: { photos: vi.fn(), dayPhotos: vi.fn(), uploadPhotos: vi.fn(), deletePhoto: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe("PhotosPage", () => {
  it("offers a read retry and shows empty only after a successful response", async () => {
    const user = userEvent.setup();
    vi.mocked(api.photos).mockRejectedValueOnce(new Error("Server unavailable")).mockResolvedValueOnce({ items: [], nextBeforeDate: null });
    render(<PhotosPage today="2026-10-31" onChooseDay={vi.fn()} />);

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
    render(<PhotosPage today="2026-10-31" onChooseDay={vi.fn()} />);

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
    render(<PhotosPage today="2026-10-31" onChooseDay={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Load older photos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Page unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "2026-10-24" })).toBeInTheDocument();
    expect(api.photos).toHaveBeenLastCalledWith({ beforeDate: "2026-10-24" });
  });
});


it("uploads today's photos through the existing daily-photo dialog and refreshes the gallery", async () => {
  const user = userEvent.setup();
  const today = "2026-10-31";
  const photo = { id: 7, date: today, displayOrder: 1, width: 20, height: 20, createdAt: "", thumbnailUrl: "/thumb/7", url: "/photo/7" };
  vi.mocked(api.photos).mockResolvedValueOnce({ items: [], nextBeforeDate: null }).mockResolvedValue({ items: [{ date: today, photos: [photo] }], nextBeforeDate: null });
  vi.mocked(api.dayPhotos).mockResolvedValue([]);
  vi.mocked(api.uploadPhotos).mockResolvedValue([photo]);
  render(<PhotosPage today={today} onChooseDay={vi.fn()} />);
  await screen.findByText("No daily photos yet.");
  await user.click(screen.getByRole("button", { name: "Add photos for today" }));
  expect(await screen.findByRole("dialog", { name: "Daily photos" })).toBeInTheDocument();
  expect(api.dayPhotos).toHaveBeenCalledWith(today, expect.any(AbortSignal));
  const file = new File(["photo"], "today.png", { type: "image/png" });
  await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);
  await waitFor(() => expect(api.uploadPhotos).toHaveBeenCalledWith(today, [file]));
  await screen.findByRole("button", { name: today });
  await user.click(screen.getByRole("button", { name: "Close Daily photos" }));
  expect(screen.getByRole("img", { name: `Photo from ${today}` })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Add photos for today" }));
  expect(await screen.findByRole("dialog", { name: "Daily photos" })).toBeInTheDocument();
});

it("shows upload failures without closing the dialog or changing the gallery", async () => {
  const user = userEvent.setup();
  vi.mocked(api.photos).mockResolvedValue({ items: [], nextBeforeDate: null });
  vi.mocked(api.dayPhotos).mockResolvedValue([]);
  vi.mocked(api.uploadPhotos).mockRejectedValue(new Error("Invalid photo"));
  render(<PhotosPage today="2026-10-31" onChooseDay={vi.fn()} />);
  await screen.findByText("No daily photos yet.");
  await user.click(screen.getByRole("button", { name: "Add photos for today" }));
  await screen.findByRole("dialog", { name: "Daily photos" });
  await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["photo"], "today.png", { type: "image/png" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid photo");
  expect(screen.getByRole("dialog", { name: "Daily photos" })).toBeInTheDocument();
  expect(screen.getByText("No daily photos yet.")).toBeInTheDocument();
  expect(api.photos).toHaveBeenCalledTimes(1);
});
