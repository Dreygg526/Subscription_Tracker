'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { bundleById } from '@/lib/bundles';
import { ALL_FIELDS, validateOnboarding, type OnboardingInput } from '@/lib/onboarding';

export type OnboardingResult = { ok: true } | { ok: false; message: string };

/** How long after signing up the profile can still be written without a session. */
const PENDING_WINDOW_MS = 30 * 60 * 1000;

/**
 * Writes the profile the sign-up flow collected. Called once, after the account
 * exists -- the earlier steps are answers for a user who has no row to write to
 * yet.
 *
 * Two ways in:
 *
 *  1. Email confirmation OFF. signUp returns a session, so the caller is
 *     authenticated and we write against their own user id.
 *  2. Email confirmation ON. signUp returns a user but NO session, because
 *     Supabase is waiting for them to click the link. Without this second path
 *     the customer would have to answer all five screens again after
 *     confirming, so the profile is written through the service role instead,
 *     matched on the email they just signed up with.
 *
 * Path 2 is deliberately narrow: the account must exist, must still be
 * unconfirmed, must have been created in the last half hour, and must not
 * already be onboarded. Abusing it means guessing a stranger's email during the
 * minutes between their signup and their confirmation click, and the worst you
 * could write is a name and a bundle choice they will see and can correct.
 *
 * Every exit reports back. A silent return would look exactly like success and
 * strand the customer on a flow that had already worked.
 */
export async function completeOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const errors = validateOnboarding(
    input,
    // The account fields belong to Supabase and are already spent by now.
    ALL_FIELDS.filter((f) => f !== 'email' && f !== 'password')
  );

  const firstError = Object.values(errors)[0];
  if (firstError) return { ok: false, message: firstError };

  const bundle = bundleById(input.bundleId);
  if (!bundle) return { ok: false, message: 'Choose the bundle you bought.' };

  const admin = createAdminClient();

  // --- who are we writing for? ---
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userId = user?.id ?? null;
  let email = user?.email?.toLowerCase() ?? null;

  if (!userId) {
    const claimed = input.email.trim().toLowerCase();
    if (!claimed) {
      return { ok: false, message: 'Your sign-in did not stick. Try creating the account again.' };
    }

    const { data: list, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    if (listError) {
      return { ok: false, message: `We could not confirm that account: ${listError.message}` };
    }

    const pending = list.users.find((u) => u.email?.toLowerCase() === claimed);

    if (!pending) {
      return { ok: false, message: 'That account does not exist yet. Try creating it again.' };
    }
    if (pending.email_confirmed_at) {
      // Already confirmed: they should be signing in, not onboarding fresh.
      return { ok: false, message: 'That email is already confirmed — sign in instead.' };
    }
    if (Date.now() - new Date(pending.created_at).getTime() > PENDING_WINDOW_MS) {
      return { ok: false, message: 'That sign-up has expired. Start again.' };
    }

    const { data: existing } = await admin
      .from('profiles')
      .select('onboarded_at')
      .eq('id', pending.id)
      .maybeSingle();

    if (existing?.onboarded_at) {
      return { ok: false, message: 'That account is already set up — sign in instead.' };
    }

    userId = pending.id;
    email = claimed;
  }

  const age = input.age.trim() ? Number(input.age) : null;

  const { error } = await admin.from('profiles').upsert(
    {
      id: userId,
      email: email!,
      full_name: input.fullName.trim(),
      age,
      gender: input.gender.trim() || null,
      claimed_days: bundle.days,
      claimed_label: bundle.label,
      order_email: input.orderEmail.trim().toLowerCase(),
      // Until this is set, getAccess() keeps returning needs-onboarding, so a
      // failed write leaves the flow resumable rather than stranding someone
      // in a half-built account.
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    return { ok: false, message: `We could not save that: ${error.message}` };
  }

  return { ok: true };
}

/** Timezone is captured separately so "today" is the customer's today. */
export async function setProfileTimezone(timezone: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !timezone) return;

  await createAdminClient().from('profiles').update({ timezone }).eq('id', user.id);
}
