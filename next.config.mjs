/** @type {import('next').NextConfig} */
// Keep the development server's output separate from production builds. Both
// commands otherwise write to .next, which can leave a running dev server with
// missing manifests or webpack chunks when a build runs at the same time.
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};
export default nextConfig;
