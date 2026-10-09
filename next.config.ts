import { NextConfig } from "next";
import { withBotId } from "botid/next/config";

import { withAppDefaults } from "./lib/next-config";

const nextConfig: NextConfig = withAppDefaults({
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
