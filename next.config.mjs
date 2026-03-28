/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Content-Security-Policy',      value: "media-src 'self' https://bfpjexlmoqoacoglqugl.supabase.co" },
        ],
      },
    ];
  },
};

export default nextConfig;
