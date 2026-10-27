import { Sprite } from '@/components/Sprite';
import { getWorld } from '@/lib/world';

export default async function CharacterPage() {
  const w = await getWorld();
  const dailies = w.calendar.filter((d) => d.kind === 'daily').length;
  return (
    <div className="char">
      <div className="panel card" style={{ textAlign: 'center' }}>
        <Sprite name="traveler" className="bigport" />
        <h2>{w.owner}</h2>
        <p className="small muted" style={{ margin: '2px 0 8px' }}>{w.className}</p>
        <span className="chip">Level {w.xp.level} · {w.xp.total} XP</span>
        <p className="tiny muted" style={{ marginTop: 10 }}>Your class is your strongest attribute. Every point comes from your vault.</p>
      </div>
      <div className="panel card">
        <h2>Attributes</h2>
        <div style={{ marginTop: 8 }}>
          {w.attributes.map((a) => (
            <div key={a.key}>
              <div className="bar">
                <span>{a.label}</span>
                <span className="track"><i style={{ width: `${a.value}%`, background: a.color }} /></span>
                <span className="px">{a.value}</span>
              </div>
              <div className="tiny muted bar-detail">{a.detail}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel card">
        <h2>Streak</h2>
        <p className="sub">Last 13 weeks: {dailies} check-ins.</p>
        <div className="cal">
          {w.calendar.map((d) => <span key={d.date} className={`${d.kind ?? ''} ${d.date === w.today ? 'today' : ''}`} title={d.date} />)}
        </div>
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>
          <span className="pill on">daily note</span>{' '}
          <span className="pill" style={{ background: 'color-mix(in srgb, var(--wood) 40%, var(--panel-3))' }}>edited notes only</span>{' '}
          <span className="pill" style={{ background: 'repeating-linear-gradient(45deg, var(--panel-3) 0 3px, color-mix(in srgb, var(--fade) 60%, var(--panel-3)) 3px 5px)' }}>skipped</span>
        </p>
        <h3 style={{ marginTop: 16 }}>How XP is earned</h3>
        <ul className="small" style={{ paddingLeft: 18, margin: '6px 0 0' }}>
          <li>Daily note: 20</li>
          <li>Task ticked off anywhere: 10</li>
          <li>Decision judged: 25</li>
          <li>Belief confirmed or adjusted: 15</li>
          <li>Warm lantern: 5 each</li>
          <li>Project shipped: 100</li>
          <li>Trophy earned: 50</li>
        </ul>
      </div>
    </div>
  );
}
