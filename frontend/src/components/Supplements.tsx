import { OfflineBrowsingContext } from "./dialogContext";
import { ChevronRight, File, FileText, NotebookPen, Pencil, Plus } from "lucide-react";
import { useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { SupplementCard, SupplementHistory, SupplementIntake, SupplementProduct } from "../lib/types";
import { workoutLocalTime } from "../lib/workoutTime";
import { Modal } from "./Modal";
import { ReadState } from "./ReadState";
import { SupplementForm, SupplementIntakeForm, SupplementNoteForm, SupplementProductForm, SupplementRatingForm, SupplementStockForm } from "./SupplementForms";

interface DayContext {
  day: string;
  today: string;
  timezone: string;
  onChanged: () => void;
}

function useSupplementRead<T>(read: (signal: AbortSignal) => Promise<T>) {
  const browsingOffline = useContext(OfflineBrowsingContext);
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setData(result);
      setError("");
    }).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load supplements.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [browsingOffline, read, revision]);

  function reload() {
    setLoading(true);
    setError("");
    setRevision((previous) => previous + 1);
  }
  const status = <ReadState loading={loading} error={error} hasData={data !== undefined} onRetry={reload} />;
  return { data, reload, status, loading, error };
}

function productLabel(product: SupplementProduct) {
  return [product.brand, `${product.amountPerUnit} ${product.amountUnit} per intake unit`].filter(Boolean).join(" · ");
}

export function Supplements({ cards, ...context }: DayContext & { cards: SupplementCard[] }) {
  const browsingOffline = useContext(OfflineBrowsingContext);
  const [selected, setSelected] = useState<{ card: SupplementCard; view: "details" | "intake" | "note" } | null>(null);

  function saved() {
    setSelected(null);
    context.onChanged();
  }

  return <>
    {cards.length > 0 && <section className="supplement-section" aria-label="Supplements">
      {cards.map((card) => <article className="supplement-card" key={card.id}>
        <button className="supplement-card-open" onClick={() => setSelected({ card, view: "details" })} aria-label={`View ${card.name} details`} />
        <div className="supplement-card-heading">
          <div className="supplement-name">
            <strong>{card.name}</strong><ChevronRight aria-hidden="true" />
          </div>
          <div className="journal-actions">
            <button aria-label={`Open ${card.name} note${card.note ? " (saved)" : ""}`} title="Open supplement note"
              className={card.note ? "journal-active" : ""} onClick={() => setSelected({ card, view: "note" })}>
              {card.note ? <FileText /> : <File />}
            </button>
          </div>
          <button className="icon-button" disabled={browsingOffline} aria-label={`Log ${card.name} intake`} title="Log intake" onClick={() => setSelected({ card, view: "intake" })}><Plus /></button>
        </div>
        <small>{productLabel(card)}{card.archived && " · Archived"}</small>
        <div className="supplement-card-total">
          <strong>{card.quantity}{card.dailyTarget && ` / ${card.dailyTarget}`} {card.unit}</strong>
          {card.due && <span className="supplement-due">Due</span>}
        </div>
        {card.quantity !== "0" && <small>{card.amount} {card.amountUnit}</small>}
      </article>)}
    </section>}
    {selected?.view === "details" && <SupplementDetails {...context} product={selected.card} onClose={() => setSelected(null)} />}
    {selected?.view === "intake" && <SupplementIntakeForm {...context} product={selected.card} onClose={() => setSelected(null)} onSaved={saved} />}
    {selected?.view === "note" && browsingOffline && <Modal title={`${selected.card.name} note`} onClose={() => setSelected(null)}><p className="exercise-note-body">{selected.card.note || "No note saved for this day."}</p></Modal>}
    {selected?.view === "note" && !browsingOffline && <SupplementNoteForm product={selected.card} date={context.day} body={selected.card.note ?? ""} onClose={() => setSelected(null)} onSaved={saved} />}
  </>;
}

export function SupplementLibrary({ onClose, ...context }: DayContext & { onClose: () => void }) {
  const browsingOffline = useContext(OfflineBrowsingContext);
  const { data, reload, status } = useSupplementRead(api.supplements);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<SupplementProduct | null>(null);
  function changed() {
    reload();
    context.onChanged();
  }
  return <Modal title="Supplement library" onClose={onClose}>
    <div className="supplement-stack">
      <button className="primary" disabled={browsingOffline} onClick={() => setAdding(true)}><Plus aria-hidden="true" />Add supplement</button>
      {status}
      {data?.length === 0 && <p>No supplements yet.</p>}
      {data?.map((product) => <button className="supplement-library-row" key={product.id} onClick={() => setSelected(product)}>
        <span>
          <strong>{product.name}</strong>
          <small>{productLabel(product)}</small>
          {product.archived && <small>Archived</small>}
        </span>
        <ChevronRight aria-hidden="true" />
      </button>)}
    </div>
    {adding && <SupplementProductForm today={context.today} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); changed(); }} />}
    {selected && <SupplementDetails {...context} product={selected} onClose={() => setSelected(null)} onChanged={changed} />}
  </Modal>;
}

type DetailEditor = { kind: "intake"; intake?: SupplementIntake } | { kind: "product" | "rating" | "stock" | "restore" };

function SupplementDetails({ product: initialProduct, onClose, ...context }: DayContext & {
  product: SupplementProduct;
  onClose: () => void;
}) {
  const browsingOffline = useContext(OfflineBrowsingContext);
  const read = useCallback((signal: AbortSignal) => api.supplement(initialProduct.id, signal), [initialProduct.id]);
  const { data, reload, status, loading, error } = useSupplementRead(read);
  const [editor, setEditor] = useState<DetailEditor | null>(null);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const product = data?.product ?? initialProduct;
  const blocked = loading || Boolean(error);

  function changed() {
    reload();
    context.onChanged();
  }
  const actions = {
    onClose: () => setEditor(null),
    onSaved: () => { setEditor(null); changed(); },
  };
  return <Modal title={product.name} onClose={onClose} wide groupHeaderActionWithClose
    headerAction={<>
      <button className="icon-button" title="Supplement notebook" aria-label="Open supplement notebook" disabled={!data || blocked} onClick={() => setNotebookOpen(true)}><NotebookPen /></button>
      <button className="icon-button" title="Edit product" aria-label="Edit product" disabled={browsingOffline || !data || blocked} onClick={() => setEditor({ kind: "product" })}><Pencil /></button>
    </>}>
    {status}
    {data && <div className="supplement-stack">
      <p className="supplement-product-label">{productLabel(product)}{product.archived && " · Archived"}</p>
      <div className="supplement-actions">
        <button className="primary" disabled={browsingOffline || blocked} onClick={() => setEditor({ kind: "intake" })}><Plus aria-hidden="true" />Log intake</button>
        {product.archived && <button disabled={browsingOffline || blocked} onClick={() => setEditor({ kind: "restore" })}>Restore supplement</button>}
      </div>
      <div className="supplement-card-heading">
        <p>Rating · {product.rating === null ? "Unrated" : `${product.rating} / 5 stars`}</p>
        <button className="supplement-edit-rating" disabled={browsingOffline || blocked} onClick={() => setEditor({ kind: "rating" })}>Edit rating</button>
      </div>
      <section className="supplement-card supplement-stock" aria-label="Stock">
        <div className="supplement-card-heading">
          <h3>Stock</h3>
          <button disabled={browsingOffline || blocked} onClick={() => setEditor({ kind: "stock" })}>{data.stock ? "Reset stock" : "Track stock"}</button>
        </div>
        {data.stock ? <>
          <strong>{data.stock.balance} {product.unit} remaining</strong>
          {data.stock.balance.startsWith("-") && <p className="error" role="status">Negative balance. Reconcile stock.</p>}
          <small>Starting balance {data.stock.startingBalance} {product.unit} · {workoutLocalTime(data.stock.effectiveAt, context.timezone).replace("T", " ")}</small>
          {data.stock.packageSize && <small>Package size {data.stock.packageSize} {product.unit}</small>}
          {data.stock.expiryDate && <small>Expires {data.stock.expiryDate}</small>}
        </> : <p>Stock tracking is off.</p>}
      </section>
      <SupplementChart chart={data.chart} amountUnit={product.amountUnit} />
      <section className="supplement-stack" aria-label="Intake history">
        <h3>Intake history</h3>
        <small>Days without entries have no intake logged.</small>
        {data.days.length === 0 && <p>No intake logged.</p>}
        {data.days.map((day) => <section className="history-session" key={day.date}>
          <header className="history-session-header">
            <time dateTime={day.date}>{day.date}</time>
            <strong>{day.quantity} {product.unit} · {day.amount} {product.amountUnit}</strong>
          </header>
          {day.intakes.map((entry) => {
            const time = workoutLocalTime(entry.takenAt, context.timezone).slice(11);
            return <div className="supplement-intake-row" key={entry.id}>
              <time dateTime={entry.takenAt}>{time}</time>
              <span>{entry.quantity} {product.unit} · {entry.amount} {product.amountUnit}</span>
              <button disabled={browsingOffline || blocked} onClick={() => setEditor({ kind: "intake", intake: entry })} aria-label={`Edit intake at ${time}`}>Edit</button>
            </div>;
          })}
        </section>)}
      </section>
    </div>}
    {editor?.kind === "intake" && <SupplementIntakeForm {...context} {...actions} product={product} intake={editor.intake} />}
    {editor?.kind === "product" && <SupplementProductForm {...actions} today={context.today} product={product} onDeleted={() => { onClose(); context.onChanged(); }} />}
    {editor?.kind === "rating" && <SupplementRatingForm {...actions} product={product} />}
    {editor?.kind === "stock" && data && <SupplementStockForm {...context} {...actions} product={product} stock={data.stock} />}
    {editor?.kind === "restore" && <SupplementForm {...actions} title="Restore supplement" saveLabel="Restore supplement" save={() => api.restoreSupplement(product.id)}>
      <p>Restore {product.name} to its schedule?</p>
    </SupplementForm>}
    {notebookOpen && data && <SupplementNotebook product={product} notes={data.notes} {...context} status={status} blocked={blocked} onClose={() => setNotebookOpen(false)} onChanged={changed} />}
  </Modal>;
}

function SupplementNotebook({ product, notes, day, today, status, blocked, onClose, onChanged }: DayContext & {
  product: SupplementProduct;
  notes: SupplementHistory["notes"];
  status: ReactNode;
  blocked: boolean;
  onClose: () => void;
}) {
  const browsingOffline = useContext(OfflineBrowsingContext);
  const [date, setDate] = useState(day);
  const [editing, setEditing] = useState<string | null>(null);
  return <Modal title={`${product.name} notebook`} onClose={onClose}>
    <div className="supplement-stack">
      <div className="supplement-note-date">
        <label>Note date<input type="date" max={today} value={date} required onChange={(event) => setDate(event.target.value)} /></label>
        <button disabled={browsingOffline || blocked || !date || date > today} onClick={() => setEditing(date)}>Open note</button>
      </div>
      {status}
      {notes.length === 0 && <p>No notes yet.</p>}
      {notes.map((note) => <article className="supplement-card" key={note.date}>
        <div className="supplement-card-heading">
          <time dateTime={note.date}>{note.date}</time>
          <button disabled={browsingOffline || blocked} aria-label={`Edit note for ${note.date}`} onClick={() => setEditing(note.date)}>Edit</button>
        </div>
        <p className="exercise-note-body">{note.body}</p>
      </article>)}
    </div>
    {editing && <SupplementNoteForm product={product} date={editing} body={notes.find((note) => note.date === editing)?.body ?? ""}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
  </Modal>;
}

function SupplementChart({ chart, amountUnit }: { chart: SupplementHistory["chart"]; amountUnit: string }) {
  const [range, setRange] = useState(7);
  const days = chart.slice(-range);
  const maximum = Math.max(0, ...days.map((day) => Number(day.amount)));
  return <figure className="supplement-card supplement-chart">
    <div className="supplement-card-heading">
      <h3>Daily intake <small>({amountUnit})</small></h3>
      <div className="supplement-chart-controls" aria-label="Chart range" role="group">
        {[7, 30].map((value) => <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{value} days</button>)}
      </div>
    </div>
    <ul className="supplement-bars" role="list" aria-label={`Recorded intake over ${range} days`}>
      {days.map((day) => <li key={day.date} aria-label={`${day.date}: ${day.amount} ${amountUnit}`} title={`${day.date}: ${day.amount} ${amountUnit}`}>
        <span style={{ height: `${maximum ? 100 * Number(day.amount) / maximum : 0}%` }} />
      </li>)}
    </ul>
    <figcaption><time>{days[0]?.date}</time><time>{days.at(-1)?.date}</time></figcaption>
  </figure>;
}
