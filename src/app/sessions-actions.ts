'use server';

import { revalidatePath } from 'next/cache';
import * as manage from '@/lib/sessions/manage';

const refresh = () => revalidatePath('/', 'layout');

export async function enableSource(source: string, on: boolean) {
  await manage.setSourceEnabled(source, on);
  refresh();
}
export async function setHooks(source: string, on: boolean) {
  await manage.setSourceHooks(source, on);
  refresh();
}
export async function placeFolder(cwd: string, choice: manage.Placement) {
  await manage.placeFolder(cwd, choice);
  refresh();
}
export async function confirmAllAuto() {
  await manage.confirmAllAuto();
  refresh();
}
