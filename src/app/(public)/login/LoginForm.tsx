'use client';

import { useActionState } from 'react';
import { login } from '@/app/actions';

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <label className="tiny" htmlFor="passcode">Passcode</label>
      <input id="passcode" name="passcode" type="password" autoComplete="current-password" required autoFocus />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary big" disabled={pending}>{pending ? 'Checking…' : 'Enter'}</button>
    </form>
  );
}
