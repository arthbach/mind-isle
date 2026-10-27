import { headers } from 'next/headers';
import { Checkin } from '@/components/Checkin';
import { GameWindow } from '@/components/GameWindow';
import { Hud } from '@/components/Hud';
import { IslandView } from '@/components/IslandView';
import { LiveProvider } from '@/components/LiveSessions';
import { islandData } from '@/lib/island-data';
import { liveSnapshot } from '@/lib/sessions';
import { getWorld } from '@/lib/world';

export const dynamic = 'force-dynamic';

// The island is the game world: always full screen, with the HUD on top. Every other page opens as a window over it.
export default async function PalaceLayout({ children }: { children: React.ReactNode }) {
  const [w, live] = await Promise.all([getWorld(), liveSnapshot()]);
  const path = (await headers()).get('x-pathname') ?? '/';
  // The check-in comes first: on any page except /today itself, it opens on top until done or skipped.
  const gate = path !== '/today' && !w.readOnly ? w.checkin.gate : null;
  const island = islandData(w);
  return (
    <LiveProvider initial={live}>
      <div className="game" inert={gate ? true : undefined} aria-hidden={gate ? true : undefined}>
        <IslandView data={island} />
        <GameWindow>{children}</GameWindow>
        <Hud
          d={{
            title: w.title, owner: w.owner, date: w.today, level: w.xp.level, className: w.className,
            xp: { into: w.xp.into, need: w.xp.need, total: w.xp.total }, counts: island.counts,
            pending: live.pending, demo: w.isDemo, readOnly: w.readOnly,
          }}
        />
      </div>
      {gate && (
        <div className="gate" role="dialog" aria-modal="true" aria-label={gate === 'dawn' ? 'Dawn check-in' : 'Dusk check-in'}>
          <div className="gate-inner">
            <Checkin world={w} />
          </div>
        </div>
      )}
    </LiveProvider>
  );
}
