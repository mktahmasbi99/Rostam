import { createServer } from "node:http";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const frontend = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = join(frontend, "dist");
const fixtureBase = join(tmpdir(), `rostam-pwa-fixtures-${process.pid}`);
const versions = new Map([["1", join(fixtureBase, "v1")], ["2", join(fixtureBase, "v2")]]);
await rm(fixtureBase, { recursive: true, force: true });
await cp(source, versions.get("1"), { recursive: true });
await cp(source, versions.get("2"), { recursive: true });

const secondRoot = versions.get("2");
const buildId = "production-fixture-build-2";
const indexPath = join(secondRoot, "index.html");
const originalIndex = await readFile(indexPath, "utf8");
const updatedIndex = originalIndex.replace(/(<meta name="rostam-build" content=")[^"]+/, `$1${buildId}`);
const oldHtmlRevision = (await readFile(indexPath, "utf8")).match(/<meta name="rostam-build" content="([^"]+)/)?.[1];
if (!oldHtmlRevision || updatedIndex === originalIndex) throw new Error("Could not prepare the second production fixture.");
await writeFile(indexPath, updatedIndex);
const coordinatorPath = join(secondRoot, "update-coordinator.js");
const oldCoordinator = await readFile(coordinatorPath, "utf8");
await writeFile(coordinatorPath, oldCoordinator.replace(/const ROSTAM_BUILD_ID = "[^"]+";/, `const ROSTAM_BUILD_ID = "${buildId}";`));
const workerPath = join(secondRoot, "sw.js");
const worker = await readFile(workerPath, "utf8");
const indexEntry = worker.match(/\{url:"\/index\.html",revision:"([a-f0-9]+)"\}/);
if (!indexEntry) throw new Error("Could not find the HTML revision in the production worker.");
const newRevision = "f".repeat(64);
await writeFile(workerPath, worker.replace(indexEntry[1], newRevision));

let selectedVersion = "1";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/__test/switch" && request.method === "POST") {
    selectedVersion = url.searchParams.get("version") === "2" ? "2" : "1";
    response.writeHead(204).end();
    return;
  }
  const root = versions.get(selectedVersion);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
  try {
    let body = await readFile(file);
    const hashedAsset = pathname.startsWith("/assets/") && /-[\w-]{8,}\./.test(pathname);
    const compressible = /^(?:text\/|application\/(?:javascript|json|manifest\+json))/.test(types[extname(file)] ?? "");
    const gzip = compressible && /\bgzip\b/.test(request.headers["accept-encoding"] ?? "");
    if (gzip) body = gzipSync(body);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": pathname === "/sw.js" || pathname === "/update-coordinator.js" || pathname === "/index.html" ? "no-cache" : hashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
      ...(gzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
    });
    response.end(body);
  } catch { response.writeHead(404).end("Not found"); }
});
server.listen(4173, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(async () => { await rm(fixtureBase, { recursive: true, force: true }); process.exit(0); }));
