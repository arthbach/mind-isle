export type Tier = 'warm' | 'cooling' | 'fading' | 'fog';
export type ProjectStatus = 'active' | 'blocked' | 'paused' | 'maintenance' | 'done' | 'stopped';

export interface Project {
  id: string;
  name: string;
  path: string;
  client: string;
  status: ProjectStatus;
  lastActivity: string | null;
  days: number | null;
  deadline: string | null;
  venture: boolean;
  summary: string;
  aliases: string[];
  /** Dated lines from the note's `## Log`, newest first. */
  log: { date: string; text: string }[];
}

export interface Person {
  id: string;
  name: string;
  path: string;
  company: string;
  role: string;
  aliases: string[];
  lastContact: string | null;
  days: number | null;
  tier: Tier;
  mentions: number;
}

export interface Village {
  name: string;
  people: Person[];
}

export type DecisionState = 'sealed' | 'due' | 'judged';

export interface Decision {
  id: string;
  title: string;
  date: string | null;
  domain: string;
  path: string;
  context: string;
  question: string;
  reviewOn: string | null;
  state: DecisionState;
  verdict: string | null;
  isPrivate: boolean;
}

export type BeliefStatus = 'proposed' | 'confirmed' | 'adjusted' | 'rejected';

export type WorldviewArea = 'values' | 'faith' | 'civic';

/** A worldview banner: sensitive, owner-only, never on /hall or the island, never AI context unless `useInAi`. */
export interface WorldviewBanner {
  id: string;
  text: string;
  area: WorldviewArea;
  status: BeliefStatus;
  /** 'scan' and 'interview' were proposed by Mind Isle; 'manual' the user wrote. */
  source: 'scan' | 'interview' | 'manual';
  evidence: { quote: string; note: string | null }[];
  useInAi: boolean;
  path: string;
  created: string | null;
}

export interface Belief {
  id: string;
  text: string;
  evidence: string;
  confidence: number;
  status: BeliefStatus;
  path: string;
}

export type TrophyIcon = 'cup' | 'medal' | 'book' | 'star' | 'scar' | 'build' | 'lock';

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  date: string | null;
  category: string;
  isPublic: boolean;
  locked: boolean;
  icon: TrophyIcon;
  path: string | null;
  warning: string;
  auto: boolean;
}

export type BetStatus = 'draft' | 'ready' | 'sent' | 'rejected' | 'offer';

/** Outbound bets: applications, pitches, proposals. Always private. */
export interface Bet {
  id: string;
  title: string;
  kind: string;
  status: BetStatus;
  date: string | null;
  days: number | null;
  note: string;
  path: string;
}

export type Priority = 'high' | 'medium' | 'low' | null;

export interface Quest {
  id: string;
  text: string;
  due: string | null;
  overdue: boolean;
  priority: Priority;
  tags: string[];
  path: string;
  line: number;
  source: string;
  isPrivate: boolean;
}

export type PlanStatus = 'done' | 'partly' | 'moved' | null;

export interface DayEntry {
  date: string;
  exists: boolean;
  energy: number | null;
  plan: { text: string; status: PlanStatus }[];
  done: string[];
  people: string[];
  decisions: string[];
  locked: boolean;
  closed: boolean;
  skipped: ('dawn' | 'dusk')[];
}

export interface Attribute {
  key: string;
  label: string;
  /** 0–100 over the last 30 days. */
  value: number;
  detail: string;
  color: string;
  /** The "why?" breakdown: each input over the last 30 days next to the user's usual 30 days. */
  why?: { label: string; recent: string; usual: string }[];
}

export interface CalendarDay {
  date: string;
  kind: 'daily' | 'skipped' | 'capture' | null;
}

export interface World {
  title: string;
  owner: string;
  today: string;
  vaultName: string;
  readOnly: boolean;
  isDemo: boolean;
  noteCount: number;
  projects: Project[];
  people: Person[];
  villages: Village[];
  lanterns: Person[];
  decisions: Decision[];
  beliefs: Belief[];
  /** Kept apart from `beliefs`, which feed the island and other views. */
  worldview: WorldviewBanner[];
  achievements: Achievement[];
  bets: Bet[];
  quests: Quest[];
  questTotal: number;
  day: DayEntry;
  calendar: CalendarDay[];
  xp: { total: number; level: number; into: number; need: number };
  attributes: Attribute[];
  className: string;
  checkin: { mode: 'dawn' | 'dusk'; gate: 'dawn' | 'dusk' | null; duskFrom: string };
  season: { auto: import('./seasons').Season; label: string; region: string };
}

/** What the phone needs to tag free text with a place on the island. */
export interface TagContext {
  projects: { id: string; name: string; aliases: string[] }[];
  people: { name: string; aliases: string[] }[];
  bets: string[];
}
