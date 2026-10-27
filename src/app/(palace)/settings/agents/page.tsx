import { SourceCard, type SourceView } from '@/components/SessionsUI';
import { config } from '@/lib/config';
import { sourceStatus } from '@/lib/sessions/manage';
import { readSessionStore } from '@/lib/sessions/store';

export default async function AgentSettingsPage() {
  const [status, store] = await Promise.all([sourceStatus(), readSessionStore()]);
  const sources: SourceView[] = status.map((s) => ({ ...s, enabled: !!store.sources[s.source] }));
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
    </div>
  );
}
