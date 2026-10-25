import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const output = "src/generated/artwork";
await mkdir(output, { recursive: true });
await mkdir("public/icons", { recursive: true });

for (const width of [768, 1214]) {
  const image = sharp("artwork/rostam-background.png").resize({ width, withoutEnlargement: true });
  await Promise.all([
    image.clone().webp({ quality: 82 }).toFile(`${output}/background-${width}.webp`),
    image.clone().jpeg({ quality: 85, mozjpeg: true }).toFile(`${output}/background-${width}.jpg`),
  ]);
}

for (const size of [112, 224, 336]) {
  const image = sharp("artwork/rostam-logo.png").resize(size, size);
  await Promise.all([
    image.clone().webp({ lossless: true }).toFile(`${output}/logo-${size}.webp`),
    image.clone().png().toFile(`${output}/logo-${size}.png`),
  ]);
}

await sharp("artwork/rostam-logo.png").resize(32, 32).png().toFile("public/favicon.png");
for (const [name, size] of [["icon-192", 192], ["icon-512", 512], ["apple-touch-icon", 180]]) {
  await sharp("artwork/rostam-logo.png")
    .resize(size, size)
    .flatten({ background: "#eee4d2" })
    .png()
    .toFile(`public/icons/${name}.png`);
}
