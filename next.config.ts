import { NextConfig } from "next";
import { withBotId } from "botid/next/config";

import { withNextDefaults } from "./lib/next-defaults";

const nextConfig: NextConfig = withNextDefaults({
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "static.wikia.nocookie.net" },
    ],
  },
});

export default withBotId(nextConfig);
