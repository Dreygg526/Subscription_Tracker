'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/access';
import type { MatchType } from '@/lib/challenge';

const MATCH_TYPES: MatchType[] = ['sku', 'variant_id', 'title_contains'];

/** Reports the outcome of a form action back to /admin as a banner. */
function say(tone: 'ok' | 'warn' | 'error', message: string): never {
  redirect(`/admin?tone=${tone}&msg=${encodeURIComponent(message)}`);
}

export async function createOffer(formData: FormData) {
  const admin = await requireAdmin();

  const label = String(formData.get('label') ?? '').trim();
  const matchType = String(formData.get('match_type') ?? '') as MatchType;
  const matchValue = String(formData.get('match_value') ?? '').trim();
  const days = Number(formData.get('challenge_days'));

  // These used to `return` silently, which is indistinguishable from success --
  // the exact failure grantAccess was fixed for.
  if (!label) return say('error', 'Give the rule a label customers will understand.');
  if (!matchValue) return say('error', 'A rule with no value to match would match nothing.');
  if (!MATCH_TYPES.includes(matchType)) return say('error', 'Pick what the rule matches on.');
  if (!Number.isInteger(days) || days < 1 || days > 400) {
    return say('error', 'Challenge length must be a whole number between 1 and 400.');
  }

  const { error } = await admin.from('offers').insert({
    label,
    match_type: matchType,
    match_value: matchValue,
    challenge_days: days,
    active: true,
  });

  if (error) return say('error', `Could not add that rule: ${error.message}`);

  revalidatePath('/admin');
  return say('ok', `"${label}" now unlocks a ${days}-day challenge.`);
}

export async function toggleOffer(formData: FormData) {
  const admin = await requireAdmin();

  const id = String(formData.get('id') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';
  if (!id) return say('error', 'That rule no longer exists.');

  const { error } = await admin.from('offers').update({ active: !active }).eq('id', id);
  if (error) return say('error', `Could not change that rule: ${error.message}`);

  revalidatePath('/admin');
  return say('ok', active ? 'Rule disabled — it no longer unlocks anything.' : 'Rule enabled.');
}

export async function deleteOffer(formData: FormData) {
  const admin = await requireAdmin();

  const id = String(formData.get('id') ?? '');
  if (!id) return say('error', 'That rule no longer exists.');

  const { error } = await admin.from('offers').delete().eq('id', id);
  if (error) return say('error', `Could not delete that rule: ${error.message}`);

  revalidatePath('/admin');
  return say('ok', 'Rule deleted. Anyone relying on it will lose access at their next visit.');
}

/** Manually grant access to one email — for support cases and gifted orders. */
export async function grantAccess(formData: FormData) {
  const admin = await requireAdmin();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const days = Number(formData.get('days'));

  // Every exit below reports back. A silent return here is indistinguishable
  // from success, which once meant granting to a mistyped address and only
  // finding out when the customer said they were still locked out.
  if (!email.includes('@')) return say('error', 'That does not look like an email address.');
  if (!Number.isInteger(days) || days < 1 || days > 400) {
    return say('error', 'Challenge length must be a whole number between 1 and 400.');
  }

  await admin.from('orders').upsert(
    {
      email,
      order_number: 'MANUAL',
      line_item_title: `Manual grant — ${days} Day Supply`,
      sku: null,
      variant_id: null,
      purchased_at: new Date().toISOString(),
      source: 'manual',
    },
    { onConflict: 'dedupe_key', ignoreDuplicates: true }
  );

  // Make sure an offer exists that this manual grant will match.
  const { data: existing } = await admin
    .from('offers')
    .select('id')
    .eq('match_type', 'title_contains')
    .eq('match_value', `Manual grant — ${days} Day Supply`)
    .maybeSingle();

  if (!existing) {
    await admin.from('offers').insert({
      label: `Manual grant (${days} days)`,
      match_type: 'title_contains',
      match_value: `Manual grant — ${days} Day Supply`,
      challenge_days: days,
      active: true,
    });
  }

  // A grant for an address nobody has ever signed in with is legitimate --
  // they may not have opened the app yet -- but it is also exactly what a
  // typo looks like, so say which one this is instead of just "done".
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  revalidatePath('/admin');

  return profile
    ? say('ok', `${email} now has a ${days}-day challenge.`)
    : say(
        'warn',
        `Granted ${days} days to ${email}, but nobody has signed in with that address yet. ` +
          `It will apply when they do — check the spelling if you expected them to be active.`
      );
}
