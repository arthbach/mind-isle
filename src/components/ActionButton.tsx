'use client';

import { useState, useTransition } from 'react';

/** A button that runs a server action and shows its error, if any. */
export function ActionButton({
  action, children, className = 'btn', pressed, disabled, title,
}: {
  action: () => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
  pressed?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className={className}
        aria-pressed={pressed}
        disabled={disabled || pending}
        title={title}
        onClick={() => start(async () => {
          setError(null);
          try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
        })}
      >
        {children}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </>
  );
}
