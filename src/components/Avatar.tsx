'use client';

import { avatarFor, type Look, type Personality } from '@/lib/avatar';
import { Sprite } from './Sprite';

/** The player's avatar, with its companion when it has one. Used in the header, on the Character page and on /hall. */
export function Avatar({ personality, look, className, companion = true }: { personality: Personality; look: Look; className?: string; companion?: boolean }) {
  const a = avatarFor(personality, look);
  return (
    <span className="avatar">
      <Sprite def={a.body} className={className} />
      {companion && a.companion && <Sprite def={a.companion} className="avatar-pet" />}
    </span>
  );
}
