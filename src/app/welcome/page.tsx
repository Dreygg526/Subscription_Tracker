import { redirect } from 'next/navigation';

import { getAccess } from '@/lib/access';
import Wizard from './Wizard';

export const dynamic = 'force-dynamic';

/**
 * Onboarding. Reachable two ways: a brand-new customer with no account, and
 * someone who has an account but never finished the wizard (a signup that
 * worked while the profile write did not).
 */
export default async function WelcomePage() {
  const access = await getAccess();

  switch (access.state) {
    case 'signed-out':
      return <Wizard signedInEmail={null} brand={brandName()} />;

    case 'needs-onboarding':
      // Account exists, profile does not. Skip the account step.
      return <Wizard signedInEmail={access.email} brand={brandName()} />;

    case 'locked':
    case 'unlocked':
      // Already onboarded. "/" sorts out tracker vs locked.
      redirect('/');
  }
}

function brandName(): string {
  return process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Daily Tracker';
}
