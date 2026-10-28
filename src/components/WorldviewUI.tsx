'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { voteBelief } from '@/app/actions';
import { answerInterview, chooseWorldview, forgetWorldview, rejectWorldview, scanWorldview, skipInterview, worldviewInAi } from '@/app/worldview-actions';
import { obsidianLink } from '@/lib/game';
import type { WorldviewScan } from '@/lib/settings';
import type { WorldviewArea, WorldviewBanner } from '@/lib/types';
import { ActionButton } from './ActionButton';

type Choice = Exclude<WorldviewScan, 'revoked'>;
const CHOICES: { value: Choice; label: string; text: string }[] = [
  { value: 'all', label: 'All my notes', text: 'Every note except people notes and Mind Isle’s own.' },
  { value: 'folders', label: 'Only these folders', text: 'Pick the folders below, for example a journal.' },
  { value: 'sessions', label: 'My session notes', text: 'Only the notes Mind Isle wrote about your agent sessions.' },
  { value: 'interview', label: 'Interview only', text: 'Nothing is read. Atlas asks you one question a day at Dusk instead.' },
  { value: 'off', label: 'Not now', text: 'Nothing is read and nothing is asked.' },
];
const AREA: Record<WorldviewArea, string> = { values: 'Values', faith: 'Faith and spirituality', civic: 'Civic views' };

/** "May Mind Isle look, and where?" Nothing is read until this is answered. */
export function WorldviewConsent({ current, folders, interview, readOnly, onDone }: {
  current: WorldviewScan | null; folders: { all: string[]; chosen: string[] }; interview: boolean; readOnly: boolean; onDone?: () => void;
}) {
  const [scan, setScan] = useState<Choice>(current && current !== 'revoked' ? current : 'interview');
  const [picked, setPicked] = useState<string[]>(folders.chosen);
  const [ask, setAsk] = useState(interview || current === null || current === 'revoked');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = () => start(async () => {
    setError(null);
    try { await chooseWorldview(scan, picked, scan === 'interview' ? true : scan === 'off' ? false : ask); onDone?.(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
  });
  return (
    <div className="wv-consent">
      <fieldset className="wv-choices" disabled={readOnly || pending}>
        <legend className="tiny muted">What may Mind Isle read to look for your worldview?</legend>
        {CHOICES.map((c) => (
          <label key={c.value} className={`wv-choice${scan === c.value ? ' on' : ''}`}>
            <input type="radio" name="wv-scope" checked={scan === c.value} onChange={() => setScan(c.value)} />
            <span><b>{c.label}</b><span className="tiny muted">{c.text}</span></span>
          </label>
        ))}
        {scan === 'folders' && (
          <div className="wv-folders">
            {folders.all.map((f) => (
              <label key={f} className="tiny">
                <input type="checkbox" checked={picked.includes(f)} onChange={(e) => setPicked(e.target.checked ? [...picked, f] : picked.filter((x) => x !== f))} /> {f}
              </label>
            ))}
          </div>
        )}
        {(scan === 'all' || scan === 'folders' || scan === 'sessions') && (
          <label className="tiny"><input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} /> Also ask me one question a day at Dusk</label>
        )}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={readOnly || pending} onClick={save}>{pending ? 'Saving…' : 'Save my choice'}</button>
    </div>
  );
}

/** Proposals and banners, blurred until revealed (this may be a shared screen). */
export function WorldviewBanners({ banners, vaultName, readOnly }: { banners: WorldviewBanner[]; vaultName: string; readOnly: boolean }) {
  const [shown, setShown] = useState(false);
  if (!banners.length) return null;
  const areas = (['values', 'faith', 'civic'] as const).filter((a) => banners.some((b) => b.area === a));
  return (
    <div className="wv-banners">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="tiny muted">{banners.length} banner{banners.length === 1 ? '' : 's'} · only you can see these, and only here</span>
        <button className="btn tiny-btn" aria-pressed={shown} onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Reveal'}</button>
      </div>
      <div className={shown ? '' : 'wv-veil'} aria-hidden={!shown} inert={!shown || undefined}>
        {areas.map((a) => (
          <section key={a}>
            <h4 className="wv-area">{AREA[a]}</h4>
            <ul className="list">
              {banners.filter((b) => b.area === a).map((b) => (
                <li key={b.id} className="item wv-banner">
                  <div className={`flag ${b.status}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{b.text}</h4>
                    {b.evidence.map((e, i) => (
                      <blockquote key={i} className="wv-quote">
                        {e.quote}
                        {e.note && <> · <a href={obsidianLink(vaultName, `${e.note.replace(/^\[\[|\]\]$/g, '')}.md`)}>{e.note.replace(/^\[\[|\]\]$/g, '')}</a></>}
                      </blockquote>
                    ))}
                    <p className="tiny muted">
                      {b.source === 'interview' ? 'From your answer at Dusk' : b.source === 'scan' ? 'Proposed from your notes' : 'Written by you'}
                      {' · '}<a href={obsidianLink(vaultName, b.path)}>note</a>
                    </p>
                    {!readOnly && (
                      <div className="vote">
                        <ActionButton pressed={b.status === 'confirmed'} action={() => voteBelief(b.path, 'confirmed')}>✓ That’s me</ActionButton>
                        <ActionButton pressed={b.status === 'adjusted'} action={() => voteBelief(b.path, 'adjusted')} title="Then edit the note in Obsidian">✎ Close, adjust</ActionButton>
                        <ActionButton action={() => rejectWorldview(b.path)} title={b.source === 'manual' ? 'Marks it rejected' : 'Deletes this proposal'}>✗ Not me</ActionButton>
                        <label className="tiny wv-ai" title="Off: this banner is never given to any AI. On: it may be used as context in the future.">
                          <input type="checkbox" checked={b.useInAi} onChange={(e) => worldviewInAi(b.path, e.target.checked)} /> Use in AI context
                        </label>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Scan now, with progress while it runs. */
export function WorldviewScanButton({ running, disabled }: { running: boolean; disabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [running, router]);
  return running
    ? <span className="tiny"><b>Scanning…</b> this takes a minute or two.</span>
    : <ActionButton className="btn primary" disabled={disabled} action={() => scanWorldview()}>Scan now</ActionButton>;
}

/** Forget asks twice: proposals first, then (only if asked) the banners already confirmed. */
export function WorldviewForget({ proposed, decided }: { proposed: number; decided: number }) {
  const [step, setStep] = useState(0);
  if (step === 0) return <button className="btn tiny-btn" onClick={() => setStep(1)}>Forget…</button>;
  return (
    <div className="wv-forget" role="group" aria-label="Forget worldview banners">
      <span className="tiny">
        Delete the {proposed} banner{proposed === 1 ? '' : 's'} Mind Isle proposed and stop looking?
        {decided > 0 && ` The ${decided} you confirmed stay unless you choose “Forget everything”.`} Banners you wrote yourself are never touched.
      </span>
      <ActionButton className="btn tiny-btn primary" action={async () => { await forgetWorldview(false); setStep(0); }}>Forget proposals</ActionButton>
      {decided > 0 && <ActionButton className="btn tiny-btn" action={async () => { await forgetWorldview(true); setStep(0); }}>Forget everything</ActionButton>}
      <button className="btn tiny-btn" onClick={() => setStep(0)}>Cancel</button>
    </div>
  );
}

/** Dusk: today's reflective question, skippable. */
export function InterviewQuestion({ index, text }: { index: number; text: string }) {
  const [answer, setAnswer] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => start(async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
  });
  return (
    <section className="panel card interview">
      <h3 className="ci-h">Atlas asks</h3>
      <p className="interview-q">{text}</p>
      <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="In your own words. It becomes a proposed banner only you can see." aria-label={text} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={pending || answer.trim().length < 3} onClick={() => run(() => answerInterview(index, answer))}>Save answer</button>
        <button className="btn" disabled={pending} onClick={() => run(() => skipInterview(index))}>Skip today</button>
      </div>
    </section>
  );
}

/** What Mind Isle may read right now, with a way to change it. */
export function WorldviewScope({ summary, ...consent }: { summary: string } & Parameters<typeof WorldviewConsent>[0]) {
  const [editing, setEditing] = useState(false);
  if (editing) return <WorldviewConsent {...consent} onDone={() => setEditing(false)} />;
  return (
    <p className="tiny wv-scope">
      {summary}{' '}
      {!consent.readOnly && <button className="linkbtn" style={{ padding: 0 }} onClick={() => setEditing(true)}>Change</button>}
    </p>
  );
}
