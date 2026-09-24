// Runs the full pipeline on samples/ and compares against known values.
// Usage: node tools/check-samples.js
import path from 'node:path';
import { start, read, stop } from '../lib/engine.js';
import { groupRows } from '../lib/rows.js';
import { extractFields } from '../lib/fields.js';

const expected = {
  'greenleaf-grocery.png': { merchant: 'GREENLEAF GROCERY', date: '2026-09-18', total: 13.32 },
  'northway-fuel.png': { merchant: 'NORTHWAY FUEL', date: '2026-09-21', total: 65.32 },
  'mapleside-pharmacy.png': { merchant: 'MAPLESIDE PHARMACY', date: '2026-09-22', total: 21.04 },
};

let failures = 0;
try {
  await start();
  for (const [file, want] of Object.entries(expected)) {
    const fields = extractFields(groupRows(await read(path.join('samples', file))));
    const got = {
      merchant: fields.merchant?.name ?? null,
      date: fields.date?.iso ?? null,
      total: fields.total?.value ?? null,
    };
    const bad = Object.keys(want).filter((k) => got[k] !== want[k]);
    failures += bad.length ? 1 : 0;
    console.log(`${bad.length ? 'FAIL' : 'ok  '} ${file}  ${JSON.stringify(got)}`);
    for (const k of bad) console.log(`       ${k}: expected ${JSON.stringify(want[k])}`);
  }
} finally {
  await stop();
}
process.exitCode = failures ? 1 : 0;
