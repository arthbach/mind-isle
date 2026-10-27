import { SealVote } from '@/components/Boards';
import { fmtDate, obsidianLink, RULES } from '@/lib/game';
import { getWorld } from '@/lib/world';

const SEAL_TEXT = { sealed: 'SEAL', due: 'OPEN', judged: 'DONE' } as const;

export default async function CodexPage() {
  const w = await getWorld();
  const judged = w.decisions.filter((d) => d.verdict);
  const right = judged.filter((d) => d.verdict === 'Right call').length;
  const due = w.decisions.filter((d) => d.state === 'due');
  const list = [...due, ...w.decisions.filter((d) => d.state !== 'due')];
  return (
    <div className="panel card">
      <h2>The Codex</h2>
      <p className="sub">
        Every decision is sealed along with its context. When the seal cracks ({RULES.review} days later, or on its <code>review_on</code> date) you judge it.
        The game scores your judgement, not how much you write.
      </p>
      <div className="calib">
        <div className="stat"><div className="n">{w.decisions.length}</div><div className="l">decisions</div></div>
        <div className="stat"><div className="n">{due.length}</div><div className="l">ready to judge</div></div>
        <div className="stat"><div className="n">{judged.length}</div><div className="l">judged</div></div>
        <div className="stat"><div className="n">{judged.length ? `${Math.round((right / judged.length) * 100)}%` : '—'}</div><div className="l">right calls</div></div>
      </div>
      {list.length ? (
        <ul className="list" style={{ marginTop: 14 }}>
          {list.map((d) => (
            <li key={d.id} className="item scroll">
              <div className={`seal ${d.state}`}>{SEAL_TEXT[d.state]}</div>
              <div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h4 className={d.isPrivate ? 'lock' : ''}>{d.title}</h4>
                  <span className="tiny muted">{fmtDate(d.date)}</span>
                </div>
                <p><span className="pill">{d.domain}</span> {d.context}</p>
                <p className="small" style={{ marginTop: 4 }}>
                  {d.state === 'sealed' && `Seal cracks on ${fmtDate(d.reviewOn)}`}
                  {d.state === 'due' && <><b style={{ color: 'var(--cool)' }}>Ready to judge.</b> {d.question}</>}
                  {d.state === 'judged' && <>Verdict: <b>{d.verdict}</b></>}
                </p>
                {d.state === 'due' && <SealVote d={d} readOnly={w.readOnly} />}
                <p className="tiny" style={{ marginTop: 4 }}><a href={obsidianLink(w.vaultName, d.path)}>Source note</a></p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty" style={{ marginTop: 14 }}>
          No decisions yet. Add a <code>## Decisions</code> list to a meeting or daily note, or create a note with <code>type: decision</code>.
        </div>
      )}
    </div>
  );
}
