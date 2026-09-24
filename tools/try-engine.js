// Quick manual check: node tools/try-engine.js <image>
// Prints every OCR block with its confidence and bounding box.
import { start, read, stop } from '../lib/engine.js';

const image = process.argv[2];
if (!image) {
  console.error('usage: node tools/try-engine.js <image>');
  process.exit(1);
}

try {
  await start({ onProgress: (msg) => process.stderr.write(`\r${msg}   `) });
  process.stderr.write('\n');
  const t0 = Date.now();
  const blocks = await read(image);
  console.log(`${blocks.length} blocks in ${Date.now() - t0} ms`);
  for (const b of blocks) {
    console.log(`${b.confidence.toFixed(2)}  ${JSON.stringify(b.bbox)}  ${b.text}`);
  }
} catch (err) {
  console.error('failed:', err.message);
  process.exitCode = 1;
} finally {
  await stop();
}
