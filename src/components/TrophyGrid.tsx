import { fmtDate, obsidianLink } from '@/lib/game';
import type { Achievement } from '@/lib/types';
import { Sprite } from './Sprite';

export function TrophyGrid({ items, vaultName, showVisibility }: { items: Achievement[]; vaultName?: string; showVisibility: boolean }) {
  const cats = [...new Set(items.map((t) => t.category))];
  if (!items.length) return <div className="empty" style={{ marginTop: 14 }}>No trophies here yet.</div>;
  return (
    <>
      {cats.map((c) => {
        const group = items.filter((t) => t.category === c);
        return (
          <section key={c}>
            <div className="cat"><h3>{c}</h3><span className="tiny muted">{group.length}</span></div>
            <div className="tgrid">
              {group.map((t) => (
                <div key={t.id} className={`trophy ${t.locked ? 'locked' : ''}`}>
                  <Sprite name={t.icon} />
                  <div>
                    <h4>{t.title}</h4>
                    {t.detail && <p>{t.detail}</p>}
                    {t.warning && <div className="warn">⚠ {t.warning}</div>}
                    <div className="row" style={{ gap: 6 }}>
                      {t.date && <span className="tiny muted">{/^\d{4}-\d{2}-\d{2}$/.test(t.date) ? fmtDate(t.date) : t.date}</span>}
                      {showVisibility && <span className={`pill ${t.isPublic ? 'on' : ''}`}>{t.isPublic ? 'Public' : 'Private'}</span>}
                      {vaultName && t.path && <a className="tiny" href={obsidianLink(vaultName, t.path)}>source</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
