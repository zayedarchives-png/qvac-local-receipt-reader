// Draws a few synthetic receipts into samples/ so the OCR pipeline has
// repeatable test input. Run with: npm run samples
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import Jimp from 'jimp';

const OUT_DIR = path.resolve('samples');
const WIDTH = 640;
const MARGIN = 36;
const LINE = 46;

// Each receipt is a list of lines. A line is either a string (left aligned),
// { center } for a heading, [label, value] for a two-column row, or '---'.
const receipts = {
  'greenleaf-grocery': [
    { center: 'GREENLEAF GROCERY' },
    { center: '14 Orchard Road' },
    'Date: 2026-09-18  10:42',
    '---',
    ['Bananas 1kg', '1.89'],
    ['Oat Milk', '3.25'],
    ['Brown Rice 2kg', '4.60'],
    ['Cheddar 200g', '2.95'],
    '---',
    ['Subtotal', '12.69'],
    ['Tax', '0.63'],
    ['TOTAL', '13.32'],
    { center: 'Thank you!' },
  ],
  'northway-fuel': [
    { center: 'NORTHWAY FUEL' },
    { center: 'Pump 6' },
    'Date: 21/09/2026  18:05',
    '---',
    ['Unleaded 32.4L', '58.32'],
    ['Car Wash', '7.00'],
    '---',
    ['AMOUNT DUE', '65.32'],
    ['Card', 'VISA'],
    { center: 'Drive safe' },
  ],
  'mapleside-pharmacy': [
    { center: 'MAPLESIDE PHARMACY' },
    'Date: Sep 22, 2026',
    '---',
    ['Vitamin D', '8.40'],
    ['Bandages', '3.15'],
    ['Cough Syrup', '6.99'],
    ['Hand Cream', '4.50'],
    '---',
    ['Subtotal', '23.04'],
    ['Discount', '-2.00'],
    ['GRAND TOTAL', '21.04'],
  ],
};

async function drawReceipt(lines, font) {
  const height = MARGIN * 2 + lines.length * LINE;
  const img = new Jimp(WIDTH, height, 0xffffffff);
  let y = MARGIN;

  for (const line of lines) {
    if (line === '---') {
      const mid = y + Math.floor(LINE / 2);
      img.scan(MARGIN, mid, WIDTH - MARGIN * 2, 2, function (_x, _y, idx) {
        this.bitmap.data.writeUInt32BE(0x999999ff, idx);
      });
    } else if (Array.isArray(line)) {
      const [label, value] = line;
      img.print(font, MARGIN, y, label);
      const valueWidth = Jimp.measureText(font, value);
      img.print(font, WIDTH - MARGIN - valueWidth, y, value);
    } else if (typeof line === 'object') {
      img.print(font, 0, y, {
        text: line.center,
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      }, WIDTH);
    } else {
      img.print(font, MARGIN, y, line);
    }
    y += LINE;
  }
  return img;
}

await mkdir(OUT_DIR, { recursive: true });
const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

for (const [name, lines] of Object.entries(receipts)) {
  const img = await drawReceipt(lines, font);
  const file = path.join(OUT_DIR, `${name}.png`);
  await img.writeAsync(file);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
