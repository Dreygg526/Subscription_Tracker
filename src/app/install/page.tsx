import InstallOptions from './InstallOptions';

export const dynamic = 'force-dynamic';

/**
 * Deliberately reachable signed out. Someone who has just bought a bundle may
 * want the app on their phone before they finish setting up, and this page
 * gives away nothing.
 */
export default function InstallPage() {
  // Empty until the APK is built and hosted -- see README, "Android app".
  // Left unset, the page shows the home-screen route instead of a dead link.
  const apkUrl = process.env.NEXT_PUBLIC_APK_URL?.trim() || null;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <div className="eyebrow">{process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Daily Tracker'}</div>
          <h1>Get the app</h1>
        </div>
        <a className="linkish" href="/">
          Back
        </a>
      </header>

      <p className="section-intro">
        Put the tracker on your home screen so logging a day is one tap, not a browser tab you
        forget to open. Your streak and history stay on your account either way.
      </p>

      <InstallOptions apkUrl={apkUrl} />
    </main>
  );
}
