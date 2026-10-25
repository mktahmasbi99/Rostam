import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { MeasurementsPage } from "./MeasurementsPage";

vi.mock("../lib/api", () => ({
  api: {
    profile: vi.fn(), bodyMeasurements: vi.fn(), createBodyMeasurement: vi.fn(),
    updateBodyMeasurement: vi.fn(), updateProfile: vi.fn(), deleteBodyMeasurement: vi.fn(), bodyMeasurementTrends: vi.fn(),
  },
}));

const record = {
  id: 1, date: "2026-10-24", weightKg: "123456789.123", waistCm: "102.5",
  measurementType: "weight" as const, createdAt: "2026-10-24T12:00:00Z", updatedAt: "2026-10-24T12:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.profile).mockResolvedValue({ heightCm: "180", dateOfBirth: null, age: null });
  vi.mocked(api.bodyMeasurements).mockResolvedValue({ items: [record], nextBeforeDate: null, nextBeforeId: null });
  vi.mocked(api.bodyMeasurementTrends).mockResolvedValue({ latest: { weight: { date: record.date, value: record.weightKg }, waist: { date: record.date, value: record.waistCm } }, trends: { weight: [{ date: record.date, value: record.weightKg }], waist: [{ date: record.date, value: record.waistCm }] } });
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

  it("keeps trends based on the full range while loading older history on demand", async () => {
    const user = userEvent.setup();
    vi.mocked(api.bodyMeasurements)
      .mockResolvedValueOnce({ items: [record], nextBeforeDate: "2026-10-23", nextBeforeId: 4 })
      .mockResolvedValueOnce({ items: [{ ...record, id: 4, date: "2026-10-23" }], nextBeforeDate: null, nextBeforeId: null });
    render(<MeasurementsPage today="2026-10-25" />);

    expect(await screen.findByText("123456789.123 kg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load older measurements" }));
    expect(await screen.findByRole("button", { name: "Edit measurement from 2026-10-23" })).toBeInTheDocument();
    expect(api.bodyMeasurements).toHaveBeenLastCalledWith({ beforeDate: "2026-10-23", beforeId: 4 });
    expect(api.bodyMeasurementTrends).toHaveBeenCalledTimes(1);
  });
});
