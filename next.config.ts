import { NextConfig } from "next";
import { withBotId } from "botid/next/config";

import { withAppDefaults } from "./lib/next-config";

const nextConfig: NextConfig = withAppDefaults({
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
});

export default withBotId(nextConfig);
