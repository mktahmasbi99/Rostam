import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// Derive installation icons from the existing brand artwork at build time.
await mkdir("public/icons", { recursive: true });
for (const [name, size] of [["icon-192", 192], ["apple-touch-icon", 180]]) {
  await sharp("public/rostam-logo.png")
    .resize(size, size)
    .flatten({ background: "#eee4d2" })
    .png()
    .toFile(`public/icons/${name}.png`);
}
