import type { NextRequest } from 'next/server';

/**
 * The origin the browser actually asked for, e.g. "http://admin.localhost:3000".
 *
 * `new URL(request.url).origin` cannot be used for this: with two hostnames
 * served by one app, Next normalises the route-handler URL and it comes back as
 * the customer host even when the request arrived on the admin host. Redirecting
 * to that origin sends the freshly-minted session to the wrong app.
 */
export function originFromRequest(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return new URL(request.url).origin;

  const proto =
    request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.endsWith('.localhost') ? 'http' : 'https');

  return `${proto}://${host}`;
}
