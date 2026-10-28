'use client';

import { useState, useTransition } from 'react';
import { logProjectUpdate } from '@/app/actions';
import type { ProjectStatus } from '@/lib/types';
import { PixelSelect } from './PixelSelect';

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' }, { value: 'blocked', label: 'Blocked' }, { value: 'paused', label: 'Paused' },
  { value: 'maintenance', label: 'Maintenance' }, { value: 'done', label: 'Done' }, { value: 'stopped', label: 'Stopped' },
];

/** Something that already happened on this project: a dated line in its `## Log`, and maybe a new status. */
export function ProjectUpdate({ path, status, today }: { path: string; status: ProjectStatus; today: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [date, setDate] = useState(today);
  const [next, setNext] = useState<ProjectStatus>(status);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="row">
        <button className="btn" onClick={() => { setOpen(true); setSaved(false); }}>+ Add update</button>
        {saved && <span className="tiny muted" role="status">Saved to the note’s Log.</span>}
      </div>
    );
  }
  const save = () => start(async () => {
    setError(null);
    try {
      await logProjectUpdate({ rel: path, text, date, status: next === status ? null : next });
      setText(''); setDate(today); setOpen(false); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
  });
  return (
    <div className="pu">
      <input type="text" value={text} autoFocus placeholder="What happened?" aria-label="What happened"
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) save(); }} />
      <div className="pu-row">
        <label className="tiny">When <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
        <PixelSelect<ProjectStatus> label="Status" value={next} options={STATUSES} onChange={setNext} />
      </div>
      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="row">
        <button className="btn primary" disabled={pending || !text.trim() || !date} onClick={save}>{pending ? 'Saving…' : 'Save update'}</button>
        <button className="btn" disabled={pending} onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
      </div>
    </div>
  );
}
