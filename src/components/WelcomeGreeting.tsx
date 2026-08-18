'use client';

import { useEffect, useState } from 'react';

/**
 * A short greeting when someone arrives on the tracker.
 *
 * Once per browser session, not once per page view -- it plays after signing
 * in, and does not replay every time they navigate back to the tracker, which
 * would turn a nice moment into an obstacle between them and the button.
 *
 * Skipped entirely under prefers-reduced-motion: a full-screen element that
 * fades over the page is exactly what that setting is asking us not to do.
 */
export default function WelcomeGreeting({ name }: { name: string | null }) {
  const [phase, setPhase] = useState<'idle' | 'showing' | 'gone'>('idle');

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      if (reduced || sessionStorage.getItem('greeted') === '1') {
        setPhase('gone');
        return;
      }
      sessionStorage.setItem('greeted', '1');
    } catch {
      // Private mode. Showing it every time is better than crashing.
    }

    setPhase('showing');
    const done = setTimeout(() => setPhase('gone'), 2200);
    return () => clearTimeout(done);
  }, []);

  if (phase !== 'showing') return null;

  return (
    <div className="greeting" role="status" aria-live="polite">
      <div className="greeting-inner">
        <span className="greeting-hello">Welcome back</span>
        <span className="greeting-name">{name ?? 'friend'}</span>
      </div>
    </div>
  );
}
