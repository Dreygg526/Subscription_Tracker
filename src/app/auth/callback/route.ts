import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { originFromRequest } from '@/lib/origin';

/**
 * Only same-origin absolute paths are allowed as a redirect target. A recovery
 * link mints a full session, so an open redirect here would hand an attacker a
 * freshly signed-in account. "//evil.com" is protocol-relative, not a path.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}

/**
 * Where password-reset links and /dev-login land. Supabase sends either a PKCE
 * `code` or a `token_hash` depending on the project's email template, so handle
 * both.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = originFromRequest(request);
  const next = safeNext(searchParams.get('next'));
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const supabase = await createClient();

  // token_hash FIRST, deliberately. The PKCE `code` flow needs a code_verifier
  // cookie written by the browser that *requested* the link, so it only works
  // if the link is opened in that same browser. On a phone the link is usually
  // tapped inside the mail app's in-app browser, which has no verifier -- and
  // a phone is where this app is meant to live. verifyOtp has no such
  // requirement, so we use it whenever the link carries a token_hash.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Expired, already used, or opened on a different device than it was
  // requested from. Send them back to ask for a fresh one.
  return NextResponse.redirect(`${origin}/login?error=link`);
}
