'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import PasswordField from '@/components/PasswordField';
import { createClient } from '@/lib/supabase/browser';
import { MIN_PASSWORD } from '@/lib/onboarding';

/**
 * Sets a password on the session the recovery link just created.
 *
 * This is also the path for anyone whose account predates password sign-in --
 * resetPasswordForEmail works for a user who has never had a password at all.
 */
export default function ResetForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < MIN_PASSWORD) {
      return setError(`Use at least ${MIN_PASSWORD} characters.`);
    }

    setWorking(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      // Almost always an expired or already-used link: updateUser needs the
      // session the recovery link created.
      setError(`${error.message}. If that link was old, ask for a fresh one.`);
      setWorking(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <PasswordField
        label="New password"
        value={password}
        onChange={setPassword}
        error={error ?? undefined}
        hint={`At least ${MIN_PASSWORD} characters.`}
        autoComplete="new-password"
        autoFocus
      />

      <button className="btn" type="submit" disabled={working}>
        {working ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}
