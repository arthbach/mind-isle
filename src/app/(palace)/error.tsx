'use client';

export default function PalaceError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="panel card" style={{ maxWidth: 640, margin: '40px auto' }}>
      <h2>The island didn’t load</h2>
      <p className="small">{error.message}</p>
      <p className="tiny muted">Check that <code>VAULT_PATH</code> in <code>.env.local</code> points to your Obsidian vault, then restart the dev server.</p>
      <button className="btn primary" onClick={reset}>Try again</button>
    </div>
  );
}
