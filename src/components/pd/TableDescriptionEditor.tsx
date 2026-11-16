import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { TextArea } from "./form";

/** A focused overlay keeps long descriptions readable without resizing table rows. */
export function TableDescriptionEditor({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  const anchor = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const skipFocus = useRef(false);
  const selection = useRef({ start: 0, end: 0 });
  const [open, setOpen] = useState(false);
  const [bounds, setBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const field = anchor.current;
      const expanded = editor.current;
      if (!field || !expanded) return;
      const rect = field.getBoundingClientRect();
      const gutter = 16;
      const width = Math.min(Math.max(rect.width, 360), window.innerWidth - gutter * 2);
      const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter));
      expanded.style.width = `${width}px`;
      expanded.style.height = "0px";
      const height = Math.min(Math.max(expanded.scrollHeight + 2, rect.height), 320, window.innerHeight - gutter * 2);
      const top = Math.max(gutter, Math.min(rect.top, window.innerHeight - height - gutter));
      expanded.style.height = `${height}px`;
      setBounds({ left, top, width, height });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open || !editor.current) return;
    editor.current.focus({ preventScroll: true });
    editor.current.setSelectionRange(selection.current.start, selection.current.end);
  }, [open]);

  const fieldClass = cn(className, "block h-[59px]! min-h-0! resize-none! overflow-hidden py-[3px]! font-medium leading-[17px]!", !value && "border-destructive/60");
  return <>
    <TextArea ref={anchor} rows={3} aria-label="Description" title={value} className={fieldClass} value={value} placeholder="Add a description"
      onChange={(event) => onChange(event.target.value)}
      onFocus={(event) => {
        if (skipFocus.current) { skipFocus.current = false; return; }
        selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
        setOpen(true);
      }} />
    {open && createPortal(<TextArea ref={editor} aria-label="Edit full description" value={value} placeholder="Add a description"
      className="fixed z-50 min-h-0! resize-none! overflow-y-auto border-primary/60 bg-surface px-1.5 py-[3px]! text-[12.5px] font-medium leading-[17px]! shadow-md"
      style={bounds}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          skipFocus.current = true;
          setOpen(false);
          anchor.current?.focus({ preventScroll: true });
        } else if (event.key === "Tab") {
          const field = anchor.current;
          const table = field?.closest("table");
          if (!field || !table) return;
          const controls = Array.from(table.querySelectorAll<HTMLElement>('input:not(:disabled), textarea:not(:disabled), button:not(:disabled), select:not(:disabled), [tabindex="0"]'));
          const next = controls[controls.indexOf(field) + (event.shiftKey ? -1 : 1)];
          if (next) {
            event.preventDefault();
            setOpen(false);
            next.focus();
          }
        }
      }} />, document.body)}
  </>;
}