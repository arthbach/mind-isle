'use client';

import { useEffect, useRef } from 'react';
import { SPRITES, drawSprite, type SpriteDef } from './sprites';

/** A 16×16 pixel sprite, by name or from a definition (the avatar is built per user). */
export function Sprite({ name, def, className, style }: { name?: keyof typeof SPRITES | string; def?: SpriteDef; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = def ? JSON.stringify(def) : name;
  useEffect(() => {
    const d = def ?? (name ? SPRITES[name] : undefined);
    if (ref.current && d) drawSprite(ref.current, d);
  // The definition is compared by content, not identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={ref} width={16} height={16} className={className} style={style} aria-hidden="true" />;
}
