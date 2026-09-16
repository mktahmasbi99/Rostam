import { generateSW } from "workbox-build";

await generateSW({
  globDirectory: "dist",
  globPatterns: ["**/*.{html,js,css,svg,png,webmanifest}"],
  globIgnores: ["sw.js"],
  swDest: "dist/sw.js",
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api(?:\/|$)/],
  runtimeCaching: [],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
});
