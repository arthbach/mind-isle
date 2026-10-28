'use client';

import { useState, useTransition } from 'react';
import { alwaysSaveProject, approveSummary, configureSummaries, retrySummary, skipSummary } from '@/app/summaries-actions';
import type { SummaryCli, SummaryMode } from '@/lib/settings';
import type { SummaryStatus } from '@/lib/summaries';
import { ActionButton } from './ActionButton';

function Segmented<T extends string>({ label, value, options, onPick, disabled }: {
  label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onPick: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''}
          disabled={disabled || o.disabled} onClick={() => onPick(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Mode and CLI pickers, plus the button that turns summaries on. */
export function SummarySettings({ mode, cli, started, found, readOnly }: {
  mode: SummaryMode; cli: SummaryCli; started: boolean; found: Record<SummaryCli, boolean>; readOnly: boolean;
}) {
  const [pending, start] = useTransition();
  const set = (patch: Parameters<typeof configureSummaries>[0]) => start(() => configureSummaries(patch));
  return (
    <div className="settings">
      <div className="setting col">
        <div>
          <b>When a session ends</b>
          <p className="tiny muted">A project note can override this with its own <code>summaries:</code> line.</p>
        </div>
        <Segmented<SummaryMode> label="When a session ends" value={mode} disabled={pending || readOnly} onPick={(v) => set({ default: v })}
          options={[{ value: 'ask', label: 'Ask me first' }, { value: 'auto', label: 'Always summarise' }, { value: 'off', label: 'Never' }]} />
      </div>
      <div className="setting col">
        <div>
          <b>Summarise with</b>
          <p className="tiny muted">Runs on this computer with your own account, using a small, fast model. Each summary costs a few cents or less.</p>
        </div>
        <Segmented<SummaryCli> label="Summarise with" value={cli} disabled={pending || readOnly} onPick={(v) => set({ cli: v })}
          options={[
            { value: 'claude', label: `Claude Code${found.claude ? '' : ' (not found)'}`, disabled: !found.claude && cli !== 'claude' },
            { value: 'codex', label: `Codex${found.codex ? '' : ' (not found)'}`, disabled: !found.codex && cli !== 'codex' },
          ]} />
      </div>
      {!started && (
        <button className="btn primary big" disabled={pending || readOnly || !found[cli]} onClick={() => set({ start: true })}>
          Turn on summaries
        </button>
      )}
    </div>
  );
}

const LABEL: Partial<Record<SummaryStatus, string>> = {
  queued: 'Summarising soon…', running: 'Summarising…', skipped: 'Skipped', unsummarisable: 'Transcript deleted', off: 'Summaries off',
  live: 'Still going',
};

/** What a History row offers, by the session's summary status. */
export function SummaryControls({ id, status, noteHref, error, readOnly }: {
  id: string; status: SummaryStatus; noteHref: string | null; error: string | null; readOnly: boolean;
}) {
  if (status === 'pending' && !readOnly) {
    return (
      <span className="sum-ctl">
        <ActionButton className="btn tiny-btn primary" action={() => approveSummary(id)}>Summarise</ActionButton>
        <ActionButton className="btn tiny-btn" action={() => skipSummary(id)}>Skip</ActionButton>
      </span>
    );
  }
  if (status === 'done' && noteHref) return <a className="tiny" href={noteHref}>📜 Open note</a>;
  if (status === 'failed') {
    return (
      <span className="sum-ctl">
        <span className="tiny warn" title={error ?? undefined}>Summary failed</span>
        {!readOnly && <ActionButton className="btn tiny-btn" action={() => retrySummary(id)} title={error ?? undefined}>Retry</ActionButton>}
      </span>
    );
  }
  return LABEL[status] ? <span className="tiny muted">{LABEL[status]}</span> : null;
}

export function RetryButton({ id }: { id: string }) {
  return <ActionButton className="btn tiny-btn" action={() => retrySummary(id)}>Retry</ActionButton>;
}

/** A finished session waiting for the user's yes. */
export interface Scroll {
  id: string;
  title: string | null;
  project: { rel: string; name: string } | null;
  folder: string;
  activeMin: number;
  files: string[];
  fileCount: number;
  endedAt: number;
}

const mins = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

/** Dusk: every session waiting for a yes, in one batch. They never expire. */
export function ScrollBatch({ scrolls }: { scrolls: Scroll[] }) {
  const [review, setReview] = useState(false);
  if (!scrolls.length) return null;
  const ids = scrolls.map((s) => s.id);
  const n = scrolls.length;
  return (
    <section className="panel card scrolls">
      <div className="scrolls-head">
        <span className="scrolls-icon" aria-hidden="true">📜</span>
        <div className="scrolls-text">
          <h3 className="ci-h">{n} session{n === 1 ? '' : 's'} to remember</h3>
          <p className="tiny muted" style={{ margin: 0 }}>Save writes a short note about each one into your vault. Nothing is written without a yes.</p>
        </div>
        <div className="scrolls-actions">
          <ActionButton className="btn primary" action={() => approveSummary(ids)}>Save all</ActionButton>
          <button className="btn" aria-expanded={review} onClick={() => setReview(!review)}>{review ? 'Hide' : 'Review one by one'}</button>
          <ActionButton className="btn" action={() => skipSummary(ids)}>Skip all</ActionButton>
        </div>
      </div>
      {review && (
        <ul className="list scrolls-list">
          {scrolls.map((s) => (
            <li key={s.id} className="intent col">
              <div>
                <b>{s.title ?? 'Untitled session'}</b>
                <div className="tiny muted">
                  {s.project?.name ?? s.folder} · {mins(s.activeMin)} active
                  {s.fileCount > 0 && ` · ${s.fileCount} file${s.fileCount === 1 ? '' : 's'}: ${s.files.join(', ')}${s.fileCount > s.files.length ? ' …' : ''}`}
                </div>
              </div>
              <div className="tri">
                <ActionButton className="btn tiny-btn primary" action={() => approveSummary(s.id)}>Save</ActionButton>
                <ActionButton className="btn tiny-btn" action={() => skipSummary(s.id)}>Skip</ActionButton>
                {s.project && (
                  <ActionButton className="btn tiny-btn" action={() => alwaysSaveProject(s.project!.rel)} title={`Every finished ${s.project.name} session gets a note, without asking`}>
                    Always save for {s.project.name}
                  </ActionButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Dawn: Atlas warns before the agent deletes transcripts that are still waiting. */
export function RetentionNotice({ count, daysLeft, ids, onReview }: { count: number; daysLeft: number; ids: string[]; onReview: () => void }) {
  return (
    <section className="panel card retention" role="status">
      <span aria-hidden="true">⏳</span>
      <p style={{ margin: 0, flex: 1 }}>
        <b>{count} waiting session{count === 1 ? '' : 's'}</b> will lose {count === 1 ? 'its' : 'their'} transcript
        {daysLeft <= 0 ? ' any day now' : ` in about ${daysLeft} day${daysLeft === 1 ? '' : 's'}`} (Claude Code deletes old logs).
        After that only the record stays and no note can be written.
      </p>
      <ActionButton className="btn primary tiny-btn" action={() => approveSummary(ids)}>Save {count === 1 ? 'it' : `all ${count}`} now</ActionButton>
      <button className="btn tiny-btn" onClick={onReview}>Review at Dusk</button>
    </section>
  );
}
