import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { SupplementHistory, SupplementIntake, SupplementProduct } from "../lib/types";
import { workoutLocalTime } from "../lib/workoutTime";
import { Modal } from "./Modal";

export interface SupplementEditorActions {
  onClose: () => void;
  onSaved: () => void;
}

export function SupplementForm({ title, saveLabel, onClose, onSaved, save, children, remove }: SupplementEditorActions & {
  title: string;
  saveLabel: string;
  save: (fields: FormData) => Promise<unknown>;
  children?: ReactNode;
  remove?: { label: string; confirm: string; action: () => Promise<void> };
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function closeConfirmation() {
    if (saving) return;
    setConfirmingDelete(false);
    setError("");
  }

  async function submit(action: () => Promise<unknown>) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await action();
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the supplement change.");
      setSaving(false);
    }
  }

  return <Modal title={title} onClose={() => { if (!saving) onClose(); }}>
    <form className="supplement-form" data-update-dirty-label={title} onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      void submit(() => save(fields));
    }}>
      <fieldset className="supplement-fields" disabled={saving}>
        {children}
        {error && !confirmingDelete && <p className="error" role="alert">{error}</p>}
        <div className="supplement-actions">
          {remove && <button type="button" className="danger" onClick={() => {
            setError("");
            setConfirmingDelete(true);
          }}>{remove.label}</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary">{saving ? "Saving…" : saveLabel}</button>
        </div>
      </fieldset>
    </form>
    {confirmingDelete && remove && <Modal title={`${remove.label}?`} onClose={closeConfirmation}>
      <div className="stack">
        <p>{remove.confirm} This cannot be undone.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="secondary" disabled={saving} onClick={closeConfirmation}>Cancel</button>
          <button className="danger-button" disabled={saving} onClick={() => void submit(remove.action)}>
            {saving ? "Deleting…" : remove.label}
          </button>
        </div>
      </div>
    </Modal>}
  </Modal>;
}

function field(fields: FormData, key: string): string {
  return String(fields.get(key) ?? "").trim();
}

const intakeUnits = [
  { value: "capsules", label: "Capsules" },
  { value: "tablets", label: "Tablets" },
  { value: "scoops", label: "Scoops" },
  { value: "drops", label: "Drops" },
  { value: "droppers", label: "Droppers" },
  { value: "units", label: "Other" },
];

export function SupplementProductForm({ product, today, ...actions }: SupplementEditorActions & {
  product?: SupplementProduct;
  today: string;
}) {
  return <SupplementForm title={product ? "Edit supplement" : "New supplement"} saveLabel="Save product" {...actions}
    save={(fields) => api.saveSupplement({
      name: field(fields, "name"), brand: field(fields, "brand"),
      unit: field(fields, "unit"), amountPerUnit: field(fields, "amountPerUnit"),
      amountUnit: field(fields, "amountUnit"), dailyTarget: field(fields, "dailyTarget") || null,
      intervalDays: Number(field(fields, "intervalDays")), startDate: field(fields, "startDate"),
    }, product?.id)}>
    <label>Name<input name="name" defaultValue={product?.name} maxLength={100} required /></label>
    <label>Brand<input name="brand" defaultValue={product?.brand} maxLength={100} /></label>
    <label>Intake unit
      <select name="unit" aria-label="Intake unit" defaultValue={product?.unit ?? ""} required>
        <option value="" disabled>Choose a unit</option>
        {intakeUnits.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        {product && !intakeUnits.some(({ value }) => value === product.unit) &&
          <option value={product.unit}>{product.unit}</option>}
      </select>
    </label>
    <div className="supplement-fields-pair">
      <label>Amount per unit<input name="amountPerUnit" inputMode="decimal" defaultValue={product?.amountPerUnit} maxLength={40} required /></label>
      <label>Measurement unit<input name="amountUnit" defaultValue={product?.amountUnit} placeholder="mg, IU…" maxLength={40} required /></label>
    </div>
    {product && <small>Label corrections update historical amounts. Add a separate product for a different brand, form, or strength.</small>}
    <label>Daily target (optional)<input name="dailyTarget" inputMode="decimal" placeholder="Enter number of units" defaultValue={product?.dailyTarget ?? ""} maxLength={40} /></label>
    <div className="supplement-fields-pair">
      <label>Repeat every (days)<input type="number" name="intervalDays" min={1} max={3652058} step={1} defaultValue={product?.intervalDays ?? 1} required /></label>
      <label>Start date<input type="date" name="startDate" defaultValue={product?.startDate ?? today} required /></label>
    </div>
  </SupplementForm>;
}

export function SupplementRatingForm({ product, ...actions }: SupplementEditorActions & {
  product: SupplementProduct;
}) {
  return <SupplementForm title="Supplement rating" saveLabel="Save rating" {...actions}
    save={(fields) => api.rateSupplement(product.id, Number(field(fields, "rating")) || null)}>
    <label>Rating
      <select name="rating" aria-label="Rating" defaultValue={product.rating ?? ""}>
        <option value="">Unrated</option>
        {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} {rating === 1 ? "star" : "stars"}</option>)}
      </select>
    </label>
  </SupplementForm>;
}

export function SupplementIntakeForm({ product, intake, day, today, timezone, ...actions }: SupplementEditorActions & {
  product: SupplementProduct;
  intake?: SupplementIntake;
  day: string;
  today: string;
  timezone: string;
}) {
  const [instant] = useState(() => intake?.takenAt ?? new Date().toISOString());
  const initialTime = intake || day === today ? workoutLocalTime(instant, timezone) : `${day}T12:00`;
  return <SupplementForm title={intake ? `Edit ${product.name} intake` : `Log ${product.name} intake`}
    saveLabel={intake ? "Save correction" : "Save intake"} {...actions}
    remove={intake && { label: "Delete intake", confirm: "Delete this intake entry?", action: () => api.deleteSupplementIntake(product.id, intake.id) }}
    save={(fields) => {
      const value = field(fields, "takenAt");
      const takenAt = value === initialTime && (intake || day === today) ? instant : value;
      const payload = { takenAt, quantity: field(fields, "quantity") };
      return intake ? api.correctSupplementIntake(product.id, intake.id, payload) : api.logSupplementIntake(product.id, payload);
    }}>
    <label>Quantity ({product.unit})<input name="quantity" inputMode="decimal" maxLength={40} defaultValue={intake?.quantity ?? "1"} required /></label>
    <label>Date and time<input name="takenAt" type="datetime-local" defaultValue={initialTime} max={`${today}T23:59`} required /></label>
    <small>Time zone: {timezone}</small>
  </SupplementForm>;
}

export function SupplementStockForm({ product, stock, today, timezone, ...actions }: SupplementEditorActions & {
  product: SupplementProduct;
  stock: SupplementHistory["stock"];
  today: string;
  timezone: string;
}) {
  return <SupplementForm title={stock ? "Reset stock" : "Track stock"} saveLabel="Save balance" {...actions}
    save={(fields) => api.resetSupplementStock(product.id, {
      startingBalance: field(fields, "startingBalance"), effectiveAt: field(fields, "effectiveAt") || null,
      packageSize: field(fields, "packageSize") || null, expiryDate: field(fields, "expiryDate") || null,
    })}>
    <label>Starting balance ({product.unit})<input name="startingBalance" inputMode="decimal" maxLength={40} required /></label>
    <label>Effective date and time<input name="effectiveAt" type="datetime-local" max={`${today}T23:59`} /></label>
    <small>Leave the time blank to start now. Rostam deducts intake from that time onward ({timezone}).</small>
    <label>Package size ({product.unit}, optional)<input name="packageSize" inputMode="decimal" maxLength={40} defaultValue={stock?.packageSize ?? ""} /></label>
    <label>Expiry date (optional)<input name="expiryDate" type="date" /></label>
  </SupplementForm>;
}

export function SupplementNoteForm({ product, date, body, ...actions }: SupplementEditorActions & {
  product: SupplementProduct;
  date: string;
  body: string;
}) {
  const save = (value: string) => api.saveSupplementNote(product.id, date, value);
  return <SupplementForm title={`${product.name} note`} saveLabel="Save note" {...actions}
    save={(fields) => save(String(fields.get("body") ?? ""))}
    remove={body ? { label: "Delete note", confirm: "Delete this supplement note?", action: () => save("") } : undefined}>
    <time dateTime={date}>{date}</time>
    <label>Note<textarea name="body" rows={8} maxLength={20000} defaultValue={body} /></label>
  </SupplementForm>;
}
