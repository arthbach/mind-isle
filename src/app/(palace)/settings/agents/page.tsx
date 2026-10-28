import { SourceCard, type SourceView } from '@/components/SessionsUI';
import { config } from '@/lib/config';
import { sourceStatus } from '@/lib/sessions/manage';
import { obsidianLink } from '@/lib/game';
import { readSettings, SETTINGS_NOTE } from '@/lib/settings';

export default async function AgentSettingsPage() {
  const [status, settings] = await Promise.all([sourceStatus(), readSettings()]);
  const sources: SourceView[] = status.map((s) => ({ ...s, enabled: !!settings.sources[s.source] }));
  return (
    <div className="stack">
      <p className="sub" style={{ margin: 0 }}>
        Mind Isle can show your Orca, Claude Code and Codex sessions on the island: a pin on the project’s building for every running session.
        It reads only metadata: which folder, when, which branch, the agent’s own title, which tool ran. It never stores your prompts or code.
        Nothing is read until you allow a source.
      </p>
      <div className="src-grid">
        {sources.map((s) => <SourceCard key={s.source} s={s} readOnly={config.readOnly} />)}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {settings.savedIn === 'vault' && !settings.noteExists ? (
          <>Your choices will be saved in your vault, in <code>{SETTINGS_NOTE}</code>, the next time you change one.</>
        ) : settings.savedIn === 'vault' ? (
          <>Your choices are saved in your vault, in <a href={obsidianLink(config.vaultName, SETTINGS_NOTE)}>{SETTINGS_NOTE}</a>. You can read and change them there too.</>
        ) : (
          <>Read-only mode: sources can’t be changed here. They’re read from <code>{SETTINGS_NOTE}</code> in your vault.</>
        )}
      </p>
    </div>
  );
}
