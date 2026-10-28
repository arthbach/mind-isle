// A session transcript as plain text for the summariser: what the user asked, what the agent said,
// and one line per tool call. Tool output is left out (it's long, and it's where secrets tend to be).
// Callers must pass the result through redact() before it goes anywhere.
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import type { Agent } from '../sessions/types';

export const TRANSCRIPT = {
  /** Longest single message kept; the middle of longer ones is cut. */
  maxMessage: 4000,
  /** Longest tool-call line. */
  maxTool: 200,
};

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, Math.floor(n * 0.7))} … ${s.slice(-Math.floor(n * 0.2))}`);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function toolLine(name: string, input: Record<string, unknown> | undefined): string {
  const i = input ?? {};
  const target = i.file_path ?? i.notebook_path ?? i.path ?? i.pattern ?? i.command ?? i.cmd ?? i.url ?? i.query ?? i.description;
  return `[${name}${typeof target === 'string' && target ? `: ${clip(oneLine(target), TRANSCRIPT.maxTool)}` : ''}]`;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c?.type === 'text' || c?.type === 'input_text' || c?.type === 'output_text').map((c) => c.text ?? '').join('\n');
}

/** Turns of the conversation, oldest first, as `User:` / `Agent:` blocks. */
export async function transcriptText(file: string, agent: Agent): Promise<string> {
  const out: string[] = [];
  const lines = readline.createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    let d: Record<string, unknown>;
    try { d = JSON.parse(line); } catch { continue; }
    if (agent === 'claude') {
      // Sub-agent work and meta lines (hooks, reminders) aren't part of the conversation.
      if (d.isSidechain || d.isMeta) continue;
      const msg = d.message as { content?: unknown } | undefined;
      if (d.type === 'user') {
        // Tool results come back as user lines; skip them.
        if (Array.isArray(msg?.content) && (msg!.content as { type?: string }[]).some((c) => c?.type === 'tool_result')) continue;
        const t = textOf(msg?.content).trim();
        if (t && !t.startsWith('<command-') && !t.startsWith('<local-command')) out.push(`User: ${clip(t, TRANSCRIPT.maxMessage)}`);
      } else if (d.type === 'assistant' && Array.isArray(msg?.content)) {
        for (const c of msg!.content as { type?: string; text?: string; name?: string; input?: Record<string, unknown> }[]) {
          if (c?.type === 'text' && c.text?.trim()) out.push(`Agent: ${clip(c.text.trim(), TRANSCRIPT.maxMessage)}`);
          else if (c?.type === 'tool_use') out.push(toolLine(c.name ?? 'tool', c.input));
        }
      }
    } else {
      const p = (d.payload ?? {}) as Record<string, unknown>;
      if (d.type !== 'response_item') continue;
      if (p.type === 'message' && (p.role === 'user' || p.role === 'assistant')) {
        const t = textOf(p.content).trim();
        // Codex injects its environment and instructions as user messages wrapped in tags.
        if (t && !/^<(environment_context|user_instructions|permissions)/.test(t)) out.push(`${p.role === 'user' ? 'User' : 'Agent'}: ${clip(t, TRANSCRIPT.maxMessage)}`);
      } else if (p.type === 'function_call' || p.type === 'custom_tool_call') {
        let input: Record<string, unknown> | undefined;
        try { input = typeof p.arguments === 'string' ? JSON.parse(p.arguments) : undefined; } catch { /* not JSON */ }
        if (p.name === 'apply_patch') {
          const files = [...String(p.input ?? p.arguments ?? '').matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => m[1]);
          out.push(`[apply_patch: ${files.join(', ')}]`);
        } else {
          const cmd = Array.isArray(input?.command) ? (input!.command as string[]).join(' ') : undefined;
          out.push(toolLine(String(p.name ?? 'tool'), cmd ? { command: cmd } : input));
        }
      }
    }
  }
  return out.join('\n\n');
}
