import { redirect } from 'next/navigation';

import { getAdminSession, isAdminEmail } from '@/lib/access';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/actions';
import AdminLoginForm from './AdminLoginForm';

export const dynamic = 'force-dynamic';

/**
 * The admin console's own sign-in. Separate from the customer login because the
 * two hosts hold separate sessions -- signing into the tracker does not sign you
 * into admin, by design.
 */
export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect('/admin');

  // Signed in, but not on the allowlist. Say so rather than bouncing them back
  // to /admin, which would loop.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !isAdminEmail(user.email)) {
    return (
      <main className="shell auth">
        <div className="eyebrow">Admin</div>
        <h1>Not an admin account</h1>
        <p>
          You&apos;re signed in as <strong>{user.email}</strong>, which is not on the admin
          allowlist.
        </p>
        <form action={signOut}>
          <button className="btn ghost" type="submit">
            Sign out
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="shell auth">
      <div className="eyebrow">Admin</div>
      <h1>Console sign-in</h1>
      <p>This is the admin console, not the tracker. You need an account on the allowlist.</p>
      <AdminLoginForm />
    </main>
  );
}
