import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const iconSize = 256;
const rgbaPixels: number[] = [];

const isInsideRoundedRect = (
  x: number,
  y: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  radius: number,
): boolean => {
  if (x < left || x >= right || y < top || y >= bottom) return false;
  const cx =
    x < left + radius ? left + radius : x >= right - radius ? right - radius - 1 : x;
  const cy =
    y < top + radius ? top + radius : y >= bottom - radius ? bottom - radius - 1 : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
};

for (let y = iconSize - 1; y >= 0; y -= 1) {
  for (let x = 0; x < iconSize; x += 1) {
    const gradient = Math.round(24 + (x / iconSize) * 24 + (y / iconSize) * 18);
    let red = 15;
    let green = 23 + gradient;
    let blue = 42 + gradient;
    let alpha = 255;

    const card = isInsideRoundedRect(x, y, 38, 34, 218, 222, 28);
    if (card) {
      red = 248;
      green = 250;
      blue = 252;
    }

    const header = isInsideRoundedRect(x, y, 54, 52, 202, 86, 10);
    const rowOne = isInsideRoundedRect(x, y, 54, 108, 202, 128, 8);
    const rowTwo = isInsideRoundedRect(x, y, 54, 146, 178, 166, 8);
    const rowThree = isInsideRoundedRect(x, y, 54, 184, 132, 204, 8);
    const mark = isInsideRoundedRect(x, y, 154, 176, 202, 204, 8);

    if (header) {
      red = 30;
      green = 41;
      blue = 59;
    }

    if (rowOne || rowTwo || rowThree) {
      red = 100;
      green = 116;
      blue = 139;
    }

    if (mark) {
      red = 22;
      green = 163;
      blue = 74;
    }

    const transparentCorner = !isInsideRoundedRect(x, y, 16, 16, 240, 240, 40);
    if (transparentCorner) alpha = 0;

    rgbaPixels.push(blue, green, red, alpha);
  }
}

const xorBitmap = Buffer.from(rgbaPixels);
const andMaskStride = Math.ceil(iconSize / 32) * 4;
const andMask = Buffer.alloc(andMaskStride * iconSize);
const bitmapInfoHeader = Buffer.alloc(40);
bitmapInfoHeader.writeUInt32LE(40, 0);
bitmapInfoHeader.writeInt32LE(iconSize, 4);
bitmapInfoHeader.writeInt32LE(iconSize * 2, 8);
bitmapInfoHeader.writeUInt16LE(1, 12);
bitmapInfoHeader.writeUInt16LE(32, 14);
bitmapInfoHeader.writeUInt32LE(0, 16);
bitmapInfoHeader.writeUInt32LE(xorBitmap.length + andMask.length, 20);
bitmapInfoHeader.writeInt32LE(0, 24);
bitmapInfoHeader.writeInt32LE(0, 28);
bitmapInfoHeader.writeUInt32LE(0, 32);
bitmapInfoHeader.writeUInt32LE(0, 36);

const image = Buffer.concat([bitmapInfoHeader, xorBitmap, andMask]);
const directory = Buffer.alloc(6);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);
entry.writeUInt8(0, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(image.length, 8);
entry.writeUInt32LE(directory.length + entry.length, 12);

const assetsDirectory = resolve(process.cwd(), 'assets');
mkdirSync(assetsDirectory, { recursive: true });
writeFileSync(
  resolve(assetsDirectory, 'icon.ico'),
  Buffer.concat([directory, entry, image]),
);
