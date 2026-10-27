'use client';

export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const current = root.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('mp-theme', next); } catch { /* private mode */ }
  };
  return (
    <button className="btn" onClick={toggle} aria-label="Toggle day and night">
      ☀︎ / ☾
    </button>
  );
}
