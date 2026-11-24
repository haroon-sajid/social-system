/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  images: { unoptimized: true },
  // Keep the dev badge away from the sidebar
  devIndicators: { position: "bottom-right" },
};
export default nextConfig;
