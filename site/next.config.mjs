/** @type {import('next').NextConfig} */
const nextConfig = {
  // The mobile web app is static files under /app/ and must be served at
  // /app/ (with the slash) so its relative paths and service-worker scope
  // line up. Next would otherwise strip that slash. (/app → /app/ is done in
  // proxy.js: redirect rules here ignore the slash and would loop.)
  skipTrailingSlashRedirect: true,

  async rewrites() {
    return [{ source: '/app/', destination: '/app/index.html' }];
  },

  async headers() {
    return [
      {
        // Browsers must always re-check the service worker, or app updates stall.
        source: '/app/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
