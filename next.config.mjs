/** @type {import('next').NextConfig} */
const nextConfig = {
  // The admin console is served from admin.localhost:3000 in development, which
  // is a different origin to the dev server's own. Without this, Next 15 flags
  // its /_next/* requests as cross-origin and the page loads unstyled -- which
  // looks exactly like the .next-clobbering bug documented in CLAUDE.md.
  allowedDevOrigins: ['admin.localhost', 'admin.lvh.me'],

  async headers() {
    return [
      {
        // The service worker must not be cached, or installed users get stuck on an old shell.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
