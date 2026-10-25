import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { generateSW } from "workbox-build";

const dist = resolve("dist");
const frontendManifest = JSON.parse(await readFile(join(dist, ".vite", "manifest.json"), "utf8"));
const entry = Object.values(frontendManifest).find((item) => item.isEntry);
if (!entry) throw new Error("Vite manifest has no application entry.");

const staticFiles = new Set(["index.html"]);
function addStaticTree(item) {
  if (!item) return;
  if (item.file) staticFiles.add(item.file);
  for (const css of item.css ?? []) staticFiles.add(css);
  for (const asset of item.assets ?? []) {
    if (/\.(?:woff2?|ttf|otf|svg)$/i.test(asset)) staticFiles.add(asset);
  }
  for (const imported of item.imports ?? []) addStaticTree(frontendManifest[imported]);
}
addStaticTree(entry);
for (const file of ["manifest.webmanifest", "favicon.png", "icons/icon-192.webp", "icons/icon-512.webp", "icons/apple-touch-icon.png"]) staticFiles.add(file);

const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(dist);
const digest = createHash("sha256");
for (const path of files.sort()) {
  if (["index.html", "sw.js", "precache-manifest.json"].includes(relative(dist, path))) continue;
  digest.update(relative(dist, path));
  digest.update(await readFile(path));
}
digest.update(await readFile(new URL("./update-coordinator.js", import.meta.url)));
const buildId = digest.digest("hex").slice(0, 20);
const htmlPath = join(dist, "index.html");
let html = await readFile(htmlPath, "utf8");
const htmlRevision = createHash("sha256").update(html).digest("hex");
html = html.replace("</head>", `  <meta name="rostam-build" content="${buildId}" />\n  </head>`);
await writeFile(htmlPath, html);

const publicFiles = [];
for (const path of [...staticFiles].sort()) {
  const resolved = resolve(dist, path);
  if (!resolved.startsWith(`${dist}/`)) throw new Error(`Invalid precache path: ${path}`);
  const info = await stat(resolved).catch(() => null);
  if (!info?.isFile()) throw new Error(`Required shell asset is missing: ${path}`);
  const isHashedAsset = /^assets\/.+-[\w-]{8,}\./.test(path);
  const revision = path === "index.html" ? htmlRevision : isHashedAsset ? null : createHash("sha256").update(await readFile(resolved)).digest("hex");
  publicFiles.push({ url: `/${path}`, revision });
}
const measuredBytes = await Promise.all(publicFiles.map(async (item) => stat(join(dist, item.url.slice(1))).then((info) => info.size)));
const totalPrecacheBytes = measuredBytes.reduce((total, size) => total + size, 0);
if (totalPrecacheBytes > 1024 * 1024) console.warn(`Essential precache exceeds 1 MiB: ${totalPrecacheBytes} bytes across ${publicFiles.length} files.`);

const { warnings } = await generateSW({
  globDirectory: dist,
  globPatterns: [],
  additionalManifestEntries: publicFiles,
  swDest: join(dist, "sw.js"),
  importScripts: ["/update-coordinator.js"],
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api(?:\/|$)/],
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.origin === self.location.origin && /^\/assets\/(?:background|logo)-[\w-]+\.(?:webp|jpe?g|png)$/.test(url.pathname),
      handler: "CacheFirst",
      options: { cacheName: "rostam-public-artwork", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 } },
    },
    {
      urlPattern: ({ url }) => url.origin === self.location.origin && /^\/exercise-assets\/[\w-]+\/frame-1\.[a-f0-9]{16}\.png$/.test(url.pathname),
      handler: "CacheFirst",
      options: { cacheName: "rostam-public-artwork", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 } },
    },
    {
      urlPattern: ({ url }) => url.origin === self.location.origin && /^\/assets\/[\w-]+-[\w-]{8,}\.(?:js|css)$/.test(url.pathname),
      handler: "CacheFirst",
      options: { cacheName: "rostam-deferred-code", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 32, maxAgeSeconds: 30 * 24 * 60 * 60 } },
    },
  ],
  cleanupOutdatedCaches: true,
  clientsClaim: false,
  skipWaiting: false,
});
if (warnings.length) throw new Error(`Workbox warnings:\n${warnings.join("\n")}`);
const serviceWorkerPath = join(dist, "sw.js");
const serviceWorkerSource = await readFile(serviceWorkerPath, "utf8");
const skipWaitingListener = 'self.addEventListener("message",e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()}),';
if (!serviceWorkerSource.includes(skipWaitingListener)) throw new Error("Could not remove Workbox's uncoordinated skip-waiting handler.");
await writeFile(serviceWorkerPath, serviceWorkerSource.replace(skipWaitingListener, ""));

const report = { buildId, essentialPrecacheFiles: publicFiles.length, essentialPrecacheBytes: totalPrecacheBytes, files: publicFiles.map((item, index) => ({ url: item.url, bytes: measuredBytes[index] })) };
await writeFile(join(dist, "precache-report.json"), `${JSON.stringify(report, null, 2)}\n`);
const coordinatorSource = await readFile(new URL("./update-coordinator.js", import.meta.url), "utf8");
await writeFile(join(dist, "update-coordinator.js"), coordinatorSource.replaceAll("__ROSTAM_BUILD_ID__", buildId));
console.info(`Essential precache: ${publicFiles.length} files, ${totalPrecacheBytes} uncompressed bytes (${buildId}).`);
