import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { redact } from '@/lib/summaries/redact';
import { transcriptText } from '@/lib/summaries/transcript';
import { makeAgentFixtures, SECRET } from '../fixtures/agents';

let fx: ReturnType<typeof makeAgentFixtures>;
beforeAll(() => { fx = makeAgentFixtures(fs.mkdtempSync(path.join(os.tmpdir(), 'palace-transcript-'))); });

const line = (o: unknown) => `${JSON.stringify(o)}\n`;
const claudeLog = (rel: string) => path.join(fx.claude, 'projects', fx.cwd.lighthouse.replace(/[^a-zA-Z0-9]/g, '-'), rel);

describe('transcript text', () => {
  it('keeps the conversation and one line per tool call, and drops tool output and side chatter', async () => {
    const file = claudeLog('t-1.jsonl');
    fs.writeFileSync(file,
      line({ type: 'user', message: { role: 'user', content: 'Fix the login bug' } })
      + line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Looking at auth.ts' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm   test' } }] } })
      + line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'HUGE TEST OUTPUT' }] } })
      + line({ type: 'user', isMeta: true, message: { role: 'user', content: 'hook reminder' } })
      + line({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'subagent musing' }] } })
      + line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/auth.ts', new_string: 'secret code body' } }] } }));
    expect(await transcriptText(file, 'claude')).toBe('User: Fix the login bug\n\nAgent: Looking at auth.ts\n\n[Bash: npm test]\n\n[Edit: src/auth.ts]');
  });

  it('reads Codex sessions: messages, commands and patched files, without the injected context', async () => {
    const file = path.join(fx.home, 'codex.jsonl');
    fs.writeFileSync(file,
      line({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } })
      + line({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Add a dark mode' }] } })
      + line({ type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', 'ls src'] }) } })
      + line({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: src/theme.ts\n+dark\n*** End Patch' } })
      + line({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done.' }] } }));
    expect(await transcriptText(file, 'codex')).toBe('User: Add a dark mode\n\n[shell: bash -lc ls src]\n\n[apply_patch: src/theme.ts]\n\nAgent: Done.');
  });

  // Acceptance (roadmap §3): a transcript with a fake API key and a .env block comes out with both redacted.
  it('loses every secret once redacted', async () => {
    const file = claudeLog('t-2.jsonl');
    const env = 'DATABASE_URL=postgres://app:hunter2@db/app\nSTRIPE_SECRET=whsec_abc123def456ghi789';
    fs.writeFileSync(file,
      line({ type: 'user', message: { role: 'user', content: `Here is my .env:\n${env}\nand the key ${SECRET}` } })
      + line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: `curl -H "Authorization: Bearer ${'tok'.repeat(8)}" api.example.com` } }] } }));
    const { text, counts } = redact(await transcriptText(file, 'claude'));
    for (const s of [SECRET, 'hunter2', 'whsec_abc123def456ghi789', 'tok'.repeat(8)]) expect(text).not.toContain(s);
    expect(text).toContain('DATABASE_URL=[redacted: env value]');
    expect(counts).toMatchObject({ 'api key': 1, 'env value': 2, token: 1 });
  });
});
