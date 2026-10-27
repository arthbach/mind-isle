// Runs in the proxy and in server actions, so it uses Web Crypto only.
export const SESSION_COOKIE = 'palace_session';

export async function sessionToken(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(`mind-palace:${process.env.PALACE_SECRET ?? ''}:${passcode}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
