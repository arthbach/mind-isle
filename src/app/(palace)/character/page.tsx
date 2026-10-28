import { AvatarEditor } from '@/components/AvatarEditor';
import { readSettings } from '@/lib/settings';
import { getWorld } from '@/lib/world';

export default async function CharacterPage() {
  const [w, settings] = await Promise.all([getWorld(), readSettings()]);
  const dailies = w.calendar.filter((d) => d.kind === 'daily').length;
  return (
    <div className="char">
      <div className="panel card" style={{ textAlign: 'center' }}>
        <h2>{w.owner}</h2>
        <p className="small muted" style={{ margin: '2px 0 8px' }}>{w.className}</p>
        <span className="chip">Level {w.xp.level} · {w.xp.total} XP</span>
        <AvatarEditor personality={settings.personality} look={settings.look} readOnly={w.readOnly} />
      </div>
      <div className="panel card">
        <h2>Attributes</h2>
        <p className="sub">
          The last 30 days, from your vault and agent sessions. 50 is your usual pace (your average over 90 days), 100 is twice that;
          Follow-through and Chronicler are plain percentages. Your class is this month’s strongest attribute.
        </p>
        <div style={{ marginTop: 8 }}>
          {w.attributes.map((a) => (
            <div key={a.key}>
              <div className="bar">
                <span>{a.label}</span>
                <span className="track"><i style={{ width: `${a.value}%`, background: a.color }} /></span>
                <span className="px">{a.value}</span>
              </div>
              <div className="tiny muted bar-detail">{a.detail}</div>
              {a.why && (
                <details className="why">
                  <summary className="tiny">why?</summary>
                  <table className="tiny">
                    <thead><tr><th /><th>last 30 days</th><th>usual 30 days</th></tr></thead>
                    <tbody>{a.why.map((x) => <tr key={x.label}><td>{x.label}</td><td>{x.recent}</td><td>{x.usual}</td></tr>)}</tbody>
                  </table>
                </details>
              )}
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
