import Link from 'next/link';
import type { ChallengeView } from '@/lib/civ';
import { BUILDINGS, type BuildingKey } from '@/lib/civ/rules';

export interface ChallengeData { text: string; done: number; need: number; reward: number; daysLeft: number }
export interface OwnerReportData {
  message: string;
  earned: number;
  balance: number;
  built: { key: BuildingKey; village: string | null } | null;
  lines: { text: string; shells: number }[];
  letters: { name: string; about: string | null; village: string }[];
  birthdays: { name: string; in: number }[];
  challenge: ChallengeData | null;
}

const listNames = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);

/** The weekly challenge in one line, with what's left to do. */
export function challengeData(c: ChallengeView): ChallengeData {
  const by = c.daysLeft === 0 ? 'today' : c.daysLeft === 1 ? 'by tomorrow' : `in ${c.daysLeft} days`;
  const text = c.kind === 'quests'
    ? `Finish ${c.need} quests ${by}.`
    : `Reach ${c.need === c.targets.length ? (c.need === 1 ? c.targets[0].name : `both ${listNames(c.targets.map((t) => t.name)).replace(' or ', ' and ')}`) : `${c.need} of ${listNames(c.targets.map((t) => t.name))}`} in ${c.village} ${by}, and I’ll throw a festival there.`;
  return { text, done: Math.min(c.done, c.need), need: c.need, reward: c.reward, daysLeft: c.daysLeft };
}

export function ChallengeLine({ c }: { c: ChallengeData }) {
  return (
    <div className="owner-challenge">
      <span className="tiny"><b>🎯 This week:</b> {c.text} <span className="muted">+{c.reward} 🐚</span></span>
      <span className="tiny"><b>{c.done}/{c.need}</b></span>
      <div className="life-bar"><span style={{ width: `${(c.done / Math.max(1, c.need)) * 100}%`, background: c.done >= c.need ? 'var(--green, #4fae5c)' : 'var(--gold)' }} /></div>
    </div>
  );
}

/** Dawn: what Atlas did overnight, and why. */
export function OwnerReport({ r }: { r: OwnerReportData }) {
  return (
    <section className="panel card owner-report" aria-label="Atlas’s night report">
      <div className="owner-report-head">
        <span className="owner-report-icon" aria-hidden="true">{r.built ? BUILDINGS[r.built.key].icon : '🌙'}</span>
        <p style={{ margin: 0, flex: 1 }}><b className="px">Overnight</b> {r.message}</p>
        <Link className="owner-report-bank" href="/isle" title="Open the Treasury">{r.balance} 🐚</Link>
      </div>
      {r.birthdays.map((b) => (
        <p key={b.name} className="tiny owner-letter">🎂 <b>{b.name}</b>’s birthday is {b.in === 0 ? 'today' : b.in === 1 ? 'tomorrow' : `in ${b.in} days`}. A message on the day pays +5 🐚.</p>
      ))}
      {r.letters.map((l) => (
        <p key={l.name} className="tiny owner-letter">
          📮 <b>Letter idea:</b> {l.name} in {l.village} is sick.{' '}
          {l.about ? `You last talked about ${l.about}; ask how it went.` : 'Two lines asking how they are would do it.'}
        </p>
      ))}
      {r.challenge && <ChallengeLine c={r.challenge} />}
      {r.lines.length > 0 && (
        <details className="tiny">
          <summary>Where yesterday’s {r.earned} 🐚 came from</summary>
          <ul className="owner-lines">{r.lines.map((l, i) => <li key={i}><span>{l.text}</span><b>+{l.shells}</b></li>)}</ul>
        </details>
      )}
    </section>
  );
}
