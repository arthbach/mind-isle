import Link from 'next/link';
import { TrophyGrid } from '@/components/TrophyGrid';
import { getWorld } from '@/lib/world';

export default async function TrophiesPage() {
  const w = await getWorld();
  return (
    <div className="panel card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Trophy Hall</h2>
          <p className="sub">
            Notes with <code>type: achievement</code>, plus projects you shipped and island badges. Only trophies with <code>public: true</code> appear in the public hall.
          </p>
        </div>
        <Link className="btn" href="/hall">See the public hall ↗</Link>
      </div>
      <TrophyGrid items={w.achievements} vaultName={w.vaultName} showVisibility />
    </div>
  );
}
