import { WorldSettings } from '@/components/Settings';
import { getWorld } from '@/lib/world';

export default async function WorldSettingsPage() {
  const w = await getWorld();
  return <WorldSettings auto={w.season.auto} autoLabel={w.season.label} hasBets={w.bets.length > 0} />;
}
