import { type NextConfig } from 'next';

/**
 * @type {import('next').NextConfig}
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@poker/engine', '@poker/shared', '@poker/ui'],
  
  webpack: (config) => {
    // To solve the "TypeError: Cannot assign to read only property 'ignored' of object '#<Object>'"
    // we create a new object for watchOptions rather than modifying the existing, read-only one.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['../../node_modules/**'],
    };
    
    return config;
  },
};

export default nextConfig;