import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import ResetForm from './ResetForm';

export const dynamic = 'force-dynamic';

/**
 * Where a recovery link lands, via /auth/callback?next=/reset-password.
 * The link has already created a session by the time this renders.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session means the link expired, was used already, or was never followed.
  if (!user) redirect('/login?error=link');

  return (
    <main className="shell auth">
      <div className="eyebrow">{process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Daily Tracker'}</div>
      <h1>Set your password</h1>
      <p>
        Pick a password for <strong>{user.email}</strong>. You&apos;ll use it every time you open
        the tracker, so make it one you can type on a phone.
      </p>

      <ResetForm />
    </main>
  );
}
