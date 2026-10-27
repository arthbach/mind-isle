'use client';

// Per-device settings. Each lives on its own page under /settings and applies at once.
import { blip, SONGS } from '@/lib/audio';
import { setPrefs, usePrefs, type Track } from '@/lib/prefs';
import { SEASONS, SEASON_LABEL, type Season, type SeasonChoice } from '@/lib/seasons';
import { SEASON_SWATCH } from './IslandView';
import { PixelSelect } from './PixelSelect';
import { setTheme, useTheme, type ThemeChoice } from './useTheme';

function Switch({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting">
      <div>
        <b>{label}</b>
        {hint && <p className="tiny muted">{hint}</p>}
      </div>
      <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
        <i aria-hidden="true" />
      </button>
    </div>
  );
}

function Choice<T extends string>({ label, hint, value, options, onChange }: {
  label: string; hint?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="setting col">
      <div>
        <b>{label}</b>
        {hint && <p className="tiny muted">{hint}</p>}
      </div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function WorldSettings({ auto, autoLabel, hasBets }: { auto: Season; autoLabel: string; hasBets: boolean }) {
  const p = usePrefs();
  return (
    <div className="settings">
      <div className="setting stackable">
        <div>
          <b>Season</b>
          <p className="tiny muted">Auto follows the real season where you live. Pick any other to keep it.</p>
        </div>
        <PixelSelect<SeasonChoice>
          label="Season"
          value={p.season}
          onChange={(season) => setPrefs({ season })}
          options={[
            { value: 'auto', label: 'Auto', hint: autoLabel, swatch: SEASON_SWATCH[auto] },
            ...SEASONS.map((x) => ({ value: x, label: SEASON_LABEL[x], swatch: SEASON_SWATCH[x] })),
          ]}
        />
      </div>
      <Switch label="Fog of neglect" hint="Fog over projects and people you haven’t touched in a long time." on={p.fog} onChange={(fog) => setPrefs({ fog })} />
      {hasBets && <Switch label="Harbor ships" hint="Your bets as ships: at sea, docked or wrecked." on={p.harbor} onChange={(harbor) => setPrefs({ harbor })} />}
    </div>
  );
}

export function SoundSettings() {
  const p = usePrefs();
  return (
    <div className="settings">
      <Switch label="Music" hint="Plays after your first click or key press (browsers require one). Press M anywhere to toggle." on={p.music} onChange={(music) => setPrefs({ music })} />
      <div className="setting">
        <div>
          <b>Volume</b>
          <p className="tiny muted">{Math.round(p.volume * 100)}%</p>
        </div>
        <input className="slider" type="range" min={0} max={100} step={5} value={Math.round(p.volume * 100)} aria-label="Music volume"
          onChange={(e) => setPrefs({ volume: Number(e.target.value) / 100 })} />
      </div>
      <Choice<Track>
        label="Song"
        hint="Auto plays the day song in light mode and the night song in dark mode."
        value={p.track}
        onChange={(track) => setPrefs({ track })}
        options={[{ value: 'auto', label: 'Auto' }, { value: 'day', label: SONGS.day.title }, { value: 'night', label: SONGS.night.title }]}
      />
      <Switch label="Sound effects" hint="Short blips when you open places and select things." on={p.sfx} onChange={(sfx) => { setPrefs({ sfx }); if (sfx) blip('select'); }} />
      <p className="tiny muted">The music is original chiptune, synthesized in your browser. No audio files are downloaded.</p>
    </div>
  );
}

export function DisplaySettings() {
  const p = usePrefs();
  const { choice } = useTheme();
  return (
    <div className="settings">
      <Choice<ThemeChoice>
        label="Time of day"
        hint="Auto follows your device’s light or dark mode."
        value={choice}
        onChange={setTheme}
        options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: '☀ Day' }, { value: 'dark', label: '☾ Night' }]}
      />
      <Switch label="Live session tracker" hint="The list of running agent sessions under your player card." on={p.tracker} onChange={(tracker) => setPrefs({ tracker })} />
      <Switch label="Atlas on the island" hint="Your chief of staff’s message at the bottom of the screen." on={p.atlas} onChange={(atlas) => setPrefs({ atlas })} />
    </div>
  );
}
