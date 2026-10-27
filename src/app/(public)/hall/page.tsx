import type { Metadata } from 'next';
import { Sprite } from '@/components/Sprite';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TrophyGrid } from '@/components/TrophyGrid';
import { config } from '@/lib/config';
import { getWorld } from '@/lib/world';

export const metadata: Metadata = { title: `${config.owner} · Trophy Hall` };

/** Public page: only achievements explicitly marked `public: true`. Nothing else from the vault is rendered here. */
export default async function HallPage() {
  const w = await getWorld();
  const items = w.achievements.filter((a) => a.isPublic && !a.auto);
  return (
    <>
      <header className="top panel">
        <div className="brand">
          <Sprite name="traveler" className="portrait" style={{ width: 48, height: 48, flexBasis: 48 }} />
          <div>
            <h1>{w.owner}’s Trophy Hall</h1>
            <p>Milestones and work worth showing</p>
          </div>
        </div>
        <ThemeToggle />
      </header>
      <div className="panel card" style={{ marginTop: 16 }}>
        <TrophyGrid items={items} showVisibility={false} />
      </div>
    </>
  );
}
