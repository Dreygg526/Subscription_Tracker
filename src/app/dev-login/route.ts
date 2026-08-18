import { NextResponse, type NextRequest } from 'next/server';

import { createAdminClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/access';
import { originFromRequest } from '@/lib/origin';

/**
 * Local development shortcut: signs an admin in without the email round-trip.
 *
 * Magic links are single-use and long, which makes them miserable to use over
 * and over while developing -- a link that gets truncated when copied fails
 * with an error that looks exactly like an expired token.
 *
 * This route mints a token server-side and hands it to the real /auth/callback,
 * so the code path being exercised is still the production one.
 *
 * Two locks, both of which must hold:
 *   1. It 404s outright in a production build (Vercel sets NODE_ENV=production).
 *   2. The email must be on the ADMIN_EMAILS allowlist.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  // Not new URL(request.url).origin -- see originFromRequest. On the admin host
  // that would send the session to the customer app instead.
  const origin = originFromRequest(request);
  const email = (searchParams.get('email') ?? process.env.ADMIN_EMAILS ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase();

  if (!isAdminEmail(email)) {
    return new NextResponse(
      `"${email}" is not in ADMIN_EMAILS. Add it to .env.local, or pass ?email=`,
      { status: 403 }
    );
  }

  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error || !data.properties?.hashed_token) {
    return new NextResponse(`Could not mint a link: ${error?.message ?? 'no token returned'}`, {
      status: 500,
    });
  }

  const url = new URL('/auth/callback', origin);
  url.searchParams.set('token_hash', data.properties.hashed_token);
  url.searchParams.set('type', 'magiclink');

  return NextResponse.redirect(url);
}
