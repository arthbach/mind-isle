// Stands in for `claude -p` in tests. Reads the prompt on stdin, saves it for the test to inspect,
// and answers like Claude Code's --output-format json. FAKE_MODE: ok | bad (wrong shape) | fail (exit 1).
import fs from 'node:fs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const capture = process.env.FAKE_CAPTURE;
if (capture) fs.appendFileSync(capture, `${input}\n=====\n`);
const mode = process.env.FAKE_MODE ?? 'ok';
const reply = (answer) => process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(answer), structured_output: answer }));

// Worldview scans: a banner per "I believe / I value" passage, plus one with an invented quote that must be dropped.
if (input.startsWith('WORLDVIEW SCAN')) {
  const banners = [...input.matchAll(/^\[(\d+)\] (.*)$/gm)]
    .filter((m) => /\bI (believe|value)\b/.test(m[2]))
    .map((m) => ({ statement: m[2].replace(/[.…]+$/, ''), area: /god|faith|pray/i.test(m[2]) ? 'faith' : 'values', quotes: [{ passage: Number(m[1]), quote: m[2].slice(0, 40) }] }));
  banners.push({ statement: 'I love chaos', area: 'values', quotes: [{ passage: 0, quote: 'words that were never written anywhere' }] });
  reply({ banners });
  process.exit(0);
}
if (mode === 'fail') { process.stderr.write('fake summariser crashed'); process.exit(1); }
const answer = mode === 'bad'
  ? { title: 42 }
  : {
      title: 'Fix the onboarding bug.',
      summary: 'Fixed the onboarding redirect loop and added a test.',
      decisions: ['Keep onboarding to three steps'],
      todos: ['Ask Maya Chen to test on Android'],
      files_touched: ['src/onboarding.ts'],
      people_mentioned: ['Maya Chen', 'Someone Unknown'],
    };
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(answer), structured_output: answer }));
