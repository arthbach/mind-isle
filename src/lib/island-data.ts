import type { IslandData } from '@/components/IslandView';
import { RULES } from './game';
import type { World } from './types';

/** What the island and the HUD need from the compiled world. */
export function islandData(w: World): IslandData {
  const active = w.projects.filter((p) => p.status === 'active');
  return {
    projects: w.projects,
    villages: w.villages,
    beliefs: w.beliefs,
    decisions: w.decisions.slice(0, 10),
    bets: w.bets,
    vaultName: w.vaultName,
    readOnly: w.readOnly,
    season: { auto: w.season.auto, label: w.season.label },
    counts: {
      active: active.length,
      weedy: active.filter((p) => (p.days ?? 999) > RULES.weeds).length,
      warm: w.people.filter((p) => p.tier === 'warm').length,
      people: w.people.length,
      due: w.decisions.filter((d) => d.state === 'due').length,
      unconfirmed: w.beliefs.filter((b) => b.status === 'proposed').length,
      trophies: w.achievements.filter((a) => !a.locked).length,
    },
  };
}
