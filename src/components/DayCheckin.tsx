'use client';

// The Dawn/Dusk check-in: Atlas on one line at the top, then two columns.
// Dawn: quest board → today's plan. Dusk: what got done → everything else about the day.
import { useEffect, useState, useTransition } from 'react';
import { closeDay, completeQuest, dropQuest, lockPlan, reopenDay, skipCheckin, unlockPlan } from '@/app/actions';
import { fmtDate, tagFor, type Tag } from '@/lib/game';
import type { DayEntry, PlanStatus, Quest, TagContext } from '@/lib/types';
import { QuestBoard } from './Boards';
import { Sprite } from './Sprite';
import { OwnerReport, type OwnerReportData } from './IsleUI';
import { RetentionNotice, ScrollBatch, type Scroll } from './SummariesUI';
import { InterviewQuestion } from './WorldviewUI';

type Mode = 'dawn' | 'dusk';
const ICON: Record<Tag['kind'], string> = { project: '🏗', person: '🏮', bet: '⛵', none: '·' };
const ENERGY = ['Drained', 'Low', 'Steady', 'Good', 'Full tank'];

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function store(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

export function DayCheckin(props: {
  day: DayEntry;
  owner: string;
  /** Open quests from the vault, most urgent first: the board Dawn picks from. */
  quests: Quest[];
  questTotal: number;
  vaultName: string;
  ctx: TagContext;
  readOnly: boolean;
  /** Which tab to open on, decided by the server from the configured timezone. */
  initialMode: Mode;
  /** A check-in is still pending today: offer "Skip today". */
  canSkip?: boolean;
  atlas: { active: number; weedy: number; docked: string | null };
  /** Finished sessions waiting for a yes, batched at Dusk. */
  scrolls?: Scroll[];
  /** Waiting sessions whose transcripts the agent will delete soon. */
  retention?: { count: number; daysLeft: number; ids: string[] } | null;
  /** Today's worldview interview question (only when the user opted in). */
  question?: { index: number; text: string } | null;
  /** What Atlas did overnight. */
  night?: OwnerReportData | null;
}) {
  const { day, ctx, readOnly, initialMode, canSkip } = props;
  const draftKey = `mp-draft-${day.date}`;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [items, setItems] = useState<string[]>(day.plan.map((p) => p.text));
  const [energy, setEnergy] = useState<number | null>(day.energy);
  const [input, setInput] = useState('');
  const [statuses, setStatuses] = useState<PlanStatus[]>(day.plan.map((p) => p.status));
  const [extra, setExtra] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [decision, setDecision] = useState('');
  const [reflection, setReflection] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Follow the server when the phase changes (e.g. after closing the day).
  useEffect(() => { setMode(initialMode); }, [initialMode]);

  // Restore unsent drafts.
  useEffect(() => {
    if (!day.locked && !day.plan.length) setItems(load(`${draftKey}-plan`, []));
    const dusk = load(`${draftKey}-dusk`, { extra: [] as string[], people: [] as string[], decision: '', reflection: '' });
    setExtra(dusk.extra); setPeople(dusk.people); setDecision(dusk.decision); setReflection(dusk.reflection);
  }, [day.locked, day.plan.length, draftKey]);

  // Server is the source of truth once the plan is written.
  useEffect(() => {
    if (day.locked || day.plan.length) setItems(day.plan.map((p) => p.text));
    setStatuses(day.plan.map((p) => p.status));
  }, [day.locked, day.plan]);

  useEffect(() => { if (!day.locked) store(`${draftKey}-plan`, items); }, [items, day.locked, draftKey]);
  useEffect(() => { store(`${draftKey}-dusk`, { extra, people, decision, reflection }); }, [extra, people, decision, reflection, draftKey]);

  const run = (fn: () => Promise<void>, after?: () => void) => start(async () => {
    setError(null);
    try { await fn(); after?.(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
  });

  const pill = (t: string) => { const tg = tagFor(t, ctx); return <span className="pill" title="Where this lands on the island">{ICON[tg.kind]} {tg.label}</span>; };
  const add = (list: string[], set: (v: string[]) => void, v: string) => {
    const t = v.trim();
    if (t && !list.includes(t)) set([...list, t]);
    setInput('');
  };

  const line = (() => {
    if (mode === 'dawn') {
      if (day.locked) {
        const sites = new Set(items.map((t) => tagFor(t, ctx)).filter((t) => t.kind === 'project').map((t) => t.label)).size;
        return `Locked in. ${sites ? `Workers are heading to ${sites} site${sites > 1 ? 's' : ''} on the island.` : 'Nothing on the island today, and that’s fine.'} Come back tonight for Dusk.`;
      }
      const parts = [`Good morning, ${props.owner}.`];
      if (props.atlas.weedy) parts.push(`${props.atlas.weedy} of ${props.atlas.active} sites have gone quiet.`);
      if (props.atlas.docked) parts.push(props.atlas.docked);
      parts.push('What are you building today?');
      return parts.join(' ');
    }
    if (day.closed) return 'Day closed and filed. Rest well; we pick it up at Dawn.';
    return items.length ? `Good evening. This morning you planned ${items.length} thing${items.length > 1 ? 's' : ''}. Let’s see what moved.` : 'Good evening. No plan this morning, and that’s fine. What got done?';
  })();

  const board = props.quests.filter((q) => !items.includes(q.text));
  const count = (s: PlanStatus) => day.plan.filter((p) => p.status === s).length;

  return (
    <div className="checkin">
      <header className="ci-head">
        <Sprite name="atlas" className="portrait" />
        <p className="ci-line"><b className="px">Atlas</b> {line}</p>
        <div className="seg ci-seg">
          <button aria-pressed={mode === 'dawn'} onClick={() => setMode('dawn')}>☀ Dawn · plan</button>
          <button aria-pressed={mode === 'dusk'} onClick={() => setMode('dusk')}>☾ Dusk · done</button>
        </div>
      </header>

      {readOnly && <p className="tiny muted" style={{ margin: 0 }}>Read-only mode: nothing will be saved.</p>}
      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}

      {mode === 'dawn' && props.night && <OwnerReport r={props.night} />}
      {mode === 'dawn' && props.retention && <RetentionNotice {...props.retention} onReview={() => setMode('dusk')} />}
      {mode === 'dusk' && <ScrollBatch scrolls={props.scrolls ?? []} />}
      {mode === 'dusk' && props.question && <InterviewQuestion {...props.question} />}

      {mode === 'dawn' && (
        <div className={`ci-cols ci-dawn${day.locked ? ' one' : ''}`}>
          {!day.locked && (
            <section className="panel card">
              <h3 className="ci-h">Quest board</h3>
              <p className="sub">Open tasks from your vault, most urgent first. Click one to add it to today, or close it if it’s already settled.</p>
              {board.length ? (
                <ul className="ci-list">
                  {board.map((q) => (
                    <li key={q.id} className="ci-qrow">
                      <button className="ci-quest" onClick={() => setItems([...items, q.text])} aria-label={`Add to today: ${q.text}`}>
                        <span className="ci-qmain">
                          <b>{q.isPrivate ? '🔒 ' : ''}{q.text}</b>
                          <span className="tiny">
                            {q.priority && <span className="pill">{q.priority}</span>}{' '}
                            {q.due && <span className={q.overdue ? 'warn' : 'muted'}>{q.overdue ? 'overdue · ' : 'due '}{fmtDate(q.due)}</span>}
                            <span className="muted">{q.due ? ' · ' : ''}{q.source}</span>
                          </span>
                        </span>
                        <span className="ci-arrow" aria-hidden="true">→</span>
                      </button>
                      {!readOnly && (
                        <span className="ci-qclose">
                          <button className="btn tiny-btn good" disabled={pending} onClick={() => run(() => completeQuest(q.id, q.text))}
                            aria-label={`Already done: ${q.text}`} title="Already done: ticks it in its note">✓ Done</button>
                          <button className="btn tiny-btn" disabled={pending} onClick={() => run(() => dropQuest(q.id, q.text))}
                            aria-label={`Not doing: ${q.text}`} title="Not doing it: marks it cancelled in its note">✗ Drop</button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <div className="empty">Nothing left on the board.</div>}
            </section>
          )}
          <section className="panel card ci-today">
            <h3 className="ci-h">Today I will…</h3>
            <div className="ci-energy">
              <span className="ci-elabel">Energy</span>
              <div className="ci-ebtns" role="group" aria-label="Energy">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} className={`ci-ebtn${(energy ?? 0) >= i ? ' on' : ''}`} aria-pressed={energy === i} aria-label={`Energy ${i} of 5`}
                    title={ENERGY[i - 1]} disabled={day.locked} onClick={() => setEnergy(i)}><span>⚡</span></button>
                ))}
              </div>
              <span className={`tiny ci-ecap${energy ? '' : ' ask'}`}>{energy ? `${energy}/5 · ${ENERGY[energy - 1]}` : 'How are you feeling?'}</span>
            </div>
            {!day.locked && (
              <div className="addrow">
                <input type="text" value={input} placeholder="What will you do?" aria-label="Add a plan item"
                  onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(items, setItems, input); }} />
                <button className="btn" aria-label="Add" onClick={() => add(items, setItems, input)}>+</button>
              </div>
            )}
            <ul className="list ci-plan">
              {items.length ? items.map((t, i) => (
                <li key={t} className="intent">
                  <span>{t}</span>{pill(t)}
                  {!day.locked && <button className="x" aria-label={`Remove ${t}`} onClick={() => setItems(items.filter((_, k) => k !== i))}>×</button>}
                </li>
              )) : <li className="tiny muted">Nothing yet. Type it, or pick from the board.</li>}
            </ul>
            {day.locked ? (
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => setMode('dusk')}>Skip to Dusk →</button>
                {!readOnly && <button className="linkbtn" style={{ padding: 0 }} disabled={pending} onClick={() => run(() => unlockPlan())}>Edit plan</button>}
              </div>
            ) : (
              <button className="btn primary big" disabled={!items.length || pending || readOnly}
                onClick={() => run(() => lockPlan({ energy, items }), () => store(`${draftKey}-plan`, []))}>
                {pending ? 'Saving…' : 'Lock in today’s plan'}
              </button>
            )}
          </section>
        </div>
      )}

      {mode === 'dusk' && day.closed && (
        <section className="panel card ci-report">
          <h3 className="ci-h">Day report</h3>
          <div className="stats">
            <div className="stat"><div className="n">{count('done')}/{day.plan.length}</div><div className="l">planned and done</div></div>
            <div className="stat"><div className="n">{day.done.length}</div><div className="l">bonus wins</div></div>
            <div className="stat"><div className="n">{day.people.length}</div><div className="l">people met</div></div>
            <div className="stat"><div className="n">{count('moved')}</div><div className="l">rolled to tomorrow</div></div>
          </div>
          <div className="why" style={{ marginTop: 10 }}>
            Filed to today’s daily note. People you met had their lanterns lit, and projects you moved lost their weeds.
            {day.decisions.length > 0 && ' Your decision is sealed in the Codex.'}
          </div>
          {!readOnly && <button className="btn big" disabled={pending} onClick={() => run(() => reopenDay())}>Reopen today</button>}
        </section>
      )}

      {mode === 'dusk' && !day.closed && (
        <div className="ci-cols">
          <section className="panel card">
            <h3 className="ci-h">What got done?</h3>
            {day.locked && items.length ? (
              <ul className="list">
                {items.map((t, i) => (
                  <li key={t} className="intent col">
                    <div className="row"><span style={{ flex: 1 }}>{t}</span>{pill(t)}</div>
                    <div className="tri">
                      {([['done', '✓ Done'], ['partly', '◐ Partly'], ['moved', '→ Tomorrow']] as const).map(([k, l]) => (
                        <button key={k} className="btn" aria-pressed={statuses[i] === k}
                          onClick={() => setStatuses(statuses.map((s, j) => (j === i ? (s === k ? null : k) : s)))}>{l}</button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="tiny muted" style={{ margin: 0 }}>{items.length ? 'Lock the plan at Dawn to review it here.' : 'No plan this morning.'}</p>}
            <ListInput title="Also done, not planned" placeholder="Something you finished" list={extra} set={setExtra} pill={pill} />
            {/* Ticking one here marks the task done in its own note, right away. */}
            {props.quests.length > 0 && (
              <details className="ci-fold">
                <summary>Finished something from the quest board? <span className="muted">({props.quests.length})</span></summary>
                <QuestBoard quests={props.quests} total={props.questTotal} vaultName={props.vaultName} readOnly={readOnly} />
              </details>
            )}
          </section>
          <section className="panel card">
            <ListInput title="Who did you talk to?" placeholder="Names, comma separated" list={people} set={setPeople} pill={pill} first />
            <div className="ph-sec"><h4>Decided anything?</h4>
              <input type="text" value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="One decision, one line" aria-label="Decision" />
            </div>
            <div className="ph-sec"><h4>One line about today</h4>
              <input type="text" value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="How did it feel?" aria-label="Reflection" />
            </div>
            <button className="btn primary big" disabled={pending || readOnly}
              onClick={() => run(() => closeDay({ statuses, extra, people, decision, reflection }), () => store(`${draftKey}-dusk`, { extra: [], people: [], decision: '', reflection: '' }))}>
              {pending ? 'Filing…' : 'Close the day'}
            </button>
          </section>
        </div>
      )}

      {canSkip && !readOnly && (
        <button className="btn" style={{ alignSelf: 'center' }} disabled={pending}
          onClick={() => run(() => skipCheckin(mode))}>
          Skip today’s {mode === 'dawn' ? 'Dawn' : 'Dusk'}
        </button>
      )}
    </div>
  );
}

function ListInput({ title, placeholder, list, set, pill, first }: {
  title: string; placeholder: string; list: string[]; set: (v: string[]) => void; pill: (t: string) => React.ReactNode; first?: boolean;
}) {
  const [v, setV] = useState('');
  const add = () => {
    const parts = v.split(',').map((s) => s.trim()).filter((s) => s && !list.includes(s));
    if (parts.length) set([...list, ...parts]);
    setV('');
  };
  return (
    <div className="ph-sec" style={first ? { marginTop: 0 } : undefined}>
      <h4>{title}</h4>
      {list.length > 0 && (
        <ul className="list">
          {list.map((t, i) => (
            <li key={t} className="intent"><span>{t}</span>{pill(t)}<button className="x" aria-label={`Remove ${t}`} onClick={() => set(list.filter((_, k) => k !== i))}>×</button></li>
          ))}
        </ul>
      )}
      <div className="addrow">
        <input type="text" value={v} placeholder={placeholder} aria-label={title} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn" aria-label="Add" onClick={add}>+</button>
      </div>
    </div>
  );
}
