import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

/**
 * Hostname that serves the admin app, port included in dev. Must match the Host
 * header exactly. Leave EMPTY to serve both apps from one host -- which is what
 * a Vercel preview deploy needs, since it only gets one generated hostname.
 */
const ADMIN_HOST = (process.env.NEXT_PUBLIC_ADMIN_HOST ?? '').trim().toLowerCase();

/** The tracker owns these. manifest scope is "/", so serving it on the admin
 *  host would offer to install the console as if it were the tracker. */
const PWA_PATHS = new Set(['/manifest.webmanifest', '/sw.js', '/offline.html']);

/** The only paths the admin host serves. Everything else goes back to "/". */
function allowedOnAdminHost(path: string): boolean {
  return (
    path === '/' ||
    path.startsWith('/admin') ||
    path.startsWith('/api/admin') ||
    path.startsWith('/auth/') ||
    path.startsWith('/dev-login')
  );
}

/**
 * Refreshes the Supabase session cookie, optionally rewriting at the same time.
 *
 * Server Components can read cookies but not write them, so the refreshed token
 * has to be written here -- without this, customers get silently signed out when
 * their token expires. The response has to be rebuilt inside setAll, so the
 * rewrite target is threaded through rather than applied afterwards.
 */
async function withSession(request: NextRequest, rewriteTo?: URL) {
  const build = () =>
    rewriteTo ? NextResponse.rewrite(rewriteTo, { request }) : NextResponse.next({ request });

  let response = build();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet: CookiesToSet) {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = build();
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

/**
 * Splits the two apps by hostname. The tracker and the admin console ship from
 * one codebase but are separate entities: admin.<domain> serves only the
 * console, and the customer host does not expose it at all.
 *
 * This is deployment shape, NOT authorisation -- the Host header is set by the
 * client. requireAdmin() in src/lib/access.ts is the actual boundary, and every
 * admin page, action and route still calls it.
 *
 * Supabase cookies carry no Domain attribute, so each host keeps its own
 * session. Admins sign in twice, and a leaked customer session cannot reach
 * admin. Do not "fix" this with a shared cookie domain.
 */
export async function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase();
  const path = request.nextUrl.pathname;

  const split = ADMIN_HOST.length > 0;
  const isAdminHost = split && host === ADMIN_HOST;

  // Answered without touching the session, so the customer host pays no
  // Supabase round-trip for a static file.
  if (PWA_PATHS.has(path)) {
    if (isAdminHost) return new NextResponse('Not found', { status: 404 });
    return NextResponse.next();
  }

  if (isAdminHost) {
    if (!allowedOnAdminHost(path)) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // ONLY the root is rewritten. Prefix-rewriting everything would turn the
    // admin actions' redirect('/admin?tone=…') into /admin/admin -> 404, so
    // every action would silently dead-end after succeeding.
    if (path === '/') {
      return withSession(request, new URL('/admin', request.url));
    }
  } else if (split && (path.startsWith('/admin') || path.startsWith('/api/admin'))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return withSession(request);
}

export const config = {
  matcher: [
    // The PWA files are deliberately included (they were excluded before) so
    // the admin host can 404 them. They short-circuit above.
    // .well-known is excluded: Android fetches assetlinks.json to verify the
    // installed app owns this domain, and that must not depend on a session.
    '/((?!_next/static|_next/image|favicon.ico|icons/|\.well-known/).*)',
  ],
};
