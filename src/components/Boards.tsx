'use client';

import { useState, useTransition } from 'react';
import { completeQuest, judgeDecision, lightLantern } from '@/app/actions';
import { fmtDate, obsidianLink, VERDICTS } from '@/lib/game';
import type { Decision, Person, Quest } from '@/lib/types';
import { ActionButton } from './ActionButton';

export function QuestBoard({ quests, total, vaultName, readOnly }: { quests: Quest[]; total: number; vaultName: string; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!quests.length) return <div className="empty">No open tasks in the vault. Add <code>- [ ] something</code> to any note.</div>;
  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="list">
        {quests.map((q) => (
          <li key={q.id} className="item quest">
            <input type="checkbox" disabled={readOnly || pending} aria-label={`Complete: ${q.text}`}
              onChange={() => start(async () => {
                setError(null);
                try { await completeQuest(q.id, q.text); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
              })} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 className={q.isPrivate ? 'lock' : ''}>{q.text}</h4>
              <p>
                {q.priority && <span className="pill">{q.priority}</span>}{' '}
                {q.due && <span className={q.overdue ? 'warn' : ''}>{q.overdue ? 'overdue · ' : 'due '}{fmtDate(q.due)} · </span>}
                <a href={obsidianLink(vaultName, q.path)}>{q.source}</a>
              </p>
            </div>
          </li>
        ))}
      </ul>
      {total > quests.length && <p className="tiny muted" style={{ marginBottom: 0 }}>+{total - quests.length} more open tasks in the vault.</p>}
    </>
  );
}

export function Lanterns({ people, vaultName, readOnly }: { people: Person[]; vaultName: string; readOnly: boolean }) {
  if (!people.length) return <div className="empty">No fading lanterns. Everyone you know is warm, or not yet in the vault.</div>;
  return (
    <ul className="list">
      {people.map((p) => (
        <li key={p.id} className="item">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h4>{p.name}</h4>
            <span className="pill">{p.days === null ? 'never' : `${p.days}d`}</span>
          </div>
          <p>{p.company}{p.role && ` · ${p.role}`} · mentioned in {p.mentions} notes</p>
          <div className="vote">
            {!readOnly && <ActionButton action={() => lightLantern(p.path)}>We talked recently</ActionButton>}
            <a className="tiny" href={obsidianLink(vaultName, p.path)}>Open note</a>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SealVote({ d, readOnly }: { d: Decision; readOnly: boolean }) {
  if (d.verdict) return <span className="pill">Judged: {d.verdict}</span>;
  if (readOnly) return null;
  return (
    <div className="vote">
      {VERDICTS.map((v) => <ActionButton key={v} action={() => judgeDecision(d.id, d.path, v)}>{v}</ActionButton>)}
    </div>
  );
}
