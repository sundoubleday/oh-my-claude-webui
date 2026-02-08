import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Enable standalone output for Electron packaging
  output: 'standalone',
  
  // Disable server-side image optimization (not needed in Electron)
  images: {
    unoptimized: true,
  },
  
  // Transpile packages if needed
  transpilePackages: ['@shared'],
  
  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // TypeScript and ESLint
  typescript: {
    // Allow production builds even with type errors (for faster iteration)
    ignoreBuildErrors: false,
  },
  eslint: {
    // Allow production builds even with lint errors
    ignoreDuringBuilds: true,
  },
  
  // Environment variables
  env: {
    BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5757',
  },
  
  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Handle native modules in Electron
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      }
    }
    return config
  },
}

export default nextConfig
