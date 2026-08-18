import { redirect } from 'next/navigation';

import { getAccess, requireOrderMatch } from '@/lib/access';
import { signOut } from '@/app/actions';
import { DISCLAIMER } from '@/lib/tips';

export const dynamic = 'force-dynamic';

/**
 * Signed in and onboarded, but nothing unlocks a challenge. This is also the
 * upsell surface: the 30-day buyer lands here when order matching is enforced.
 */
export default async function LockedPage() {
  const access = await getAccess();

  switch (access.state) {
    case 'signed-out':
      redirect('/login');
    case 'needs-onboarding':
      // Without this they ping-pong between here and the wizard.
      redirect('/welcome');
    case 'unlocked':
      redirect('/');
    case 'locked':
      break;
  }

  const offerUrl = process.env.NEXT_PUBLIC_OFFER_URL;
  const claimed = access.profile.claimed_label;
  const orderEmail = access.profile.order_email;

  return (
    <main className="shell auth">
      <div className="eyebrow">{process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Daily Tracker'}</div>
      <h1>Not unlocked yet</h1>

      {claimed && requireOrderMatch() ? (
        <p>
          You told us you bought the <strong>{claimed}</strong>, but we can&apos;t find that order
          under <strong>{orderEmail ?? access.email}</strong> yet.
        </p>
      ) : (
        <p>
          We couldn&apos;t find a qualifying order for <strong>{orderEmail ?? access.email}</strong>
          . The tracker comes free with the 90-day and 150-day bundles.
        </p>
      )}

      <div className="note">
        Two things to check: that this is the exact email you used at checkout, and that the order
        was placed more than a few minutes ago — new orders take a little while to sync.
      </div>

      {offerUrl && (
        <a className="btn" href={offerUrl}>
          See the bundles
        </a>
      )}

      <form action={signOut}>
        <button className="btn ghost" type="submit">
          Try a different email
        </button>
      </form>

      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}
