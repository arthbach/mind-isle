import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The vault lives outside the project; nothing about it is bundled.
  poweredByHeader: false,
};

export default nextConfig;
