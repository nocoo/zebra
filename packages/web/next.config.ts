import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["pew.dev.hexly.ai"],
  images: {
    imageSizes: [16, 32, 48, 64, 80, 96, 128, 160, 256, 384],
  },
};

export default nextConfig;
