import { getIsle, ownerSays } from '@/lib/civ';
import { challengeData } from './IsleUI';
import { checkinProps } from '@/lib/checkin-props';
import { addDays } from '@/lib/game';
import { pendingSessions, retentionWarning } from '@/lib/summaries';
import type { World } from '@/lib/types';
import { todaysQuestion } from '@/lib/worldview';
import { DayCheckin } from './DayCheckin';
import type { Scroll } from './SummariesUI';

/** The one check-in. /today renders it in the page; the check-in gate renders the same thing over other pages. */
export async function Checkin({ world }: { world: World }) {
  // Sessions waiting for a yes ("pending scrolls"): batched at Dusk, with a warning at Dawn before transcripts expire.
  const [pending, retention, question] = world.readOnly ? [[], null, null] : await Promise.all([pendingSessions(), retentionWarning(), todaysQuestion()]);
  const scrolls: Scroll[] = pending.map((v) => ({
    id: v.id, title: v.title, project: v.project ? { rel: v.project.rel, name: v.project.name } : null,
    folder: v.cwdShort, activeMin: v.activeMin, files: v.files.slice(0, 3), fileCount: v.files.length, endedAt: v.lastEventAt,
  }));
  // Atlas's report on last night, shown at Dawn.
  const isle = await getIsle();
  const r = isle.report && isle.report.night === addDays(world.today, -1) ? isle.report : null;
  const night = r ? {
    message: ownerSays(r, isle.balance), earned: r.earned, balance: isle.balance,
    built: r.built ? { key: r.built.key, village: r.built.village } : null,
    lines: r.lines.map((l) => ({ text: l.text, shells: l.shells })), letters: r.letters,
    birthdays: isle.birthdays.filter((b) => b.in <= 3).map((b) => ({ name: b.name, in: b.in })),
    challenge: isle.challenge ? challengeData(isle.challenge) : null,
  } : null;
  return <DayCheckin {...checkinProps(world)} canSkip={!!world.checkin.gate} scrolls={scrolls} retention={retention} question={question} night={night} />;
}
