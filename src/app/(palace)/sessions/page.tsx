import Link from 'next/link';
import { ConfirmAll, FolderRow } from '@/components/SessionsUI';
import { config } from '@/lib/config';
import { projectRefs, scanFolders } from '@/lib/sessions';
import { sourceStatus } from '@/lib/sessions/manage';
import { SummaryControls } from '@/components/SummariesUI';
import { obsidianLink } from '@/lib/game';
import { sessionHistory, syncingRecords, syncRecordsSoon } from '@/lib/sessions/records';
import { summaryViews, type SessionSummaryView } from '@/lib/summaries';
import { AGENT_LABEL } from '@/lib/sessions/types';
import { readSettings } from '@/lib/settings';

export default async function SessionsPage() {
  const [status, settings, projects] = await Promise.all([sourceStatus(), readSettings(), projectRefs()]);
  const anyEnabled = status.some((s) => settings.sources[s.source] && s.roots.length);
  const folders = anyEnabled ? await scanFolders() : [];
  // Catch up on new sessions (cheap: logs are read from where the last sync stopped), but never hold the page
  // for long: a first backfill finishes in the background.
  if (anyEnabled) await Promise.race([syncRecordsSoon(true), new Promise((r) => setTimeout(r, 2000))]);
  const syncing = syncingRecords();
  const history = anyEnabled ? await summaryViews(await sessionHistory(7)) : [];
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

      {anyEnabled && <History items={history} syncing={syncing} summaries={{ since: settings.summaries.since, mode: settings.summaries.default }} />}
    </div>
  );
}

const dayOf = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: config.timeZone });
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const clock = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: config.timeZone });
const minutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

/** What the agents did this week, from the session records. Metadata only. */
function History({ items, syncing, summaries }: { items: SessionSummaryView[]; syncing: boolean; summaries: { since: string | null; mode: string } }) {
  const days = new Map<string, SessionSummaryView[]>();
  for (const it of items) days.set(dayOf(it.lastEventAt), [...(days.get(dayOf(it.lastEventAt)) ?? []), it]);
  return (
    <div className="panel card">
      <h2>History</h2>
      <p className="sub">
        Every session from the last 7 days. Mind Isle keeps a small record of each one (times, files touched, the agent’s own title),
        never your prompts or code, so this stays after the agent deletes its own logs.
      </p>
      <p className="tiny hist-status">
        {config.readOnly ? <>📜 Summaries can’t be written in read-only mode.</>
          : !summaries.since ? <>📜 Summaries are off. <Link href="/settings/summaries">Turn them on</Link> to write a note about finished sessions.</>
          : summaries.mode === 'off' ? <>📜 Summaries are set to Never. <Link href="/settings/summaries">Change</Link></>
          : <>📜 Summaries are on{summaries.mode === 'auto' ? ', automatic' : ''}. A session can be summarised once it’s been quiet for 2 hours; it then shows {summaries.mode === 'auto' ? 'its note' : <b>Summarise</b>} here.</>}
      </p>
      {syncing && <p className="tiny muted">Still reading past sessions. Reload in a minute to see them all.</p>}
      {items.length === 0 && !syncing && <div className="empty">No sessions recorded in the last 7 days.</div>}
      {[...days.entries()].map(([day, list]) => (
        <section key={day} className="hist-day">
          <h3>{dayLabel(day)} <span className="tiny muted">{list.length} session{list.length === 1 ? '' : 's'} · {minutes(list.reduce((n, x) => n + x.activeMin, 0))} active</span></h3>
          <ul className="hist">
            {list.map((it) => (
              <li key={it.id}>
                <span className="hist-time">{it.startedAt && clock(it.startedAt) !== clock(it.lastEventAt) && <>{clock(it.startedAt)}<br /></>}<span className="muted">→ </span>{clock(it.lastEventAt)}</span>
                <span className="hist-main">
                  <b>{it.project?.name ?? it.cwdShort}</b>
                  <span className="tiny muted">
                    {AGENT_LABEL[it.agent]} · {minutes(it.activeMin)} active
                    {it.files.length > 0 && ` · ${it.files.length} file${it.files.length === 1 ? '' : 's'}`}
                    {it.title && ` · ${it.title}`}
                  </span>
                  {it.files.length > 0 && <span className="tiny hist-files" title={it.files.join('\n')}>{it.files.slice(0, 3).join(', ')}{it.files.length > 3 ? ` +${it.files.length - 3}` : ''}</span>}
                </span>
                <span className="hist-sum">
                  <SummaryControls id={it.id} status={it.status} error={it.job?.error ?? null} readOnly={config.readOnly}
                    noteHref={it.job?.note ? obsidianLink(config.vaultName, it.job.note) : null} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
