#!/usr/bin/env node
// Mind Isle hook for Claude Code and Codex.
//
// Records one line of METADATA per agent event: time, session id, working folder, event name,
// tool name, and a short label (a file path inside the project, or a category like "shell").
// It never records prompts, code, commands or tool output.
//
// It must never slow down or break the agent: no output, always exit 0, give up after 2 seconds.
// Usage (installed by the app): node palace-hook.mjs --mind-palace-hook <claude|codex> <eventsDir>
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--mind-palace-hook');
const [agent = 'claude', outDir] = args;
let input = '';
let finished = false;

function label(tool, toolInput, cwd) {
  if (!tool) return undefined;
  const file = toolInput && (toolInput.file_path || toolInput.notebook_path || toolInput.path);
  if (typeof file === 'string') {
    const rel = cwd && file.startsWith(cwd + path.sep) ? file.slice(cwd.length + 1) : path.basename(file);
    return rel.slice(0, 120);
  }
  if (/^(Bash|shell|exec|local_shell)/i.test(tool)) return 'shell command';
  if (/^(Grep|Glob|Search)/i.test(tool)) return 'searching';
  if (/^(WebFetch|WebSearch|web)/i.test(tool)) return 'web';
  if (/^(Task|Agent)/i.test(tool)) return 'subagent';
  return undefined;
}

function reasonOf(d) {
  const t = String(d.notification_type || '');
  const m = String(d.message || '');
  if (/permission/i.test(t) || /permission/i.test(m)) return 'permission';
  if (/elicitation|question/i.test(t)) return 'input';
  if (/idle|waiting for your input/i.test(t + m)) return 'idle';
  return undefined;
}

function record() {
  if (finished) return;
  finished = true;
  try {
    if (!outDir) return;
    const d = JSON.parse(input || '{}');
    const cwd = typeof d.cwd === 'string' ? d.cwd : undefined;
    const tool = typeof d.tool_name === 'string' ? d.tool_name.slice(0, 60) : undefined;
    const line = {
      ts: Date.now(),
      agent: agent === 'codex' ? 'codex' : 'claude',
      session: String(d.session_id || d.sessionId || d['thread-id'] || '').slice(0, 100),
      cwd,
      event: String(d.hook_event_name || d.event || d.type || '').slice(0, 40),
      tool,
      detail: label(tool, d.tool_input, cwd),
      reason: d.hook_event_name === 'Notification' ? reasonOf(d) : undefined,
    };
    if (!line.session || !line.event) return;
    mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `events-${line.agent}.jsonl`);
    try { if (statSync(file).size > 5 * 1024 * 1024) renameSync(file, `${file}.1`); } catch { /* first write */ }
    appendFileSync(file, `${JSON.stringify(line)}\n`);
  } catch {
    // Never let a hook failure reach the agent.
  }
}

const finish = () => { record(); process.exit(0); };
setTimeout(finish, 2000).unref?.();
if (process.stdin.isTTY) finish();
else {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { if (input.length < 4_000_000) input += c; });
  process.stdin.on('end', finish);
  process.stdin.on('error', finish);
}
