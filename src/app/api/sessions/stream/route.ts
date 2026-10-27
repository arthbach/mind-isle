import { liveSnapshot } from '@/lib/sessions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Server-Sent Events: the live session snapshot, pushed whenever it changes (checked every second). */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let poll: ReturnType<typeof setInterval> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;
  let last = '';
  const stop = () => { clearInterval(poll); clearInterval(beat); };

  const stream = new ReadableStream({
    async start(controller) {
      const push = async () => {
        try {
          const snap = await liveSnapshot();
          // Compare without the timestamp, so nothing is sent unless something actually changed.
          const key = JSON.stringify({ ...snap, at: 0 });
          if (key !== last) {
            last = key;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(snap)}\n\n`));
          }
        } catch {
          // A transient read error (a log rotating mid-read) just skips this tick.
        }
      };
      await push();
      poll = setInterval(push, 1000);
      beat = setInterval(() => { try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { stop(); } }, 20_000);
      req.signal.addEventListener('abort', () => { stop(); try { controller.close(); } catch { /* already closed */ } });
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
