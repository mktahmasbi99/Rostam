import { useId, useLayoutEffect, useRef, useState } from "react";

export function ActivityNotePreview({ note }: { note: string }) {
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const bodyId = useId();
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(body).lineHeight);
      setHasMore(body.scrollHeight > lineHeight * 3 + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [note]);

  return <div className="activity-note-preview">
    <p
      ref={bodyRef}
      id={bodyId}
      className={`activity-note-body${expanded ? "" : " is-collapsed"}${hasMore && !expanded ? " can-expand" : ""}`}
      onClick={hasMore && !expanded ? () => setExpanded(true) : undefined}
    >{note}</p>
    {hasMore && <button
      type="button"
      className="activity-note-toggle"
      aria-expanded={expanded}
      aria-controls={bodyId}
      onClick={() => setExpanded(!expanded)}
    >{expanded ? "Show less" : "Show more"}</button>}
  </div>;
}
