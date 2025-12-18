/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const serverUrl = process.env.NEXUS_SERVER_URL || "http://localhost:4001";
    return [
      {
        source: "/api/nexus/:path*",
        destination: `${serverUrl}/api/nexus/:path*`,
      },
    ];
  },
};

export default nextConfig;

