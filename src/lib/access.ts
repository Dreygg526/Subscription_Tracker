import 'server-only';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import {
  entitlementFor,
  localDate,
  resolveChallenge,
  type Entitlement,
  type Offer,
} from '@/lib/challenge';

export type Profile = {
  id: string;
  email: string;
  timezone: string;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  claimed_days: number | null;
  claimed_label: string | null;
  order_email: string | null;
  onboarded_at: string | null;
};

export type Access =
  | { state: 'signed-out' }
  | { state: 'needs-onboarding'; email: string }
  | { state: 'locked'; email: string; profile: Profile }
  | {
      state: 'unlocked';
      userId: string;
      email: string;
      profile: Profile;
      timezone: string;
      today: string;
      /** Null when the challenge rests on an unverified onboarding claim. */
      entitlement: Entitlement | null;
      /** True when a real imported order backs this challenge. */
      verified: boolean;
      challenge: { length_days: number; started_on: string; offer_label: string | null };
      checkInDates: string[];
    };

/** True if this email is on the ADMIN_EMAILS allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/**
 * When false, the bundle the customer picked during sign-up sizes their
 * challenge, and an order only decides whether they show as verified. When
 * true, only an imported order counts and a claim unlocks nothing.
 *
 * See resolveChallenge in lib/challenge.ts, and CLAUDE.md.
 */
export function requireOrderMatch(): boolean {
  return (process.env.REQUIRE_ORDER_MATCH ?? '').trim().toLowerCase() === 'true';
}

/**
 * The signed-in admin, or null. One shared check -- callers decide how to fail,
 * because a page wants a redirect, an API route wants a 403, and a server action
 * wants to throw.
 */
export async function getAdminSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) return null;
  return { user: user!, admin: createAdminClient() };
}

/** Service-role client, or a thrown error. For server actions. */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('Not authorised');
  return session.admin;
}

/**
 * Resolves everything the tracker screen needs in one pass, and lazily creates
 * the challenge row the first time a qualifying customer signs in.
 *
 * The profile row is created here too, but empty -- it is onboarding that fills
 * it in, and an un-onboarded profile is what `needs-onboarding` means.
 */
export async function getAccess(): Promise<Access> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { state: 'signed-out' };

  const email = user.email.toLowerCase();
  const admin = createAdminClient();

  // --- profile ---
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  let profile = existingProfile as Profile | null;

  if (!profile) {
    const row = {
      id: user.id,
      email,
      timezone: 'UTC',
      full_name: null,
      age: null,
      gender: null,
      claimed_days: null,
      claimed_label: null,
      order_email: null,
      onboarded_at: null,
    };
    await admin.from('profiles').insert(row);
    profile = row as Profile;
  }

  // They have an account but have not finished the wizard.
  if (!profile.onboarded_at) return { state: 'needs-onboarding', email };

  const timezone = profile.timezone ?? 'UTC';
  const today = localDate(timezone);

  // --- does anything they bought unlock a challenge? ---
  // Match on both addresses: the one they log in with, and the one they say they
  // used at checkout. They are often not the same person's typing.
  const orderEmails = [email, profile.order_email?.toLowerCase()].filter(
    (e, i, all): e is string => Boolean(e) && all.indexOf(e) === i
  );

  const [{ data: orders }, { data: offers }] = await Promise.all([
    admin
      .from('orders')
      .select('sku, variant_id, line_item_title, purchased_at')
      .in('email', orderEmails),
    admin.from('offers').select('*'),
  ]);

  const entitlement = entitlementFor(orders ?? [], (offers ?? []) as Offer[]);

  const { days, offerLabel, verified } = resolveChallenge(
    { days: profile.claimed_days, label: profile.claimed_label },
    entitlement,
    requireOrderMatch()
  );

  if (!days) return { state: 'locked', email, profile };

  // --- challenge row: create on first unlock, upgrade if they bought bigger ---
  const { data: existingChallenge } = await admin
    .from('challenges')
    .select('length_days, started_on, offer_label')
    .eq('user_id', user.id)
    .maybeSingle();

  let challenge = existingChallenge;

  if (!challenge) {
    const row = {
      user_id: user.id,
      length_days: days,
      // Their challenge starts the day they first open the app, not the day
      // they ordered -- the bottle has to arrive first.
      started_on: today,
      offer_label: offerLabel,
    };
    await admin.from('challenges').insert(row);
    challenge = row;
  } else if (days !== challenge.length_days || offerLabel !== challenge.offer_label) {
    // Re-synced in BOTH directions, not just upgrades. Offers and claims are
    // matched at read time by design, so the stored row has to follow -- a
    // one-way upgrade meant a corrected 30-day pick stayed stuck at 90 forever.
    // started_on is never touched: their day count must not restart.
    await admin
      .from('challenges')
      .update({ length_days: days, offer_label: offerLabel })
      .eq('user_id', user.id);
    challenge = { ...challenge, length_days: days, offer_label: offerLabel };
  }

  const { data: checkIns } = await admin
    .from('check_ins')
    .select('local_date')
    .eq('user_id', user.id)
    .order('local_date', { ascending: true });

  return {
    state: 'unlocked',
    userId: user.id,
    email,
    profile,
    timezone,
    today,
    entitlement,
    verified,
    challenge,
    checkInDates: (checkIns ?? []).map((c) => c.local_date as string),
  };
}
