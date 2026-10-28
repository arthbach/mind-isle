import { headers } from 'next/headers';
import { Checkin } from '@/components/Checkin';
import { GameWindow } from '@/components/GameWindow';
import { Hud } from '@/components/Hud';
import { IslandView } from '@/components/IslandView';
import { LiveProvider } from '@/components/LiveSessions';
import { config } from '@/lib/config';
import { islandData } from '@/lib/island-data';
import { liveSnapshot } from '@/lib/sessions';
import { pendingSessions } from '@/lib/summaries';
import { readSettings } from '@/lib/settings';
import { getWorld } from '@/lib/world';
import { getIsle } from '@/lib/civ';

export const dynamic = 'force-dynamic';

// The island is the game world: always full screen, with the HUD on top. Every other page opens as a window over it.
export default async function PalaceLayout({ children }: { children: React.ReactNode }) {
  // Waiting sessions only matter when they can be saved.
  const [w, live, pending, settings, isle] = await Promise.all([getWorld(), liveSnapshot(), config.readOnly ? [] : pendingSessions(), readSettings(), getIsle()]);
  const path = (await headers()).get('x-pathname') ?? '/';
  // The check-in comes first: on any page except /today itself, it opens on top until done or skipped.
  const gate = path !== '/today' && !w.readOnly ? w.checkin.gate : null;
  const scrolls: Record<string, number> = {};
  for (const v of pending) if (v.project) scrolls[v.project.id] = (scrolls[v.project.id] ?? 0) + 1;
  const island = { ...islandData(w, isle), scrolls };
  const alive = isle.villagers.filter((v) => ['thriving', 'idle', 'sick'].includes(v.life)).length;
  const ghosts = isle.villagers.filter((v) => v.life === 'ghost').length;
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
            avatar: { personality: settings.personality, look: settings.look },
            isle: { balance: isle.balance, alive, ghosts, people: isle.villagers.length },
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
