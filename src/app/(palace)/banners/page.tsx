import { BeliefCard } from '@/components/IslandView';
import { getWorld } from '@/lib/world';

const TEMPLATE = `---
type: belief
status: proposed      # proposed | confirmed | adjusted | rejected
confidence: 2         # 1–3: how sure you are this is really you
evidence: "Where this shows up in your notes"
---

Optional longer explanation.`;

export default async function BannersPage() {
  const w = await getWorld();
  const decided = w.beliefs.filter((b) => b.status !== 'proposed').length;
  return (
    <div className="two">
      <div className="panel card">
        <h2>Banner Wall: what you believe</h2>
        <p className="sub">
          Each banner carries its evidence and a confidence level. Proposed banners fly white with a “?” until you confirm, adjust or reject them.
          Your answer is written back into the note.
        </p>
        <div className="prog"><i style={{ width: `${w.beliefs.length ? (decided / w.beliefs.length) * 100 : 0}%` }} /></div>
        <p className="tiny muted">{decided} of {w.beliefs.length} decided</p>
        {w.beliefs.length ? (
          <ul className="list">
            {w.beliefs.map((b) => <li key={b.id} className="item"><BeliefCard b={b} vaultName={w.vaultName} readOnly={w.readOnly} /></li>)}
          </ul>
        ) : <div className="empty">No banners yet. Create a note with <code>type: belief</code>.</div>}
      </div>
      <div className="panel card">
        <h2>Raising a banner</h2>
        <p className="sub">
          A belief is a note named after the statement itself, for example <i>“Ship small, ship often.md”</i>.
          You can write them yourself, or let an AI assistant read your vault and propose some for you to confirm here.
        </p>
        <pre className="code">{TEMPLATE}</pre>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          When you change your mind, edit the note. Obsidian’s file history keeps the old version, like patch notes for your mind.
        </p>
      </div>
    </div>
  );
}
