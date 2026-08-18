'use client';

import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

/**
 * Nudges the customer to put the app on their phone, and points at /install for
 * the full story (the Android download, or the iOS home-screen steps).
 *
 * Hidden once the app is actually installed -- inside the installed app this
 * card would be telling them to do something they have already done.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS reports installed apps here instead of via display-mode.
      (window.navigator as { standalone?: boolean }).standalone === true;

    if (standalone || localStorage.getItem('install-dismissed') === '1') return;

    setShow(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem('install-dismissed', '1');
    setShow(false);
  }

  return (
    <div className="install">
      <div style={{ flex: 1 }}>
        <strong>Get the app on your phone.</strong> One tap to log a day, straight from your home
        screen.
      </div>
      <div className="actions">
        {deferred ? (
          <button
            className="btn small"
            onClick={async () => {
              await deferred.prompt();
              dismiss();
            }}
          >
            Install
          </button>
        ) : (
          <a className="btn small" href="/install">
            Get it
          </a>
        )}
        <button className="btn small ghost" onClick={dismiss} aria-label="Dismiss install prompt">
          Not now
        </button>
      </div>
    </div>
  );
}
