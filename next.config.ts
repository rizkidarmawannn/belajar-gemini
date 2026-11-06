import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/**/*': ['./prompts/**/*'],
  },
  serverExternalPackages: ['pdf-parse', 'mammoth'],
};

export default nextConfig;
