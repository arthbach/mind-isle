import Link from 'next/link';
import { ChallengeLine, challengeData } from '@/components/IsleUI';
import { buildingLabel, choiceLabel, getIsle, ownerSays, total } from '@/lib/civ';
import {
  BIRTHDAY_BONUS, BUILDING_KEYS, BUILDINGS, CLOCK, EARN, FESTIVAL_BONUS, LEVELS, QUEST_CAP, START_GRANT, STORM_AFTER, WONDER_GOAL, type Circle, type Levelled,
} from '@/lib/civ/rules';
import { fmtDate } from '@/lib/game';

const EARN_ROWS: [string, string][] = [
  ['Quest ticked (low or none / medium / high)', `${EARN.quest.low} / ${EARN.quest.medium} / ${EARN.quest.high}, at most ${QUEST_CAP} a day`],
  ['A Dawn plan item done at Dusk', `${EARN.plan}`],
  ['Dawn locked · Dusk closed', `${EARN.dawn} · ${EARN.dusk}`],
  ['A conversation (meeting, Dusk “People”, “We talked”)', `${EARN.talk}`],
  ['Bringing a ghost back', `${EARN.rebirth}`],
  ['A project update · a session note', `${EARN.projectLog} · ${EARN.summary}`],
  ['A decision judged', `${EARN.judged}`],
  ['A conversation at a festival', `+${FESTIVAL_BONUS}`],
  ['A conversation on someone’s birthday', `+${BIRTHDAY_BONUS}`],
];

// Civilization (roadmap §12): the treasury, what Atlas did and why, and what comes next.
export default async function IslePage() {
  const isle = await getIsle();
  const r = isle.report;
  const [next] = isle.choices;
  const today = total(isle.today);
  const count = (life: string) => isle.villagers.filter((v) => v.life === life).length;
  const ghosts = isle.villagers.filter((v) => v.life === 'ghost').sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  const sick = isle.villagers.filter((v) => v.life === 'sick').sort((a, b) => (a.left ?? 99) - (b.left ?? 99));
  const GOAL = Object.fromEntries(Object.entries(WONDER_GOAL).map(([k, g]) => [k, g.what]));
  return (
    <div className="isle-page">
      <section className="panel card isle-top">
        <div className="isle-bank"><span className="tiny muted">Treasury</span><b>{isle.balance} 🐚</b><span className="tiny muted">+{today} today so far</span></div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>Atlas, Owner of the isle <span className="tiny muted">· the island of {isle.era}{isle.golden ? ' · Golden Age ✨' : ''}</span></h2>
          <p className="small" style={{ margin: '4px 0 0' }}>{r ? ownerSays(r, isle.balance) : 'Atlas arrives tonight and builds while you sleep.'}</p>
          {next && (
            <div className="isle-goal">
              <span className="tiny"><b>Next:</b> {choiceLabel(next)} · {Math.min(Math.max(0, isle.balance), next.cost)} / {next.cost} 🐚</span>
              <div className="life-bar"><span style={{ width: `${Math.min(100, (Math.max(0, isle.balance) / next.cost) * 100)}%`, background: 'var(--gold)' }} /></div>
            </div>
          )}
        </div>
        <ul className="isle-census" aria-label="Villagers">
          <li><b>{count('thriving')}</b> thriving</li><li><b>{count('idle')}</b> idle</li><li><b>{count('sick')}</b> sick</li>
          <li><b>{count('ghost')}</b> ghosts</li>{count('spirit') > 0 && <li><b>{count('spirit')}</b> remembered</li>}
        </ul>
      </section>

      {(isle.challenge || isle.festivalsToday.length > 0 || isle.birthdays.length > 0) && (
        <section className="panel card isle-events">
          {isle.challenge && <ChallengeLine c={challengeData(isle.challenge)} />}
          {isle.festivalsToday.map((v) => <p key={v} className="tiny" style={{ margin: 0 }}>🎉 <b>Festival in {v} today.</b> Every conversation there pays +{FESTIVAL_BONUS} 🐚.</p>)}
          {isle.birthdays.map((b) => (
            <p key={b.name} className="tiny" style={{ margin: 0 }}>🎂 <b>{b.name}</b> ({b.village}): birthday {b.in === 0 ? 'today' : b.in === 1 ? 'tomorrow' : `in ${b.in} days`}{b.life === 'ghost' ? ', and a good reason to bring them back' : ''}.</p>
          ))}
        </section>
      )}

      <div className="isle-cols">
        <section className="panel card">
          <h3 className="ci-h">Who needs you</h3>
          {sick.length === 0 && ghosts.length === 0 && <p className="muted small">Nobody. Every villager is doing fine.</p>}
          {sick.length > 0 && (
            <ul className="isle-people">
              {sick.slice(0, 8).map((v) => <li key={v.id}><span>🤒 <b>{v.name}</b> <span className="tiny muted">{v.village}</span></span><span className="tiny warn">{v.left} day{v.left === 1 ? '' : 's'} left</span></li>)}
            </ul>
          )}
          {ghosts.length > 0 && (
            <>
              <p className="tiny muted" style={{ margin: '8px 0 2px' }}>Ghosts, most recently lost first. Talk to them and they come back.</p>
              <ul className="isle-people">
                {ghosts.slice(0, 8).map((v) => <li key={v.id}><span>👻 <b>{v.name}</b> <span className="tiny muted">{v.village}</span></span><span className="tiny muted">{v.days} days{v.lives > 1 ? ` · life ${v.lives}` : ''}</span></li>)}
              </ul>
              {ghosts.length > 8 && <p className="tiny muted" style={{ margin: 0 }}>and {ghosts.length - 8} more</p>}
            </>
          )}

          <h3 className="ci-h" style={{ marginTop: 14 }}>Tonight’s choices, ranked</h3>
          <p className="tiny muted" style={{ marginTop: 0 }}>People in danger first, then what you do most. Atlas builds the top one when it can afford it, else saves for it.</p>
          {isle.choices.length ? (
            <ol className="isle-rank">
              {isle.choices.slice(0, 5).map((c, i) => (
                <li key={`${c.key}-${c.village}`} className={i === 0 ? 'first' : ''}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b>{BUILDINGS[c.key].icon} {c.action === 'upgrade' ? `${buildingLabel(c)} → level ${c.level}` : c.action === 'repair' ? `Repair the ${buildingLabel(c)}` : buildingLabel(c)}</b><span className="tiny muted">{c.cost} 🐚</span></div>
                  <div className="life-bar small"><span style={{ width: `${c.score}%` }} /></div>
                  <span className="tiny">{c.why}</span>
                </li>
              ))}
            </ol>
          ) : <p className="muted small">Nothing needs building. Atlas is saving.</p>}

          <h3 className="ci-h" style={{ marginTop: 14 }}>Wonders</h3>
          <p className="tiny muted" style={{ marginTop: 0 }}>Shells alone can’t buy these. Each unlocks by what you do this year, then Atlas clears the Plaza and saves for it.</p>
          <ul className="isle-catalog">
            {isle.wonders.map((w) => {
              const b = BUILDINGS[w.key];
              return (
                <li key={w.key}>
                  <span className="isle-bicon" aria-hidden="true">{b.icon}</span>
                  <div style={{ flex: 1 }}>
                    <b>{b.name}</b> <span className="tiny muted">{w.built ? 'standing' : w.unlocked ? `unlocked ${fmtDate(w.unlocked)} · ${b.cost} 🐚` : `${Math.min(w.progress, w.need)} / ${w.need} ${GOAL[w.key]}`}</span>
                    <div className="tiny">{b.does}</div>
                    {!w.unlocked && !w.built && <div className="life-bar small"><span style={{ width: `${Math.min(100, (w.progress / w.need) * 100)}%`, background: 'var(--gold)' }} /></div>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            {isle.eras.length ? `${isle.eras.length} earlier island${isle.eras.length > 1 ? 's' : ''}. ` : ''}On 31 December Atlas closes the year, writes its chronicle into your vault and sails to a new island. <Link href="/isle/eras">The year so far →</Link>
          </p>
        </section>

        <section className="panel card">
          <h3 className="ci-h">Today so far</h3>
          {isle.today.length ? (
            <ul className="owner-lines">{isle.today.map((e, i) => <li key={i}><span>{e.text}</span><b>+{e.shells}</b></li>)}</ul>
          ) : <p className="muted small">Nothing yet. Tick a quest, lock Dawn, or talk to someone.</p>}

          <h3 className="ci-h" style={{ marginTop: 14 }}>Last nights</h3>
          {isle.reports.length ? (
            <ul className="isle-nights">
              {[...isle.reports].reverse().slice(0, 7).map((n) => (
                <li key={n.night}>
                  <span className="tiny muted">{fmtDate(n.night)}</span>
                  <span>+{n.earned}{n.upkeep ? ` · −${n.upkeep} upkeep` : ''}</span>
                  <span>
                    {n.era ? `⛵ Sailed on from ${n.era} · ` : ''}{n.storm ? `⛈ Storm broke the ${n.storm} · ` : ''}
                    {n.built ? `${BUILDINGS[n.built.key].icon} ${n.built.action === 'upgrade' ? `${buildingLabel(n.built)} to level ${n.built.level}` : n.built.action === 'repair' ? `Mended the ${buildingLabel(n.built)}` : `Built ${buildingLabel(n.built)}`}` : n.saving ? `Saving for ${BUILDINGS[n.saving.key].name}` : 'Quiet'}
                    {n.closed.length ? ` · closed ${n.closed.join(', ')}` : ''}{n.festival ? ` · 🎉 ${n.festival}` : ''}{n.challenge?.settled ? ` · 🎯 ${n.challenge.settled.result === 'won' ? `won +${n.challenge.settled.reward}` : 'missed'}` : ''}
                    {n.unlocked?.length ? ` · unlocked ${n.unlocked.map((w) => BUILDINGS[w].icon).join('')}` : ''}{n.golden ? ' · ✨ Golden Age' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="muted small">No nights yet.</p>}

          <h3 className="ci-h" style={{ marginTop: 14 }}>Buildings</h3>
          <ul className="isle-catalog">
            {BUILDING_KEYS.filter((k) => k in LEVELS).map((k) => {
              const b = BUILDINGS[k];
              const L = LEVELS[k as Levelled];
              const where = isle.levels.filter((x) => x.key === k).map((x) => `${x.village ?? 'the island'}${x.level > 1 ? ` ★${x.level}` : ''}${x.need !== null ? ` (${Math.min(x.count, x.need)}/${x.need} to level ${x.level + 1})` : ''}`);
              return (
                <li key={k}>
                  <span className="isle-bicon" aria-hidden="true">{b.icon}</span>
                  <div>
                    <b>{b.name}</b> <span className="tiny muted">{b.cost} 🐚 · {b.upkeep} 🐚/week · {b.scope === 'village' ? 'per village' : 'one for the island'}</span>
                    <div className="tiny">{b.does}</div>
                    <div className="tiny muted">Levels: {L.effect.join(' → ')}, earned by {L.need.join(' and ')} {L.counts}</div>
                    {where.length > 0 && <div className="tiny" style={{ color: 'var(--wood)' }}>Built: {where.join(', ')}</div>}
                  </div>
                </li>
              );
            })}
          </ul>

          <details className="tiny" style={{ marginTop: 10 }}>
            <summary>How Shells and clocks work</summary>
            <table className="isle-table">
              <tbody>{EARN_ROWS.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b} 🐚</td></tr>)}</tbody>
            </table>
            <p style={{ margin: '6px 0' }}>
              Atlas started this island with {isle.eras.length ? 'a quarter of last year’s treasury' : `${START_GRANT} 🐚`} on {fmtDate(isle.started)}. Upkeep is paid every 7 nights; a building it can’t pay for closes until there’s money again.
              {' '}{STORM_AFTER} days in a row with nothing earned bring a storm that breaks a building until Atlas mends it. Calm villages (nobody sick, fewer than three ghosts) hold a festival every two weeks.
              {' '}Add <code>birthday: 04-12</code> to a person’s note for birthday reminders.
            </p>
            <table className="isle-table">
              <tbody>{(Object.keys(CLOCK) as Circle[]).map((c) => <tr key={c}><td>{CLOCK[c].label}</td><td>sick at {CLOCK[c].sick} days, ghost after {CLOCK[c].dead}</td></tr>)}</tbody>
            </table>
            <p style={{ margin: '6px 0 0' }}>Set someone’s clock on their pin, or with <code>circle: close</code> in their note. People who have passed away: <code>in_memoriam: true</code>.</p>
          </details>
        </section>
      </div>
    </div>
  );
}
