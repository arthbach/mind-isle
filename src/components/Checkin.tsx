import { checkinProps } from '@/lib/checkin-props';
import type { World } from '@/lib/types';
import { DayCheckin } from './DayCheckin';

/** The one check-in. /today renders it in the page; the check-in gate renders the same thing over other pages. */
export function Checkin({ world }: { world: World }) {
  return <DayCheckin {...checkinProps(world)} canSkip={!!world.checkin.gate} />;
}
