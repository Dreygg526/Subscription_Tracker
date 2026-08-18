'use client';

import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
type Platform = 'unknown' | 'ios' | 'android' | 'desktop' | 'installed';

/**
 * The "get the app" screen.
 *
 * Three genuinely different stories, so detect rather than guess:
 *
 *  - Android can install a real signed APK, downloaded from this page, OR use
 *    the browser's own install prompt. The APK is a build artifact -- it is
 *    built once with Bubblewrap/PWABuilder and hosted; nothing here generates
 *    it on the fly.
 *  - iOS cannot sideload anything. No APK, no installer, no exception. Add to
 *    Home Screen is the whole story, and it has to be done from Safari.
 *  - Desktop browsers install the PWA from the address bar.
 */
export default function InstallOptions({ apkUrl }: { apkUrl: string | null }) {
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS reports installed apps here instead of via display-mode.
      (window.navigator as { standalone?: boolean }).standalone === true;

    if (standalone) {
      setPlatform('installed');
      return;
    }

    const ua = navigator.userAgent;
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      // iPadOS 13+ reports itself as a Mac, but a Mac has no touch points.
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    setPlatform(isIOS ? 'ios' : /android/i.test(ua) ? 'android' : 'desktop');

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (platform === 'unknown') return null;

  if (platform === 'installed') {
    return (
      <div className="note" role="status">
        <strong>You&apos;re already using the installed app.</strong>
        <br />
        Nothing else to do — check in from here every day.
      </div>
    );
  }

  return (
    <>
      {platform === 'android' && (
        <div className="card">
          <h2>Android</h2>

          {apkUrl ? (
            <>
              <p className="tip-title">Download the app</p>
              <p className="tip-body">
                Installs like any other app, with its own icon in your app drawer.
              </p>
              <a className="btn" href={apkUrl} download>
                Download for Android
              </a>
              <p className="field-hint">
                Android will warn you about installing from outside the Play Store — that warning is
                normal for an app downloaded straight from a website. Tap{' '}
                <strong>Settings → Allow from this source</strong>, then open the downloaded file.
              </p>
            </>
          ) : (
            <p className="tip-body">
              The downloadable Android app isn&apos;t published yet. Adding it to your home screen
              below gives you the same thing in the meantime.
            </p>
          )}

          <hr className="sep" />

          <p className="tip-title">Or add it to your home screen</p>
          <p className="tip-body">No download, works straight away.</p>
          {deferred ? (
            <button className="btn ghost" onClick={() => void deferred.prompt()}>
              Add to home screen
            </button>
          ) : (
            <p className="field-hint">
              Open your browser menu (⋮) and choose <strong>Add to Home screen</strong>.
            </p>
          )}
        </div>
      )}

      {platform === 'ios' && (
        <div className="card">
          <h2>iPhone &amp; iPad</h2>
          <p className="tip-title">Add it to your home screen</p>
          <p className="tip-body">
            Apple doesn&apos;t allow apps to be downloaded from a website, so this is how it works
            on iPhone — and it gives you the same thing: an icon on your home screen that opens
            full screen, with no browser bars.
          </p>
          <ol className="steps-list">
            <li>
              Tap the <strong>Share</strong> button at the bottom of Safari (the square with an
              arrow).
            </li>
            <li>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong>. The icon appears with your other apps.
            </li>
          </ol>
          <p className="field-hint">
            This has to be done in Safari. If you opened this from Instagram, Gmail or another app,
            tap the ⋯ menu and choose <strong>Open in Safari</strong> first.
          </p>
        </div>
      )}

      {platform === 'desktop' && (
        <div className="card">
          <h2>This computer</h2>
          <p className="tip-body">
            The tracker is built for a phone — that&apos;s where you&apos;ll actually remember to
            tap it. Open this page on your phone to install it there.
          </p>
          {deferred && (
            <button className="btn ghost" onClick={() => void deferred.prompt()}>
              Install here anyway
            </button>
          )}
        </div>
      )}
    </>
  );
}
