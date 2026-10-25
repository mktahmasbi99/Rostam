import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { MeasurementsPage } from "./MeasurementsPage";

vi.mock("../lib/api", () => ({
  api: {
    profile: vi.fn(), bodyMeasurements: vi.fn(), createBodyMeasurement: vi.fn(),
    updateBodyMeasurement: vi.fn(), updateProfile: vi.fn(), deleteBodyMeasurement: vi.fn(),
  },
}));

const record = {
  id: 1, date: "2026-10-24", weightKg: "123456789.123", waistCm: "102.5",
  measurementType: "weight" as const, createdAt: "2026-10-24T12:00:00Z", updatedAt: "2026-10-24T12:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.profile).mockResolvedValue({ heightCm: "180", dateOfBirth: null, age: null });
  vi.mocked(api.bodyMeasurements).mockResolvedValue([record]);
});

describe("MeasurementsPage layout content", () => {
  it("renders long values and opens a complete measurement edit form", async () => {
    const user = userEvent.setup();
    render(<MeasurementsPage today="2026-10-25" />);

    expect(await screen.findByText("123456789.123 kg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit measurement from 2026-10-24" }));
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-24");
    expect(screen.getByLabelText(/Weight/)).toHaveValue("123456789.123");
    expect(screen.getByLabelText(/Waist/)).toHaveValue("102.5");
  });
});
