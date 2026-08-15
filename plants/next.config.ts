import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    dangerouslyAllowLocalIP: true,
  },
  allowedDevOrigins: ["192.168.16.37", "172.17.0.1", "localhost"],
};

export default nextConfig;
