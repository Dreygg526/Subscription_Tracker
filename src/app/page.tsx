import { redirect } from 'next/navigation';

import { getAccess } from '@/lib/access';
import { signOut } from '@/app/actions';
import { DISCLAIMER } from '@/lib/tips';
import Tracker from '@/components/Tracker';
import InstallPrompt from '@/components/InstallPrompt';
import WelcomeGreeting from '@/components/WelcomeGreeting';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const access = await getAccess();

  // A switch rather than an if-chain, so the next state added to the Access
  // union is a compile error here instead of a blank screen.
  switch (access.state) {
    case 'signed-out':
      redirect('/login');
    case 'needs-onboarding':
      redirect('/welcome');
    case 'locked':
      redirect('/locked');
    case 'unlocked':
      break;
  }

  const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'supplement';
  const firstName = access.profile.full_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <main className="shell wide">
      <WelcomeGreeting name={firstName} />

      <header className="top">
        <div>
          <div className="eyebrow">{process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Daily Tracker'}</div>
          {/* Their name leads. The challenge length is its own line rather than
              being possessive'd onto it -- "Hello's 90-day challenge" read as a
              greeting that had gone wrong. */}
          <h1>{firstName ? `Hello, ${firstName}` : 'Hello'}</h1>
          <p className="challenge-heading">{access.challenge.length_days}-day challenge</p>
        </div>
        <form action={signOut}>
          <button className="linkish" type="submit">
            Sign out
          </button>
        </form>
      </header>

      <Tracker
        today={access.today}
        timezone={access.timezone}
        startedOn={access.challenge.started_on}
        lengthDays={access.challenge.length_days}
        offerLabel={access.challenge.offer_label}
        initialCheckIns={access.checkInDates}
        productName={productName}
      />

      <InstallPrompt />

      {/* Permanent, because InstallPrompt can be dismissed forever. */}
      <p className="centered" style={{ marginTop: 'var(--space-5)' }}>
        <a className="linkish" href="/install">
          Get the app on your phone
        </a>
      </p>

      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}
