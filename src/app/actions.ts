'use server';

// Thin server-action wrappers. The logic lives in src/lib/checkin.ts so it can be tested without Next.js.
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import * as checkin from '@/lib/checkin';
import type { Phase } from '@/lib/gate';
import { SESSION_COOKIE, safeEqual, sessionToken } from '@/lib/session';
import type { BeliefStatus, ProjectStatus } from '@/lib/types';

const refresh = () => revalidatePath('/', 'layout');

export async function lockPlan(input: { energy: number | null; items: string[] }) {
  await checkin.writeDawn(input);
  refresh();
}
export async function unlockPlan() {
  await checkin.unlockDawn();
  refresh();
}
export async function skipCheckin(phase: Phase) {
  await checkin.skipPhase(phase);
  refresh();
}
export async function closeDay(input: checkin.DuskInput) {
  await checkin.writeDusk(input);
  refresh();
}
export async function reopenDay() {
  await checkin.reopenDusk();
  refresh();
}
export async function completeQuest(id: string, expected: string) {
  await checkin.completeQuest(id, expected);
  refresh();
}
export async function dropQuest(id: string, expected: string) {
  await checkin.dropQuest(id, expected);
  refresh();
}
export async function lightLantern(personRel: string) {
  await checkin.touchPerson(personRel);
  refresh();
}
export async function logProjectUpdate(input: { rel: string; text: string; date: string; status?: ProjectStatus | null }) {
  await checkin.logProjectUpdate(input);
  refresh();
}
export async function setCircle(personRel: string, circle: string) {
  await checkin.setCircle(personRel, circle);
  refresh();
}
export async function voteBelief(rel: string, status: BeliefStatus) {
  await checkin.setBeliefStatus(rel, status);
  refresh();
}
export async function judgeDecision(id: string, path: string, verdict: string) {
  await checkin.setVerdict(id, path, verdict);
  refresh();
}

// ---------- Auth ----------

export async function login(_: string | null, form: FormData): Promise<string | null> {
  const pass = process.env.PALACE_PASSCODE;
  if (!pass) redirect('/');
  const given = String(form.get('passcode') ?? '');
  if (!safeEqual(await sessionToken(given), await sessionToken(pass))) return 'That passcode is not right.';
  // Secure cookies only over https; on a home network the phone usually talks plain http.
  const https = (await headers()).get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
  (await cookies()).set(SESSION_COOKIE, await sessionToken(pass), {
    httpOnly: true, sameSite: 'lax', secure: https, path: '/', maxAge: 60 * 60 * 24 * 90,
  });
  const next = String(form.get('next') ?? '/');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}
