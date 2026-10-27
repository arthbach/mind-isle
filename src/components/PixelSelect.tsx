'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export interface PixelOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  swatch?: string;
}

/** A dropdown in the island's pixel style (the native <select> can't be styled to match). Keyboard and screen-reader friendly. */
export function PixelSelect<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: PixelOption<T>[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  // The list floats over the page (fixed), so a scrolling window around it can't clip it.
  // It opens below the button, or above when there's more room there, and stays inside the screen.
  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) return;
    const b = button.current.getBoundingClientRect();
    const w = Math.min(list.current.offsetWidth, window.innerWidth - 16);
    const below = window.innerHeight - b.bottom - 14, above = b.top - 14;
    const up = below < 200 && above > below;
    const px = (n: number) => `${n}px`;
    Object.assign(list.current.style, {
      left: px(Math.max(8, Math.min(b.left, window.innerWidth - w - 8))),
      top: up ? '' : px(b.bottom + 6),
      bottom: up ? px(window.innerHeight - b.top + 6) : '',
      maxHeight: px(Math.min(320, up ? above : below)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    // A fixed list would drift away from its button: scrolling or resizing closes it.
    const away = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    list.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [open]);

  const show = () => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); };
  const pick = (i: number) => { onChange(options[i].value); setOpen(false); button.current?.focus(); };

  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => Math.min(last, a + 1)),
      ArrowUp: () => setActive((a) => Math.max(0, a - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => pick(active),
      ' ': () => pick(active),
      Escape: () => { setOpen(false); button.current?.focus(); },
      Tab: () => setOpen(false),
    };
    if (keys[e.key]) { if (e.key !== 'Tab') e.preventDefault(); keys[e.key](); }
  };

  return (
    <div className="psel" ref={root}>
      <button
        ref={button}
        type="button"
        className="psel-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(); } }}
      >
        <span className="psel-label">{label}</span>
        {current.swatch && <span className="sw" style={{ background: current.swatch }} />}
        <span>{current.label}</span>
        <span aria-hidden="true" className="psel-caret">▾</span>
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="psel-list"
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`psel-opt${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              {o.swatch && <span className="sw" style={{ background: o.swatch }} />}
              <span>{o.label}{o.hint && <span className="psel-hint"> · {o.hint}</span>}</span>
              {o.value === value && <span aria-hidden="true" className="psel-check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
