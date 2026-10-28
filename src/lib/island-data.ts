import type { IslandData, IsleData } from '@/components/IslandView';
import type { IsleView } from './civ';
import { RULES } from './game';
import type { World } from './types';

/** What the island and the HUD need from the compiled world. */
export function islandData(w: World, isle?: IsleView): IslandData {
  const active = w.projects.filter((p) => p.status === 'active');
  return {
    projects: w.projects,
    villages: w.villages,
    beliefs: w.beliefs,
    decisions: w.decisions.slice(0, 10),
    bets: w.bets,
    vaultName: w.vaultName,
    readOnly: w.readOnly,
    today: w.today,
    isle: isle ? isleData(isle) : undefined,
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

/** The slice of the civilization the island draws. */
export function isleData(v: IsleView): IsleData {
  return {
    balance: v.balance,
    era: v.era,
    life: Object.fromEntries(v.villagers.map((x) => [x.id, {
      life: x.life, days: x.days, lives: x.lives, left: x.left, circle: x.circle, sick: x.sick, dead: x.dead, about: x.about,
      birthday: v.birthdays.some((b) => b.in === 0 && b.name === x.name),
    }])),
    villages: Object.fromEntries(v.villages.map((x) => [x.name, { size: x.size, festival: x.festival, buildings: x.buildings }])),
    isleBuildings: v.isleBuildings,
    plaza: v.plaza,
    wonders: v.wonders.filter((w) => w.built).map((w) => w.key),
    statues: v.statues,
    golden: !!v.golden,
  };
}
