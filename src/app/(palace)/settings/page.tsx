import Link from 'next/link';
import { getWorld } from '@/lib/world';

const PAGES = [
  { href: '/settings/world', icon: '🌦', title: 'World', text: 'Season, fog of neglect, harbor ships.' },
  { href: '/settings/sound', icon: '♫', title: 'Sound', text: 'Music, volume, song, sound effects.' },
  { href: '/settings/display', icon: '☀', title: 'Display', text: 'Day or night, and which HUD panels show.' },
  { href: '/settings/agents', icon: '⚓', title: 'Agents', text: 'Which agent apps to read sessions from, and live hooks.' },
  { href: '/settings/summaries', icon: '📜', title: 'Summaries', text: 'Turn finished sessions into notes in your vault, and with which CLI.' },
];

export default async function SettingsPage() {
  const w = await getWorld();
  return (
    <div className="stack">
      <ul className="menu">
        {PAGES.map((p) => (
          <li key={p.href}>
            <Link href={p.href} className="menu-item">
              <span className="menu-icon" aria-hidden="true">{p.icon}</span>
              <span><b>{p.title}</b><span className="tiny muted">{p.text}</span></span>
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="tiny muted">
        Built from {w.noteCount} notes in <b>{w.vaultName}</b> · everything stays on this machine.
        World, Sound and Display are saved in this browser; Agents and Summaries are saved in your vault, in <code>Mind Isle/Settings.md</code>.
      </p>
    </div>
  );
}
