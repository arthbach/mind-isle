'use client';

import { useEffect, useRef } from 'react';
import { SPRITES, drawSprite } from './sprites';

export function Sprite({ name, className, style }: { name: keyof typeof SPRITES | string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const def = SPRITES[name];
    if (ref.current && def) drawSprite(ref.current, def);
  }, [name]);
  return <canvas ref={ref} width={16} height={16} className={className} style={style} aria-hidden="true" />;
}
