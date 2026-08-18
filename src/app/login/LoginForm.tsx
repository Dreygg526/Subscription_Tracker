'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import PasswordField from '@/components/PasswordField';
import { createClient } from '@/lib/supabase/browser';
import { isEmailish } from '@/lib/onboarding';

type Mode = 'sign-in' | 'reset';

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'working' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmailish(email)) return setError('That does not look like an email address.');

    setStatus('working');
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      // Supabase returns the same message for a wrong password and an unknown
      // address on purpose -- do not try to tell them apart here, that is the
      // defence against someone enumerating the customer list.
      setError('That email and password do not match. Check both and try again.');
      setStatus('idle');
      return;
    }

    router.replace('/');
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmailish(email)) return setError('That does not look like an email address.');

    setStatus('working');
    setError(null);

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    // Deliberately not checking the result. It succeeds even for an address with
    // no account, and saying "no account found" would leak the customer list.
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <>
        <div className="note" role="status">
          <strong>Check your inbox.</strong>
          <br />
          If {email} has an account, a link to set a password is on its way. Open it on the phone
          you want the tracker on. It works once and expires in an hour.
        </div>

        {/* This message is deliberately the same whether or not the account
            exists, so nobody can discover customers by typing addresses. That
            leaves one honest dead end: someone who never set up in the first
            place and is waiting on an email that was never sent. */}
        <p className="field-hint">
          Nothing arrives after a few minutes? You may not have set up your tracker yet — that
          takes a minute and asks which bundle you bought.
        </p>
        <a className="btn ghost" href="/welcome">
          Set up my tracker
        </a>
      </>
    );
  }

  const working = status === 'working';

  return (
    <form onSubmit={mode === 'sign-in' ? handleSignIn : handleReset}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          required
        />
      </div>

      {mode === 'sign-in' && (
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
      )}

      <button className="btn" type="submit" disabled={working}>
        {working ? 'One moment…' : mode === 'sign-in' ? 'Sign in' : 'Send me a link'}
      </button>

      {error && (
        <p className="note bad" role="alert">
          {error}
        </p>
      )}

      <p className="centered" style={{ marginTop: 'var(--space-5)' }}>
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'reset' : 'sign-in');
            setError(null);
          }}
        >
          {mode === 'sign-in'
            ? 'First time here, or forgotten your password?'
            : 'Back to signing in'}
        </button>
      </p>

      <p className="centered" style={{ marginTop: 'var(--space-3)' }}>
        <a className="linkish" href="/welcome">
          Bought a bundle? Set up your tracker
        </a>
      </p>
    </form>
  );
}
