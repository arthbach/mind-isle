'use server';

import { revalidatePath } from 'next/cache';
import type { WorldviewScan } from '@/lib/settings';
import * as worldview from '@/lib/worldview';

const refresh = () => revalidatePath('/', 'layout');

export async function chooseWorldview(scan: WorldviewScan, folders: string[], interview: boolean) {
  await worldview.chooseScope(scan, folders, interview);
  refresh();
}
/** Starts the scan and returns at once; the page polls its progress. */
export async function scanWorldview() {
  void worldview.runScan().catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  refresh();
}
export async function rejectWorldview(rel: string) {
  await worldview.rejectBanner(rel);
  refresh();
}
export async function worldviewInAi(rel: string, on: boolean) {
  await worldview.setUseInAi(rel, on);
  refresh();
}
export async function forgetWorldview(includeConfirmed: boolean) {
  const n = await worldview.forget(includeConfirmed);
  refresh();
  return n;
}
export async function answerInterview(index: number, answer: string) {
  await worldview.answerQuestion(index, answer);
  refresh();
}
export async function skipInterview(index: number) {
  await worldview.skipQuestion(index);
  refresh();
}
