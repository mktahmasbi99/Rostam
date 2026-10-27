import { useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { Ref } from "react";
import { formatDurationDigits } from "../lib/duration";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggested: boolean;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  invalid?: boolean;
}

export function DurationInput({ label, value, onChange, suggested, inputRef, autoFocus, invalid }: Props) {
  const element = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(inputRef, () => element.current!, []);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null) {
      element.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);

  function update(text: string, position: number) {
    const digitsToRight = text.slice(position).replace(/\D/g, "").length;
    const formatted = formatDurationDigits(text.replace(/\D/g, ""));
    let nextPosition = formatted.length;
    let remaining = digitsToRight;
    while (nextPosition > 0 && remaining > 0) {
      nextPosition--;
      if (/\d/.test(formatted[nextPosition])) remaining--;
    }
    caret.current = nextPosition;
    onChange(formatted);
  }

  return <input
    ref={element}
    aria-label={label} aria-invalid={invalid || undefined}
    className={`duration-input${suggested ? " suggested-value" : ""}`}
    inputMode="numeric" type="text" placeholder="mm:ss" value={value} autoFocus={autoFocus}
    onFocus={(event) => { if (suggested) event.currentTarget.select(); }}
    onClick={(event) => { if (suggested) event.currentTarget.select(); }}
    onChange={(event) => {
      const inputType = (event.nativeEvent as InputEvent).inputType;
      if (inputType?.startsWith("delete") && !/[1-9]/.test(event.target.value)) { caret.current = 0; onChange(""); }
      else update(event.target.value, event.target.selectionStart ?? event.target.value.length);
    }}
    onPaste={(event) => {
      const text = event.clipboardData.getData("text").trim();
      if (!/^\d+(?::\d{1,2})?$/.test(text)) { event.preventDefault(); return; }
      event.preventDefault();
      const parts = text.split(":");
      const pasted = parts.length === 2 ? `${parts[0]}${parts[1].padStart(2, "0")}` : text;
      const input = event.currentTarget;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? value.length;
      const next = value.slice(0, start) + pasted + value.slice(end);
      update(next, start + pasted.length);
    }}
    onKeyDown={(event) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      event.preventDefault();
      const input = event.currentTarget;
      let start = input.selectionStart ?? 0;
      let end = input.selectionEnd ?? start;
      if (start === end) {
        if (event.key === "Backspace") { while (start > 0 && value[start - 1] === ":") start--; start = Math.max(0, start - 1); }
        else { while (end < value.length && value[end] === ":") end++; end = Math.min(value.length, end + 1); }
      }
      const next = value.slice(0, start) + value.slice(end);
      // Removing the final significant digit clears the field, rather than restoring padding.
      if (!/[1-9]/.test(next)) { caret.current = 0; onChange(""); }
      else update(next, start);
    }}
  />;
}
