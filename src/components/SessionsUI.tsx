'use client';

import { useState, useTransition } from 'react';
import { confirmAllAuto, enableSource, placeFolder, setHooks } from '@/app/sessions-actions';
import { AGENT_LABEL, SOURCE_LABEL, type FolderGroup, type SourceId } from '@/lib/sessions/types';
import { ActionButton } from './ActionButton';
import { PixelSelect } from './PixelSelect';

export interface SourceView {
  source: SourceId;
  enabled: boolean;
  roots: { label: string; agent: 'claude' | 'codex'; hooks: boolean }[];
}

const SOURCE_HELP: Record<SourceId, string> = {
  orca: 'Claude Code and Codex sessions you run inside Orca.',
  'claude-code': 'Claude Code sessions run from your terminal or IDE.',
  codex: 'Codex sessions run from your terminal or IDE.',
};

export function SourceCard({ s, readOnly }: { s: SourceView; readOnly: boolean }) {
  const found = s.roots.length > 0;
  const hooks = found && s.roots.every((r) => r.hooks);
  return (
    <div className="item" data-source={s.source}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h4>{SOURCE_LABEL[s.source]}</h4>
        <span className={`pill ${s.enabled ? 'on' : ''}`}>{!found ? 'not found' : s.enabled ? 'on' : 'off'}</span>
      </div>
      <p>{found ? SOURCE_HELP[s.source] : 'Not installed on this computer.'}</p>
      {found && <p className="tiny">{s.roots.map((r) => r.label).join(' · ')}</p>}
      {found && !readOnly && (
        <div className="vote">
          <ActionButton className={`btn ${s.enabled ? '' : 'primary'}`} action={() => enableSource(s.source, !s.enabled)}>
            {s.enabled ? 'Turn off' : 'Allow'}
          </ActionButton>
          {s.enabled && (
            <ActionButton action={() => setHooks(s.source, !hooks)} title="Adds a small hook that records metadata only: event, tool name, file path. Never prompts or code.">
              {hooks ? 'Remove live hooks' : 'Install live hooks'}
            </ActionButton>
          )}
        </div>
      )}
      {s.enabled && (
        <p className="tiny" style={{ marginTop: 6 }}>
          {hooks
            ? 'Live hooks installed: “needs you” shows the moment a session asks for permission.'
            : NO_HOOKS[s.source]}
        </p>
      )}
    </div>
  );
}

const NO_HOOKS: Record<SourceId, string> = {
  orca: 'Without hooks, running sessions still show up. Codex permission requests appear within seconds; Claude Code ones need the hooks.',
  'claude-code': 'Without hooks, running sessions still show up, but Mind Isle can’t see when Claude is waiting for your permission.',
  codex: 'Running sessions and permission requests are read from Codex’s own log. Hooks make them show up a little faster.',
};

const KIND_LABEL: Record<FolderGroup['mapping']['kind'], string> = {
  ask: 'Is this right?', harbor: 'Needs a project', auto: 'Placed automatically', confirmed: 'Confirmed', ignored: 'Not a project',
};

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

export function FolderRow({ f, projects, readOnly }: { f: FolderGroup; projects: { rel: string; name: string }[]; readOnly: boolean }) {
  const m = f.mapping;
  // Never preselect "Not a project": ignoring a folder should always be a deliberate choice.
  const initial = m.project?.rel ?? f.suggestions[0]?.rel ?? '';
  const [choice, setChoice] = useState<string>(initial);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(m.kind === 'ask' || m.kind === 'harbor');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = () => start(async () => {
    setError(null);
    try {
      if (choice === '__new') await placeFolder(f.cwd, { kind: 'new', name });
      else if (choice === '__none') await placeFolder(f.cwd, { kind: 'none' });
      else await placeFolder(f.cwd, { kind: 'project', rel: choice });
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
  });

  const options = [
    ...(initial ? [] : [{ value: '', label: 'Choose…' }]),
    ...f.suggestions.map((s) => ({ value: s.rel, label: s.name, hint: `${Math.round(s.confidence * 100)}% · ${s.reason}` })),
    ...projects.filter((p) => !f.suggestions.some((s) => s.rel === p.rel)).map((p) => ({ value: p.rel, label: p.name })),
    { value: '__new', label: '＋ New project…' },
    { value: '__none', label: 'Not a project' },
  ];

  return (
    <li id={encodeURIComponent(f.cwd)} className={`item folder kind-${m.kind}`} data-cwd={f.cwd} data-kind={m.kind}>
      <div style={{ minWidth: 0 }}>
        <div className="row">
          <span className="pill conf-badge">{KIND_LABEL[m.kind]}</span>
          {m.project && <b className="px">{m.project.name}</b>}
          {m.kind !== 'confirmed' && m.kind !== 'ignored' && m.confidence > 0 && (
            <span className="tiny muted">{Math.round(m.confidence * 100)}% · {m.reason}</span>
          )}
        </div>
        <p style={{ marginTop: 4 }}><code>{f.cwdShort}</code></p>
        <p className="tiny">
          {f.sessions} session{f.sessions === 1 ? '' : 's'} · {f.agents.map((a) => AGENT_LABEL[a]).join(' + ')} · last {ago(f.lastActive)}
          {f.remote && <> · {f.remote.replace(/^https?:\/\//, '')}</>}
        </p>
        {f.titles.length > 0 && <p className="tiny muted">“{f.titles.slice(0, 2).join('”, “')}”</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      {!readOnly && (
        <div className="vote" style={{ justifyContent: 'flex-end' }}>
          {editing ? (
            <>
              <PixelSelect label="Project" value={choice} onChange={setChoice} options={options} />
              {choice === '__new' && <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" aria-label="New project name" style={{ width: 180 }} />}
              <button className="btn primary" disabled={pending || !choice || (choice === '__new' && !name.trim())} onClick={save}>{pending ? 'Saving…' : 'Save'}</button>
            </>
          ) : m.kind === 'auto' && m.project ? (
            <>
              <ActionButton className="btn good" action={() => placeFolder(f.cwd, { kind: 'project', rel: m.project!.rel })}>Confirm</ActionButton>
              <ActionButton action={() => placeFolder(f.cwd, { kind: 'undo-auto', rel: m.project!.rel })}>Undo</ActionButton>
            </>
          ) : (
            <button className="btn" onClick={() => setEditing(true)}>Reassign</button>
          )}
        </div>
      )}
    </li>
  );
}

export function ConfirmAll({ count }: { count: number }) {
  if (!count) return null;
  return <ActionButton className="btn good" action={() => confirmAllAuto()}>Confirm all {count} automatic</ActionButton>;
}
