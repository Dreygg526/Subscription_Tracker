'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { localDate } from '@/lib/challenge';

export type CheckInResult = { ok: true; date: string } | { ok: false; error: string };

/** The one action the whole app exists for. Idempotent: tapping twice is a no-op. */
export async function checkIn(): Promise<CheckInResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Your session expired. Sign in again.' };

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();

  // Only someone with a challenge can log a day.
  const { data: challenge } = await admin
    .from('challenges')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!challenge) return { ok: false, error: 'No active challenge on this account.' };

  const today = localDate(profile?.timezone ?? 'UTC');

  const { error } = await admin
    .from('check_ins')
    .insert({ user_id: user.id, local_date: today });

  // 23505 = unique violation, i.e. already checked in today. That's a success.
  if (error && error.code !== '23505') {
    return { ok: false, error: "Couldn't save that. Check your connection and try again." };
  }

  revalidatePath('/');
  return { ok: true, date: today };
}

/** Stores the timezone the browser reports so "today" means their today. */
export async function setTimezone(timezone: string): Promise<void> {
  // Validate against the ICU database rather than trusting the client string.
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  } catch {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await createAdminClient().from('profiles').update({ timezone }).eq('id', user.id);
  revalidatePath('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // Local scope only. The default ('global') revokes every refresh token for
  // the user, so signing out on a laptop would also sign them out of the app
  // installed on their phone -- which is the copy they actually use daily.
  await supabase.auth.signOut({ scope: 'local' });
  // "/" rather than "/login", so this works on both hosts: the customer host
  // sends a signed-out visitor to /login, the admin host to /admin/login.
  redirect('/');
}
