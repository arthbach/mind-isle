// Civilization (roadmap §12): every number the game uses, in one place.

export type Circle = 'close' | 'client' | 'network';
/** `unknown`: a person note with no contact ever logged. `spirit`: in memoriam. */
export type Life = 'thriving' | 'idle' | 'sick' | 'ghost' | 'spirit' | 'unknown';

/** Days without contact until a villager is sick, and until they die. */
export const CLOCK: Record<Circle, { sick: number; dead: number; label: string }> = {
  close: { sick: 10, dead: 21, label: 'Close circle' },
  client: { sick: 14, dead: 30, label: 'Client' },
  network: { sick: 45, dead: 90, label: 'Network' },
};
/** Idle from this share of the way to sick. */
export const IDLE_AT = 0.6;
/** Extra days a Clinic gives before death. */
export const CLINIC_GRACE = 7;

export const EARN = {
  quest: { high: 3, medium: 2, low: 1, none: 1 },
  /** A Dawn plan item marked done at Dusk. */
  plan: 2,
  dawn: 2,
  dusk: 2,
  talk: 3,
  rebirth: 10,
  projectLog: 1,
  summary: 1,
  judged: 2,
} as const;
/** Ticked quests that pay per day, so clearing an old backlog can't flood the treasury. */
export const QUEST_CAP = 10;
/** What the Owner starts with. */
export const START_GRANT = 30;
/** On the first run the Owner arrives this many days back, so there's a first night to report. */
export const BACKFILL_DAYS = 7;
/** Upkeep is paid every this many nights. */
export const UPKEEP_EVERY = 7;

export type BuildingKey = 'clinic' | 'post' | 'shrine' | 'tavern' | 'library' | 'market' | 'plaza' | 'lighthouse' | 'tree' | 'archive';
export type Scope = 'village' | 'isle' | 'land' | 'wonder';
export interface BuildingDef { name: string; icon: string; cost: number; upkeep: number; scope: Scope; does: string }
export const BUILDINGS: Record<BuildingKey, BuildingDef> = {
  clinic: { name: 'Clinic', icon: '🏥', cost: 45, upkeep: 2, scope: 'village', does: `Sick villagers get ${CLINIC_GRACE} more days before they die` },
  post: { name: 'Post Office', icon: '📮', cost: 40, upkeep: 1, scope: 'village', does: 'Each Dawn, Atlas suggests a message for one sick villager' },
  shrine: { name: 'Shrine', icon: '⛩', cost: 60, upkeep: 1, scope: 'village', does: 'Bringing someone here back pays 15 🐚 instead of 10' },
  tavern: { name: 'Tavern', icon: '🍺', cost: 60, upkeep: 2, scope: 'village', does: 'Conversations with people here pay 4 🐚 instead of 3' },
  library: { name: 'Library', icon: '📚', cost: 70, upkeep: 2, scope: 'isle', does: 'Every session note pays 2 🐚 instead of 1' },
  market: { name: 'Market', icon: '🏪', cost: 55, upkeep: 2, scope: 'isle', does: 'High-priority quests pay 4 🐚 instead of 3' },
  plaza: { name: 'Plaza', icon: '🏗', cost: 60, upkeep: 0, scope: 'land', does: 'New land cleared south of Home, where Wonders stand' },
  lighthouse: { name: 'Great Lighthouse', icon: '🗼', cost: 150, upkeep: 0, scope: 'wonder', does: 'Every sick villager on the island gets 3 more days' },
  tree: { name: 'World Tree', icon: '🌳', cost: 150, upkeep: 0, scope: 'wonder', does: 'Bringing anyone back pays 5 🐚 more' },
  archive: { name: 'Grand Archive', icon: '🏛', cost: 180, upkeep: 0, scope: 'wonder', does: 'Locking Dawn and closing Dusk pay 3 🐚 each' },
};
export const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKey[];
export const WONDERS = ['lighthouse', 'tree', 'archive'] as const;
export type WonderKey = (typeof WONDERS)[number];
/** What unlocks each Wonder (in the current Era). */
export const WONDER_GOAL: Record<WonderKey, { need: number; what: string }> = {
  lighthouse: { need: 60, what: 'nights in a row with nobody dying' },
  tree: { need: 20, what: 'people brought back' },
  archive: { need: 60, what: 'Dawns locked' },
};
export const LIGHTHOUSE_GRACE = 3;
export const TREE_BONUS = 5;

// ---------------------------------------------------------------- levels (F3)
// Levels are earned by behaviour since the building went up, then paid for by the Owner.
export type Levelled = 'clinic' | 'post' | 'shrine' | 'tavern' | 'library' | 'market';
export const LEVELS: Record<Levelled, { counts: string; need: [number, number]; effect: [string, string, string] }> = {
  clinic: { counts: 'people brought back in this village', need: [3, 10], effect: ['+7 days', '+10 days', '+14 days'] },
  post: { counts: 'conversations in this village', need: [10, 30], effect: ['1 letter idea', '2 letter ideas', '3 letter ideas'] },
  shrine: { counts: 'people brought back in this village', need: [3, 8], effect: ['15 🐚', '18 🐚', '20 🐚'] },
  tavern: { counts: 'festivals in this village', need: [1, 4], effect: ['+1 🐚', '+2 🐚', '+3 🐚'] },
  library: { counts: 'session notes', need: [20, 50], effect: ['+1 🐚', '+2 🐚', '+3 🐚'] },
  market: { counts: 'quests done', need: [40, 120], effect: ['high +1 🐚', 'high and medium +1 🐚', 'every quest +1 🐚'] },
};
export const CLINIC_GRACE_AT = [0, CLINIC_GRACE, 10, 14];
export const SHRINE_PAY_AT = [EARN.rebirth, 15, 18, 20];
/** Upgrade cost as a share of the building's price: to level 2, to level 3. */
export const UPGRADE_COST = [0.6, 1];

// ---------------------------------------------------------------- events (F3)
/** Days between festivals in one village (a Golden Age halves it). */
export const FESTIVAL_GAP = 14;
/** A festival can't happen in a village with this many ghosts. */
export const FESTIVAL_MAX_GHOSTS = 3;
/** Extra shells for every conversation in a festival village on its day. */
export const FESTIVAL_BONUS = 3;
export const BIRTHDAY_BONUS = 5;
/** Quiet days in a row (nothing earned) that bring a storm, and the least time between storms. */
export const STORM_AFTER = 3;
export const STORM_GAP = 7;
/** Repair cost as a share of the building's price. */
export const REPAIR_SHARE = 0.25;
/** The weekly challenge's reward: base + per person to reach. */
export const CHALLENGE_REWARD = { base: 15, each: 5 };

// ---------------------------------------------------------------- eras (F4)
/** On New Year's night the Owner sails on with this share of the treasury. */
export const ERA_CARRY = 0.25;
/** Rebuilding something the Owner built on an earlier island costs this share. */
export const BLUEPRINT_SHARE = 0.5;

/** Village size by how many people in it are thriving. */
export function sizeOf(thriving: number): string {
  return thriving >= 15 ? 'City' : thriving >= 10 ? 'Town' : thriving >= 6 ? 'Village' : thriving >= 3 ? 'Hamlet' : thriving >= 1 ? 'Camp' : 'Ruins';
}
