import { BeliefCard } from '@/components/IslandView';
import { WorldviewBanners, WorldviewConsent, WorldviewForget, WorldviewScanButton, WorldviewScope } from '@/components/WorldviewUI';
import { config } from '@/lib/config';
import { readSettings, type Settings } from '@/lib/settings';
import { findCli } from '@/lib/summaries/summarise';
import { loadNotes } from '@/lib/vault/reader';
import { readScanState, type ScanState } from '@/lib/worldview';
import { getWorld } from '@/lib/world';

const TEMPLATE = `---
type: belief
status: proposed      # proposed | confirmed | adjusted | rejected
confidence: 2         # 1–3: how sure you are this is really you
evidence: "Where this shows up in your notes"
---

Optional longer explanation.`;

const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: config.timeZone });

function scopeText(wv: Settings['worldview']): string {
  const ask = wv.interview ? ' Atlas also asks one question a day at Dusk.' : '';
  if (wv.scan === 'all') return `Mind Isle may read all your notes (not people notes).${ask}`;
  if (wv.scan === 'folders') return `Mind Isle may read only: ${wv.folders.join(', ')}.${ask}`;
  if (wv.scan === 'sessions') return `Mind Isle may read only your session notes.${ask}`;
  if (wv.scan === 'interview') return 'Interview only: nothing is read. Atlas asks one question a day at Dusk.';
  return 'Not now: nothing is read and nothing is asked.';
}

function lastScan(s: ScanState): string | null {
  if (s.status === 'done') return `Last scan ${when(s.finishedAt!)}: read ${s.notesRead.length} note${s.notesRead.length === 1 ? '' : 's'}, proposed ${s.proposed} new banner${s.proposed === 1 ? '' : 's'}.`;
  if (s.status === 'failed') return `The last scan failed: ${s.error}`;
  return null;
}

export default async function BannersPage() {
  const [w, settings, scan, notes] = await Promise.all([getWorld(), readSettings(), readScanState(), loadNotes()]);
  const wv = settings.worldview;
  const folders = [...new Set(notes.map((n) => n.rel.split('/')).filter((p) => p.length > 1 && p[0] !== 'Mind Isle').map((p) => p[0]))].sort();
  const reads = wv.scan === 'all' || wv.scan === 'folders' || wv.scan === 'sessions';
  const cli = reads ? await findCli(settings.summaries.cli) : 'n/a';
  const proposed = w.worldview.filter((b) => b.source !== 'manual' && !['confirmed', 'adjusted'].includes(b.status)).length;
  const wvDecided = w.worldview.filter((b) => b.source !== 'manual' && ['confirmed', 'adjusted'].includes(b.status)).length;
  const consent = { current: wv.scan, folders: { all: folders, chosen: wv.folders }, interview: wv.interview, readOnly: w.readOnly };
  const decided = w.beliefs.filter((b) => b.status !== 'proposed').length;
  return (
    <div className="stack">
      <div className="two">
        <div className="panel card">
          <h2>Banner Wall: what you believe</h2>
          <p className="sub">
            Each banner carries its evidence and a confidence level. Proposed banners fly white with a “?” until you confirm, adjust or reject them.
            Your answer is written back into the note.
          </p>
          <div className="prog"><i style={{ width: `${w.beliefs.length ? (decided / w.beliefs.length) * 100 : 0}%` }} /></div>
          <p className="tiny muted">{decided} of {w.beliefs.length} decided</p>
          {w.beliefs.length ? (
            <ul className="list">
              {w.beliefs.map((b) => <li key={b.id} className="item"><BeliefCard b={b} vaultName={w.vaultName} readOnly={w.readOnly} /></li>)}
            </ul>
          ) : <div className="empty">No banners yet. Create a note with <code>type: belief</code>.</div>}
        </div>
        <div className="panel card">
          <h2>Raising a banner</h2>
          <p className="sub">
            A belief is a note named after the statement itself, for example <i>“Ship small, ship often.md”</i>.
            You can write them yourself, or let an AI assistant read your vault and propose some for you to confirm here.
          </p>
          <pre className="code">{TEMPLATE}</pre>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            When you change your mind, edit the note. Obsidian’s file history keeps the old version, like patch notes for your mind.
          </p>
        </div>
      </div>

      <div className="panel card wv">
        <h2>Worldview wing</h2>
        <p className="sub">
          Values, faith and spirituality, civic views. The most personal banners, so they follow stricter rules: nothing is read unless you say so,
          only your own first-person words count, every banner is a proposal with your exact words as evidence, and they live in
          <code> Mind Isle/Worldview/</code>. They never appear on the island or the public Hall, and are never given to an AI unless you switch that on for a banner.
        </p>
        {wv.scan === null || wv.scan === 'revoked' ? (
          <>
            {wv.scan === 'revoked' && <p className="tiny"><b>You used Forget.</b> Nothing is read or asked until you choose again.</p>}
            <WorldviewConsent {...consent} />
          </>
        ) : (
          <WorldviewScope summary={scopeText(wv)} {...consent} />
        )}
        {reads && !w.readOnly && (
          <div className="row wv-scan">
            <WorldviewScanButton running={scan.status === 'running'} disabled={!cli} />
            {!cli && <span className="tiny warn">The {settings.summaries.cli} CLI isn’t installed; choose another in Settings → Summaries.</span>}
            {scan.status !== 'running' && lastScan(scan) && <span className="tiny muted">{lastScan(scan)}</span>}
          </div>
        )}
        <WorldviewBanners banners={w.worldview} vaultName={w.vaultName} readOnly={w.readOnly} />
        {!w.readOnly && (proposed + wvDecided > 0 || reads || wv.interview) && wv.scan !== 'revoked' && (
          <div className="wv-forget-row"><WorldviewForget proposed={proposed} decided={wvDecided} /></div>
        )}
      </div>
    </div>
  );
}
