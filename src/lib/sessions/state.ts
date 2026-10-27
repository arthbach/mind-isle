// Session state from whatever signals exist. Pure and deterministic: everything comes in as arguments.
import type { HookEvent, SessionState } from './types';

export const LIVE = {
  /** Working with no new signal for this long counts as idle. */
  idleAfterMs: 10 * 60_000,
  /** No activity for this long (and no live process) counts as ended. */
  endAfterMs: 2 * 60 * 60_000,
  /** Without any real signal, a log touched this recently counts as working. */
  inferWorkingMs: 2 * 60_000,
};

const WORKING_HOOKS = new Set(['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'SubagentStart', 'PreCompact', 'PostCompact']);
const IDLE_HOOKS = new Set(['SessionStart', 'Stop', 'StopFailure', 'Interrupt', 'SubagentStop', 'TeammateIdle']);

function fromHook(e: HookEvent): SessionState | null {
  if (e.event === 'SessionEnd') return 'ended';
  if (e.event === 'PermissionRequest') return 'needs_you';
  if (e.event === 'Notification') return e.reason === 'permission' || e.reason === 'input' ? 'needs_you' : 'idle';
  if (WORKING_HOOKS.has(e.event)) return 'working';
  if (IDLE_HOOKS.has(e.event)) return 'idle';
  return null;
}

export function fromRegistryStatus(status: string): SessionState {
  if (/wait|permission|approv|input|question/i.test(status)) return 'needs_you';
  if (/busy|shell|work|run|think/i.test(status)) return 'working';
  return 'idle';
}

export interface StateInput {
  now: number;
  /** Log file modification time. */
  mtime: number;
  /** Claude Code's running-session registry, if the session appears in it. */
  registry?: { alive: boolean; status: string; updatedAt: number | null };
  /** Hook events for this session, oldest first. */
  hooks?: HookEvent[];
  /** Phase read from the log itself (Codex task events). */
  log?: { phase: 'working' | 'idle' | 'needs_you' | null; at: number | null };
}

export function sessionState(i: StateInput): { state: SessionState; inferred: boolean; at: number } {
  const signals: { at: number; state: SessionState }[] = [];
  for (const e of i.hooks ?? []) {
    const s = fromHook(e);
    if (s) signals.push({ at: e.ts, state: s });
  }
  if (i.registry?.alive) signals.push({ at: i.registry.updatedAt ?? 0, state: fromRegistryStatus(i.registry.status) });
  if (i.log?.phase) signals.push({ at: i.log.at ?? i.mtime, state: i.log.phase });
  signals.sort((a, b) => a.at - b.at);
  const latest = signals.at(-1);
  const lastActivity = Math.max(i.mtime, latest?.at ?? 0);

  // A process that has exited, or a session that said goodbye, is over.
  if (latest?.state === 'ended') return { state: 'ended', inferred: false, at: latest.at };
  if (i.registry && !i.registry.alive) return { state: 'ended', inferred: false, at: lastActivity };
  const processAlive = !!i.registry?.alive;
  if (!processAlive && i.now - lastActivity > LIVE.endAfterMs) return { state: 'ended', inferred: !latest, at: lastActivity };

  if (!latest) {
    return { state: i.now - i.mtime <= LIVE.inferWorkingMs ? 'working' : 'idle', inferred: true, at: i.mtime };
  }
  // "Working" goes stale without new signals (a missed Stop event, a crashed turn). The log moving counts as a signal.
  if (latest.state === 'working' && i.now - lastActivity > LIVE.idleAfterMs && i.registry?.status !== 'busy') {
    return { state: 'idle', inferred: false, at: lastActivity };
  }
  return { state: latest.state, inferred: false, at: latest.at };
}
