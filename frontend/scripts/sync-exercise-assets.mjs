import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exercises } from "@bryllim/workout-guide";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "@bryllim", "workout-guide", "assets");
const destination = join(root, "public", "exercise-assets");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const targetDirectory = join(destination, entry.name);
  await mkdir(targetDirectory, { recursive: true });
  const imagePath = join(source, entry.name, "frame-1.png");
  const image = await readFile(imagePath);
  const version = createHash("sha256").update(image).digest("hex").slice(0, 16);
  await writeFile(join(targetDirectory, `frame-1.${version}.png`), image);
}

const available = new Set(await readdir(destination));
const catalog = exercises
  .filter((item) => available.has(item.slug))
  .map(({ slug, name }) => ({ slug, name }));
await mkdir(join(root, "src", "generated"), { recursive: true });
await writeFile(join(root, "src", "generated", "exercise-catalog.json"), `${JSON.stringify(catalog)}\n`);
const versions = {};
for (const item of catalog) {
  const files = await readdir(join(destination, item.slug));
  const filename = files.find((name) => name.startsWith("frame-1."));
  if (filename) versions[item.slug] = filename.slice("frame-1.".length, -".png".length);
}
await writeFile(join(root, "src", "generated", "exercise-artwork-versions.json"), `${JSON.stringify(versions)}\n`);

