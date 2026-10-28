import { RetryButton, SummarySettings } from '@/components/SummariesUI';
import { config } from '@/lib/config';
import { obsidianLink } from '@/lib/game';
import { readSettings, SETTINGS_NOTE, summaryModel } from '@/lib/settings';
import { readJobs } from '@/lib/summaries';
import { findCli } from '@/lib/summaries/summarise';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: config.timeZone });

export default async function SummarySettingsPage() {
  const [settings, jobs, claude, codex] = await Promise.all([readSettings(), readJobs(), findCli('claude'), findCli('codex')]);
  const s = settings.summaries;
  const failed = [...jobs.values()].filter((j) => j.status === 'failed').sort((a, b) => b.updatedAt - a.updatedAt);
  const done = [...jobs.values()].filter((j) => j.status === 'done').length;
  return (
    <div className="stack">
      <p className="sub" style={{ margin: 0 }}>
        When an agent session ends, Mind Isle can write a short note about it into your vault: what was done, decisions, and follow-ups
        (they show up on the quest board). Before the transcript leaves Mind Isle, keys, passwords, tokens, <code>.env</code> values,
        emails and phone numbers are removed on this computer.
      </p>
      {s.since ? (
        <p className="tiny" style={{ margin: 0 }}>
          <b>On since {when(s.since)}.</b> Sessions that ended before then are left alone. {done} note{done === 1 ? '' : 's'} written so far, into <code>{s.sessionsDir}/</code>.
        </p>
      ) : (
        <p className="tiny" style={{ margin: 0 }}><b>Off.</b> Nothing is summarised until you turn this on, and nothing from before that moment ever is.</p>
      )}
      <SummarySettings mode={s.default} cli={s.cli} started={!!s.since} found={{ claude: !!claude, codex: !!codex }} readOnly={config.readOnly} />
      <p className="tiny muted" style={{ margin: 0 }}>
        Model: <code>{summaryModel(s) ?? 'the CLI’s default'}</code> · notes folder: <code>{s.sessionsDir}/</code> · words to always remove: {settings.redaction.patterns.length || 'none'}.
        Change these in <a href={obsidianLink(config.vaultName, SETTINGS_NOTE)}>{SETTINGS_NOTE}</a>.
      </p>
      {failed.length > 0 && (
        <section>
          <h3 style={{ marginBottom: 8 }}>Failed <span className="tiny muted">{failed.length}</span></h3>
          <ul className="list">
            {failed.map((j) => (
              <li key={j.id} className="item row" style={{ justifyContent: 'space-between' }}>
                <span className="tiny" style={{ flex: 1, minWidth: 0 }}>{j.error}</span>
                {!config.readOnly && <RetryButton id={j.id} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
