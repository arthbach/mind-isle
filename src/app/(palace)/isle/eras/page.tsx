import Link from 'next/link';
import { getIsle, yearSoFar, type EraRecord } from '@/lib/civ';
import { chronicle, eraNote } from '@/lib/civ/era';
import { BUILDINGS } from '@/lib/civ/rules';
import { obsidianLink } from '@/lib/game';
import { getWorld } from '@/lib/world';

function Chronicle({ r, closed, href }: { r: EraRecord; closed: boolean; href?: string }) {
  const c = chronicle(r, closed);
  return (
    <section className="panel card era-card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>{closed ? '🏝' : '⛵'} {c.title}{closed ? '' : ' (so far)'}</h2>
        {href && <a className="tiny" href={href}>Open the chronicle in Obsidian</a>}
      </div>
      {c.paragraphs.map((p, i) => <p key={i} className="small" style={{ margin: 0 }}>{p}</p>)}
      <table className="isle-table"><tbody>{c.facts.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody></table>
      {r.built.length > 0 && (
        <p className="tiny muted" style={{ margin: 0 }}>Built: {r.built.map((b) => `${BUILDINGS[b.key].icon} ${BUILDINGS[b.key].name}${b.village ? ` (${b.village})` : ''}${b.level > 1 ? ` ★${b.level}` : ''}`).join(' · ')}</p>
      )}
    </section>
  );
}

// F4: every year is its own island. Past ones are read-only; this one is still being written.
export default async function ErasPage() {
  const [isle, now, w] = await Promise.all([getIsle(), yearSoFar(), getWorld()]);
  return (
    <div className="isle-page">
      <section className="panel card">
        <h2 style={{ margin: 0 }}>Eras</h2>
        <p className="small" style={{ margin: '4px 0 0' }}>
          Each year is one island. On New Year’s night Atlas writes the year’s chronicle into <code>Mind Isle/Eras/</code> in your vault and sails to new land,
          taking your people (alive or not), a quarter of the treasury, blueprints at half price, and a statue of every Wonder. The old island stays as it was.
        </p>
        <p className="tiny" style={{ margin: '6px 0 0' }}><Link href="/isle">← Treasury</Link></p>
      </section>
      <Chronicle r={now} closed={false} />
      {[...isle.eras].reverse().map((r) => <Chronicle key={r.year} r={r} closed href={obsidianLink(w.vaultName, eraNote(r.year))} />)}
      {!isle.eras.length && <p className="muted small" style={{ margin: 0 }}>No earlier islands yet. The first one closes on 31 December {isle.era}.</p>}
    </div>
  );
}
