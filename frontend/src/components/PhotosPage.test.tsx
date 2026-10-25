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
    vi.mocked(api.photos).mockRejectedValueOnce(new Error("Server unavailable")).mockResolvedValueOnce([]);
    render(<PhotosPage onChooseDay={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading photos");
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No daily photos yet.")).toBeInTheDocument();
    expect(api.photos).toHaveBeenCalledTimes(2);
  });
});
