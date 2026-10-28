import { RULES } from './game';
import type { World } from './types';

/** Everything the check-in needs, derived from the world. Used by /today and the check-in gate. */
export function checkinProps(w: World) {
  const active = w.projects.filter((p) => p.status === 'active');
  const docked = w.bets.filter((b) => b.status === 'ready').sort((a, b) => (b.days ?? 0) - (a.days ?? 0))[0];
  return {
    day: w.day,
    owner: w.owner,
    readOnly: w.readOnly,
    initialMode: w.checkin.mode,
    quests: w.quests,
    questTotal: w.questTotal,
    vaultName: w.vaultName,
    ctx: {
      projects: w.projects.map((p) => ({ id: p.id, name: p.name, aliases: p.aliases })),
      people: w.people.map((p) => ({ name: p.name, aliases: p.aliases })),
      bets: w.bets.map((b) => b.title),
    },
    atlas: {
      active: active.length,
      weedy: active.filter((p) => (p.days ?? 999) > RULES.weeds).length,
      docked: docked ? `${docked.title} has been sitting at the dock${docked.days ? ` for ${docked.days} days` : ''}.` : null,
    },
  };
}
