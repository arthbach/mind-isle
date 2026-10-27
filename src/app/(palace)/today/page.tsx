import { Lanterns, QuestBoard, SealVote } from '@/components/Boards';
import { Checkin } from '@/components/Checkin';
import { fmtDate } from '@/lib/game';
import { getWorld } from '@/lib/world';

export default async function TodayPage() {
  const w = await getWorld();
  const due = w.decisions.filter((d) => d.state === 'due').slice(0, 3);
  return (
    <div className="stack">
      <Checkin world={w} />
      <div className="three">
        <div className="panel card">
          <h2>Tick off a quest</h2>
          <p className="sub">Finished a task from your vault? Check it here and it’s marked done in its note.</p>
          <QuestBoard quests={w.quests} total={w.questTotal} vaultName={w.vaultName} readOnly={w.readOnly} />
        </div>
        <div className="panel card">
          <h2>Fading lanterns</h2>
          <p className="sub">People who come up often in your notes but have gone quiet.</p>
          <Lanterns people={w.lanterns} vaultName={w.vaultName} readOnly={w.readOnly} />
        </div>
        <div className="panel card">
          <h2>Seals cracking</h2>
          <p className="sub">Decisions old enough to judge.</p>
          {due.length ? (
            <ul className="list">
              {due.map((d) => (
                <li key={d.id} className="item">
                  <h4>{d.title}</h4>
                  <p>Sealed {fmtDate(d.date)} · {d.domain}</p>
                  {d.question && <p><i>{d.question}</i></p>}
                  <SealVote d={d} readOnly={w.readOnly} />
                </li>
              ))}
            </ul>
          ) : <div className="empty">No seals have cracked yet.</div>}
        </div>
      </div>
    </div>
  );
}
