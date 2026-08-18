'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import PasswordField from '@/components/PasswordField';
import { createClient } from '@/lib/supabase/browser';

export default function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setError('That email and password do not match.');
      setWorking(false);
      return;
    }

    // The allowlist is checked server-side on /admin. Signing in successfully
    // here proves nothing about being an admin.
    router.replace('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>

      <PasswordField
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />

      <button className="btn" type="submit" disabled={working}>
        {working ? 'One moment…' : 'Sign in'}
      </button>

      {error && (
        <p className="note bad" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
