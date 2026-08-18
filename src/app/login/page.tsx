import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/');

  return (
    <main className="shell auth">
      <div className="eyebrow">{process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Daily Tracker'}</div>
      <h1>Your daily tracker</h1>
      <p>Sign in with the email and password you set up when you claimed your tracker.</p>

      {error === 'link' && (
        <p className="note bad" role="alert">
          That link didn&apos;t work — it may have expired, or been used already. Send a fresh one
          below.
        </p>
      )}

      <LoginForm />
    </main>
  );
}
