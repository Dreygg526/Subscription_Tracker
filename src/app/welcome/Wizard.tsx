'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import PasswordField from '@/components/PasswordField';
import { BUNDLES } from '@/lib/bundles';
import { createClient } from '@/lib/supabase/browser';
import { DISCLAIMER } from '@/lib/tips';
import {
  GENDERS,
  MIN_PASSWORD,
  validateOnboarding,
  type FieldErrors,
  type OnboardingInput,
} from '@/lib/onboarding';
import { completeOnboarding, setProfileTimezone } from './actions';

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  'prefer-not-to-say': 'Prefer not to say',
};

const EMPTY: OnboardingInput = {
  fullName: '',
  age: '',
  gender: '',
  bundleId: '',
  orderEmail: '',
  email: '',
  password: '',
};

/** Fields validated at each step, in order. */
const STEP_FIELDS: (keyof OnboardingInput)[][] = [
  ['fullName'],
  ['age', 'gender'],
  ['bundleId'],
  ['orderEmail'],
  ['email', 'password'],
];

const DRAFT_KEY = 'onboarding-draft';

type Props = {
  /** Set when they already have an account and only need to finish the profile. */
  signedInEmail: string | null;
  brand: string;
};

export default function Wizard({ signedInEmail, brand }: Props) {
  const router = useRouter();

  // Someone who already has an account has nothing to do on the account step.
  const steps = signedInEmail ? STEP_FIELDS.length - 1 : STEP_FIELDS.length;

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  // Set when Supabase is holding the account until they click a confirmation
  // link. Their answers are already saved by then.
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  // Restore a half-finished wizard after a reload. The password is deliberately
  // never written to storage -- it lives in memory for the length of the flow.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) setDraft((d) => ({ ...d, ...JSON.parse(saved), password: '' }));
    } catch {
      // Private mode, or storage disabled. Not worth breaking the flow over.
    }
  }, []);

  useEffect(() => {
    try {
      const { password: _password, ...safe } = draft;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
    } catch {
      // As above.
    }
  }, [draft]);

  // Android's hardware Back should step backwards, not leave the app and throw
  // away four screens of answers.
  useEffect(() => {
    const onPop = () => setStep((s) => Math.max(0, s - 1));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const set = (key: keyof OnboardingInput, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    // Only re-validate a field that is already complaining, so errors don't
    // appear while someone is still typing their first character.
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validateStep = () => {
    const found = validateOnboarding(draft, STEP_FIELDS[step]);
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  function next() {
    if (!validateStep()) return;

    if (step < steps - 1) {
      window.history.pushState({ step: step + 1 }, '');
      setStep(step + 1);
      return;
    }

    void submit();
  }

  async function submit() {
    setWorking(true);
    setSubmitError(null);

    try {
      // Create the account first -- there is no profile row to write to until
      // auth.users has one.
      let needsConfirmation = false;

      if (!signedInEmail) {
        const supabase = createClient();
        const { data, error } = await supabase.auth.signUp({
          email: draft.email.trim().toLowerCase(),
          password: draft.password,
          options: { data: { full_name: draft.fullName.trim() } },
        });

        if (error) {
          setSubmitError(error.message);
          return;
        }

        // Supabase returns success with an empty identities array for an address
        // that already exists, rather than an error, so it can't be used to
        // enumerate accounts. Detect it and send them to sign in instead.
        if (data.user && data.user.identities?.length === 0) {
          setSubmitError('You already have an account with that email — sign in instead.');
          return;
        }

        // No session means email confirmation is on and Supabase is waiting for
        // the link to be clicked. The answers still get saved -- see
        // completeOnboarding -- so nobody has to fill this in twice.
        needsConfirmation = !data.session;
      }

      const result = await completeOnboarding({
        ...draft,
        email: signedInEmail ?? draft.email,
      });

      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }

      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to clean up.
      }

      if (needsConfirmation) {
        setAwaitingConfirm(true);
        return;
      }

      // Tell the server which timezone they are actually in before the tracker
      // computes "today". Only possible with a session.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) await setProfileTimezone(tz);

      router.replace('/');
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  function back() {
    setSubmitError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  if (awaitingConfirm) {
    return (
      <main className="shell auth">
        <div className="eyebrow">{brand}</div>
        <h1>One last click</h1>
        <p>
          We&apos;ve sent a confirmation link to <strong>{draft.email}</strong>. Open it and your
          tracker is ready — your answers are already saved, so there is nothing to fill in again.
        </p>
        <div className="note">
          Open it on the phone you want the tracker on. If it doesn&apos;t arrive in a few minutes,
          check your spam folder.
        </div>
        <a className="btn ghost" href="/login">
          Back to sign in
        </a>
        <p className="disclaimer">{DISCLAIMER}</p>
      </main>
    );
  }

  return (
    <main className="shell auth">
      <div className="eyebrow">{brand}</div>

      <div className="stepbar" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={steps}>
        {Array.from({ length: steps }, (_, i) => (
          <i key={i} className={i <= step ? 'on' : undefined} />
        ))}
      </div>
      <div className="eyebrow step-count">
        Step {step + 1} of {steps}
      </div>

      {step === 0 && (
        <>
          <h1>What should we call you?</h1>
          <p>This is just so the tracker doesn&apos;t greet you like a stranger every morning.</p>
          <div className="field">
            <label htmlFor="fullName">Your name</label>
            <input
              id="fullName"
              type="text"
              value={draft.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              onBlur={validateStep}
              autoComplete="name"
              aria-invalid={errors.fullName ? 'true' : undefined}
              autoFocus
            />
            {errors.fullName && (
              <p className="field-error" role="alert">
                {errors.fullName}
              </p>
            )}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1>A little about you</h1>
          <p>Both of these are optional. Skip them if you would rather not say.</p>

          <div className="field">
            <label htmlFor="age">Age</label>
            <input
              id="age"
              type="number"
              inputMode="numeric"
              min={13}
              max={120}
              value={draft.age}
              onChange={(e) => set('age', e.target.value)}
              onBlur={validateStep}
              aria-invalid={errors.age ? 'true' : undefined}
            />
            {errors.age && (
              <p className="field-error" role="alert">
                {errors.age}
              </p>
            )}
          </div>

          <div className="field">
            <label id="gender-label">Gender</label>
            <div className="segmented" role="group" aria-labelledby="gender-label">
              {GENDERS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={draft.gender === g ? 'on' : undefined}
                  aria-pressed={draft.gender === g}
                  onClick={() => set('gender', draft.gender === g ? '' : g)}
                >
                  {GENDER_LABELS[g]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Which bundle did you buy?</h1>
          <p>This sets how long your challenge runs — one day for every day of supply.</p>

          <div className="choices" role="radiogroup" aria-label="Bundle">
            {BUNDLES.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={draft.bundleId === b.id}
                className={`choice${draft.bundleId === b.id ? ' on' : ''}`}
                onClick={() => set('bundleId', b.id)}
              >
                <span>
                  <span className="choice-name">{b.name}</span>
                  <span className="choice-sub">
                    {b.supply} · {b.days}-day challenge
                  </span>
                </span>
                {b.note && <span className="pill">{b.note}</span>}
              </button>
            ))}
          </div>

          {errors.bundleId && (
            <p className="field-error" role="alert">
              {errors.bundleId}
            </p>
          )}

          <p className="field-hint">
            Taking prescription medication? Consult your doctor first.
          </p>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Which email did you order with?</h1>
          <p>
            We match this against the order that came with your free tracker. If you used a
            different address at checkout, put that one here.
          </p>

          <div className="field">
            <label htmlFor="orderEmail">Checkout email</label>
            <input
              id="orderEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft.orderEmail}
              onChange={(e) => set('orderEmail', e.target.value)}
              onBlur={validateStep}
              aria-invalid={errors.orderEmail ? 'true' : undefined}
              placeholder="you@example.com"
              autoFocus
            />
            {errors.orderEmail && (
              <p className="field-error" role="alert">
                {errors.orderEmail}
              </p>
            )}
          </div>
        </>
      )}

      {step === 4 && !signedInEmail && (
        <>
          <h1>Create your login</h1>
          <p>Last step. This is what you&apos;ll use to open the tracker each day.</p>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft.email}
              onChange={(e) => set('email', e.target.value)}
              onBlur={validateStep}
              aria-invalid={errors.email ? 'true' : undefined}
              placeholder="you@example.com"
            />
            {errors.email ? (
              <p className="field-error" role="alert">
                {errors.email}
              </p>
            ) : (
              <button
                type="button"
                className="linkish"
                onClick={() => set('email', draft.orderEmail)}
                style={{ marginTop: 'var(--space-2)' }}
              >
                Use my checkout email ({draft.orderEmail || 'none yet'})
              </button>
            )}
          </div>

          <PasswordField
            label="Password"
            value={draft.password}
            onChange={(v) => set('password', v)}
            onBlur={validateStep}
            error={errors.password}
            hint={`At least ${MIN_PASSWORD} characters.`}
          />
        </>
      )}

      {submitError && (
        <p className="note bad" role="alert">
          {submitError}
        </p>
      )}

      <div className="bottombar">
        {step > 0 && (
          <button type="button" className="btn ghost" onClick={back} disabled={working}>
            Back
          </button>
        )}
        <button type="button" className="btn" onClick={next} disabled={working}>
          {working ? 'Setting up…' : step === steps - 1 ? 'Start my challenge' : 'Continue'}
        </button>
      </div>

      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}
