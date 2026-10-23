/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.MK_BUILD_DIR || ".next",
  experimental: { cpus: 2 },
  // This project uses the explicit typecheck/test CI steps; no ESLint config is installed.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }, { key: 'X-Content-Type-Options', value: 'nosniff' }] },
      { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' }] }
    ];
  }
};
export default nextConfig;
