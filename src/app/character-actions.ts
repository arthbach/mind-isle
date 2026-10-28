'use server';

import { revalidatePath } from 'next/cache';
import { parseLook, parsePersonality } from '@/lib/avatar';
import { updateSettings } from '@/lib/settings';
import { assertWritable } from '@/lib/vault/writer';

/** Save the avatar: only what the user entered, validated the same way the settings note is read. */
export async function saveAvatar(personality: unknown, look: unknown) {
  assertWritable();
  await updateSettings({ personality: parsePersonality(personality), look: parseLook(look) });
  revalidatePath('/', 'layout');
}
