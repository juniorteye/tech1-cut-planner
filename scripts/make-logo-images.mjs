// Makes the small logo images the app uses from the client's full logo.
// The original is 1.15 MB, far too heavy to load on a phone for a header.
// Run again if the logo changes: npm run logo
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SOURCE = "public/images/logo.png";

// The round badge in the original, measured: it sits above the tagline.
const BADGE = { centreX: 631, centreY: 552, radius: 526 };

const square = {
  left: BADGE.centreX - BADGE.radius,
  top: BADGE.centreY - BADGE.radius,
  width: BADGE.radius * 2,
  height: BADGE.radius * 2,
};

/** The badge alone, cut round so it sits on any background. */
async function badge(size, path) {
  const circle = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
  );
  await sharp(SOURCE)
    .extract(square)
    .resize(size, size)
    .composite([{ input: circle, blend: "dest-in" }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(path);
}

// Shown up to 56 px wide; twice that for sharp phone screens.
await badge(128, "src/assets/logo-badge.png");
await badge(256, "src/app/icon.png");

// Phones' home-screen icon must not be see-through, so it keeps the white.
await sharp(SOURCE).extract(square).resize(180, 180).png({ compressionLevel: 9, palette: true }).toFile("src/app/apple-icon.png");

// The installed app's icons (Android). White, never see-through, like the iPhone one.
await mkdir("public/icons", { recursive: true });
const whiteBadge = (size) =>
  sharp(SOURCE).extract(square).resize(size, size).png({ compressionLevel: 9, palette: true });
await whiteBadge(192).toFile("public/icons/icon-192.png");
await whiteBadge(512).toFile("public/icons/icon-512.png");

// Android may crop this one to a circle or rounded square, keeping only the middle
// 80%. So the badge fills 76% of it, on white.
const inner = Math.round(512 * 0.76);
const edge = Math.floor((512 - inner) / 2);
await sharp(await sharp(SOURCE).extract(square).resize(inner, inner).toBuffer())
  .extend({ top: edge, left: edge, bottom: 512 - inner - edge, right: 512 - inner - edge, background: "#ffffff" })
  .png({ compressionLevel: 9, palette: true })
  .toFile("public/icons/maskable-512.png");

// The full logo with its tagline, shown up to 240 px wide on the login page.
await sharp(SOURCE).resize(480, 480).webp({ quality: 85 }).toFile("src/assets/logo-full.webp");

console.log("Logo images made.");
