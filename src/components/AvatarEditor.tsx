'use client';

import { useState, useTransition } from 'react';
import { saveAvatar } from '@/app/character-actions';
import { avatarFor, COLORS, ENNEAGRAM, HAIR, MBTI, SKIN, TRAITS, type Look, type Personality, type Trait } from '@/lib/avatar';
import { Avatar } from './Avatar';

// Four quick either-or questions, one per MBTI letter. Only a starting point: the user can always pick directly.
const QUIZ: { q: string; a: [string, string]; letters: [string, string] }[] = [
  { q: 'After a long week, you recharge by…', a: ['seeing people', 'time alone'], letters: ['E', 'I'] },
  { q: 'You trust more…', a: ['what you can see and test', 'patterns and possibilities'], letters: ['S', 'N'] },
  { q: 'A hard call is settled by…', a: ['logic, even if it stings', 'what it does to people'], letters: ['T', 'F'] },
  { q: 'You prefer plans that are…', a: ['decided and done', 'open until the last moment'], letters: ['J', 'P'] },
];

function Swatches<T extends string | number>({ label, value, options, onPick }: { label: string; value: T | null; options: { value: T | null; color: string; name: string }[]; onPick: (v: T | null) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={value === o.value} aria-label={o.name} title={o.name}
          className={`swatch${value === o.value ? ' on' : ''}`} style={{ background: o.color }} onClick={() => onPick(o.value)} />
      ))}
    </div>
  );
}

export function AvatarEditor({ personality, look, readOnly }: { personality: Personality; look: Look; readOnly: boolean }) {
  const [p, setP] = useState(personality);
  const [l, setL] = useState(look);
  const [quiz, setQuiz] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const changed = JSON.stringify(p) !== JSON.stringify(personality) || JSON.stringify(l) !== JSON.stringify(look);
  const answer = (letter: string) => {
    const next = [...(quiz ?? []), letter];
    if (next.length === QUIZ.length) { setP({ ...p, mbti: next.join('') }); setQuiz(null); } else setQuiz(next);
  };
  const setTrait = (i: 0 | 1, t: Trait | '') => {
    const b = [...p.big5];
    if (t) b[i] = t; else b.splice(i);
    setP({ ...p, big5: b.filter((x, k) => x && (k === 0 || x !== b[0])).slice(0, 2) as Trait[] });
  };
  return (
    <div className="avatar-editor">
      <div className="avatar-preview">
        <Avatar personality={p} look={l} className="bigport" />
        <ul className="tiny muted">{avatarFor(p, l).layers.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <fieldset disabled={readOnly || pending}>
        <legend className="tiny muted">Only what you enter. Nothing is guessed from your notes.</legend>
        <label className="field">
          <span>MBTI</span>
          <select value={p.mbti ?? ''} onChange={(e) => setP({ ...p, mbti: e.target.value || null })}>
            <option value="">Not set</option>
            {MBTI.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {!quiz && <button className="linkbtn" style={{ padding: 0 }} onClick={() => setQuiz([])}>Don’t know? 4 quick questions</button>}
        </label>
        {quiz && (
          <div className="quiz">
            <p className="tiny"><b>{quiz.length + 1}/{QUIZ.length}</b> {QUIZ[quiz.length].q}</p>
            <div className="row">
              {QUIZ[quiz.length].a.map((a, i) => <button key={a} className="btn tiny-btn" onClick={() => answer(QUIZ[quiz.length].letters[i])}>{a}</button>)}
              <button className="linkbtn" style={{ padding: 0 }} onClick={() => setQuiz(null)}>Cancel</button>
            </div>
          </div>
        )}
        <label className="field">
          <span>Enneagram</span>
          <select value={p.enneagram ?? ''} onChange={(e) => setP({ ...p, enneagram: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Not set</option>
            {ENNEAGRAM.map((n, i) => <option key={n} value={i + 1}>{i + 1} · {n}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Big Five, strongest</span>
          <select value={p.big5[0] ?? ''} onChange={(e) => setTrait(0, e.target.value as Trait | '')}>
            <option value="">Not set</option>
            {(Object.keys(TRAITS) as Trait[]).map((t) => <option key={t} value={t}>{TRAITS[t]}</option>)}
          </select>
        </label>
        {p.big5[0] && (
          <label className="field">
            <span>Big Five, second</span>
            <select value={p.big5[1] ?? ''} onChange={(e) => setTrait(1, e.target.value as Trait | '')}>
              <option value="">Not set</option>
              {(Object.keys(TRAITS) as Trait[]).filter((t) => t !== p.big5[0]).map((t) => <option key={t} value={t}>{TRAITS[t]}</option>)}
            </select>
          </label>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>MBTI sets the outfit when both are filled in; Big Five is the alternative.</p>
        <div className="field"><span>Hair</span>
          <Swatches label="Hair" value={l.hair} onPick={(hair) => setL({ ...l, hair: hair ?? 'black' })}
            options={(Object.keys(HAIR) as Look['hair'][]).map((h) => ({ value: h, name: h === 'scarf' ? 'Headscarf' : h, color: HAIR[h] || 'repeating-linear-gradient(45deg, var(--panel-3) 0 3px, var(--fade) 3px 5px)' }))} />
        </div>
        <div className="field"><span>Skin</span>
          <Swatches label="Skin tone" value={l.skin} onPick={(skin) => setL({ ...l, skin: skin ?? 2 })}
            options={(Object.keys(SKIN).map(Number) as Look['skin'][]).map((k) => ({ value: k, name: `Tone ${k}`, color: SKIN[k] }))} />
        </div>
        <div className="field"><span>Colour</span>
          <Swatches label="Outfit colour" value={l.color} onPick={(color) => setL({ ...l, color })}
            options={[{ value: null, name: 'From your personality', color: 'conic-gradient(#e0703a, #4f9a5c, #3f6fb8, #7a4fa0, #e0703a)' },
              ...(Object.keys(COLORS) as NonNullable<Look['color']>[]).map((c) => ({ value: c, name: c, color: COLORS[c] }))]} />
        </div>
      </fieldset>
      {msg && <p className="tiny" role="status">{msg}</p>}
      {!readOnly && (
        <button className="btn primary" disabled={!changed || pending}
          onClick={() => start(async () => {
            setMsg(null);
            try { await saveAvatar(p, l); setMsg('Saved to Mind Isle/Settings.md.'); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.'); }
          })}>
          {pending ? 'Saving…' : 'Save avatar'}
        </button>
      )}
    </div>
  );
}
