import Link from 'next/link';
import { ConfirmAll, FolderRow } from '@/components/SessionsUI';
import { config } from '@/lib/config';
import { projectRefs, scanFolders } from '@/lib/sessions';
import { sourceStatus } from '@/lib/sessions/manage';
import { readSessionStore } from '@/lib/sessions/store';

export default async function SessionsPage() {
  const [status, store, projects] = await Promise.all([sourceStatus(), readSessionStore(), projectRefs()]);
  const anyEnabled = status.some((s) => store.sources[s.source] && s.roots.length);
  const folders = anyEnabled ? await scanFolders() : [];
  const open = folders.filter((f) => f.mapping.kind === 'ask' || f.mapping.kind === 'harbor');
  const auto = folders.filter((f) => f.mapping.kind === 'auto');
  const done = folders.filter((f) => f.mapping.kind === 'confirmed' || f.mapping.kind === 'ignored');
  const choices = projects.map((p) => ({ rel: p.rel, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack">
      {!anyEnabled && (
        <div className="panel card">
          <h2>Agent sessions</h2>
          <p className="sub">No agent app is connected yet. Allow Orca, Claude Code or Codex first; then their folders show up here to be placed on the island.</p>
          <Link className="btn primary" href="/settings/agents">Open Settings → Agents</Link>
        </div>
      )}

      {anyEnabled && (
        <div className="panel card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2>Which project is each folder?</h2>
              <p className="sub" style={{ marginBottom: 0 }}>
                Folders with sessions in the last 90 days. Confident matches are placed automatically; anything else waits for you.
                Saving writes the folder into the project note’s <code>repos:</code>, so the next session lands there by itself.
              </p>
            </div>
            {!config.readOnly && <ConfirmAll count={auto.length} />}
          </div>
          {folders.length === 0 && <div className="empty" style={{ marginTop: 12 }}>No sessions in the last 90 days from the sources you allowed.</div>}
          {[['Needs you', open], ['Placed automatically', auto], ['Done', done]].map(([title, list]) =>
            (list as typeof folders).length ? (
              <section key={title as string} style={{ marginTop: 14 }}>
                <h3 style={{ marginBottom: 8 }}>{title as string} <span className="tiny muted">{(list as typeof folders).length}</span></h3>
                <ul className="list">
                  {(list as typeof folders).map((f) => <FolderRow key={f.cwd} f={f} projects={choices} readOnly={config.readOnly} />)}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
