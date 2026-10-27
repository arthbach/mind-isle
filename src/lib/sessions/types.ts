export type SourceId = 'orca' | 'claude-code' | 'codex';
export type Agent = 'claude' | 'codex';
export type SessionState = 'working' | 'needs_you' | 'idle' | 'ended';

export const SOURCE_LABEL: Record<SourceId, string> = { orca: 'Orca', 'claude-code': 'Claude Code', codex: 'Codex' };
export const AGENT_LABEL: Record<Agent, string> = { claude: 'Claude', codex: 'Codex' };

/** One place an agent keeps its sessions (a config dir / profile home). */
export interface Root {
  source: SourceId;
  agent: Agent;
  dir: string;
  label: string;
}

/** What we know about a session from its log. Metadata only. */
export interface SessionMeta {
  id: string;
  agent: Agent;
  source: SourceId;
  rootDir: string;
  file: string;
  cwd: string;
  branch: string | null;
  remote: string | null;
  startedAt: number | null;
  mtime: number;
  /** The agent's own generated title (Claude Code), never the user's prompt. */
  title: string | null;
}

/** A metadata-only event written by scripts/palace-hook.mjs. */
export interface HookEvent {
  ts: number;
  agent: Agent;
  session: string;
  cwd?: string;
  event: string;
  tool?: string;
  detail?: string;
  reason?: string;
}

export interface Mapping {
  project: { id: string; name: string; rel: string } | null;
  confidence: number;
  /** Why: 'repos', 'git remote', 'folder name', 'confirmed', 'not a project', … */
  reason: string;
  kind: 'confirmed' | 'auto' | 'ask' | 'harbor' | 'ignored';
}

export interface LiveSession {
  id: string;
  agent: Agent;
  source: SourceId;
  cwd: string;
  cwdShort: string;
  branch: string | null;
  title: string | null;
  state: Exclude<SessionState, 'ended'>;
  /** True when the state is guessed from file activity only (no registry, hooks or log phases). */
  inferred: boolean;
  lastAction: string | null;
  startedAt: number | null;
  lastEventAt: number;
  mapping: Mapping;
}

export interface LiveSnapshot {
  at: number;
  live: LiveSession[];
  /** Folders with recent sessions that still need the user to place them. */
  pending: number;
}

export interface FolderGroup {
  cwd: string;
  cwdShort: string;
  sessions: number;
  agents: Agent[];
  sources: SourceId[];
  lastActive: number;
  titles: string[];
  remote: string | null;
  mapping: Mapping;
  /** Best guesses when the mapping isn't certain, best first. */
  suggestions: { id: string; name: string; rel: string; confidence: number; reason: string }[];
}
