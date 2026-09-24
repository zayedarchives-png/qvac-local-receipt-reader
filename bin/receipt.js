#!/usr/bin/env node
// receipt: read receipts on-device with the QVAC OCR model.
import { parseArgs } from 'node:util';
import { stat, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { start, read, stop } from '../lib/engine.js';
import { groupRows } from '../lib/rows.js';
import { extractFields } from '../lib/fields.js';

const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg']);

const HELP = `Usage: receipt scan <file|dir> [options]

Reads receipt images fully on this machine and prints each visual row
plus the merchant, date and total it found.

Options:
  --json <dir>            also write one <image>.json file per receipt into <dir>
  --lang <code>           OCR language code (default: en)
  --min-confidence <n>    flag rows and fields below this confidence with '?', 0..1 (default: 0)
  -h, --help              show this help

Supported images: ${[...IMAGE_TYPES].join(', ')}`;

class UsageError extends Error {}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'string' },
      lang: { type: 'string', default: 'en' },
      'min-confidence': { type: 'string', default: '0' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) return { help: true };

  const [command, target, ...extra] = positionals;
  if (!command) throw new UsageError('missing command');
  if (command !== 'scan') throw new UsageError(`unknown command "${command}"`);
  if (!target) throw new UsageError('scan needs a file or directory');
  if (extra.length) throw new UsageError(`unexpected argument "${extra[0]}"`);

  const minConfidence = Number(values['min-confidence']);
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new UsageError('--min-confidence must be a number between 0 and 1');
  }
  if (!/^[a-z]{2,3}$/i.test(values.lang)) {
    throw new UsageError(`--lang "${values.lang}" does not look like a language code`);
  }

  return { target, jsonDir: values.json, lang: values.lang.toLowerCase(), minConfidence };
}

// Expand the target into a sorted list of image paths, failing early on bad input.
async function collectImages(target) {
  let info;
  try {
    info = await stat(target);
  } catch {
    throw new UsageError(`not found: ${target}`);
  }

  if (info.isFile()) {
    if (!IMAGE_TYPES.has(path.extname(target).toLowerCase())) {
      throw new UsageError(`unsupported file type: ${target} (use ${[...IMAGE_TYPES].join(', ')})`);
    }
    return [target];
  }

  const names = (await readdir(target))
    .filter((name) => IMAGE_TYPES.has(path.extname(name).toLowerCase()))
    .sort();
  if (!names.length) throw new UsageError(`no supported images in ${target}`);
  return names.map((name) => path.join(target, name));
}

function formatAmount(value) {
  return value < 0 ? `-${Math.abs(value).toFixed(2)}` : value.toFixed(2);
}

function printReport(file, rows, fields, ms, minConfidence) {
  const width = Math.max(20, ...rows.map((r) => r.cells.slice(0, -1).map((c) => c.text).join(' ').length));
  console.log(`\n${file}  (${rows.length} rows, ${(ms / 1000).toFixed(1)}s)`);
  console.log('-'.repeat(width + 22));
  for (const row of rows) {
    // Keep the right-most cell in its own column so amounts line up.
    const left = row.cells.length > 1 ? row.cells.slice(0, -1).map((c) => c.text).join(' ') : row.text;
    const right = row.cells.length > 1 ? row.cells[row.cells.length - 1].text : '';
    const mark = row.confidence < minConfidence ? ' ?' : '';
    console.log(`  ${left.padEnd(width)}  ${right.padStart(10)}  ${row.confidence.toFixed(2)}${mark}`);
  }
  console.log('-'.repeat(width + 22));

  const { merchant, date, total } = fields;
  const doubt = (field) => (field.uncertain ? `  ? low confidence ${field.confidence.toFixed(2)}` : '');
  console.log(`  merchant  ${merchant ? merchant.name + doubt(merchant) : '(not found)'}`);
  console.log(`  date      ${date ? (date.iso ?? `${date.raw} (ambiguous)`) + doubt(date) : '(not found)'}`);
  console.log(`  total     ${total ? `${formatAmount(total.value)}  [${total.label}]${doubt(total)}` : '(not found)'}`);
}

async function scan({ target, jsonDir, lang, minConfidence }) {
  const images = await collectImages(target);
  if (jsonDir) await mkdir(jsonDir, { recursive: true });

  await start({ lang, onProgress: (msg) => process.stderr.write(`\rloading ${msg}      `) });
  process.stderr.write('\rmodel ready' + ' '.repeat(40) + '\n');

  let failed = 0;
  for (const file of images) {
    const t0 = Date.now();
    try {
      const rows = groupRows(await read(file));
      const fields = extractFields(rows, { minConfidence });
      printReport(file, rows, fields, Date.now() - t0, minConfidence);

      if (jsonDir) {
        const out = path.join(jsonDir, `${path.parse(file).name}.json`);
        const report = { file, lang, minConfidence, fields, rows };
        await writeFile(out, JSON.stringify(report, null, 2) + '\n');
        console.log(`  saved     ${out}`);
      }
    } catch (err) {
      failed++;
      console.error(`\n${file}: ${err.message}`);
    }
  }
  return failed;
}

async function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) {
    console.log(HELP);
    return 0;
  }

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await stop().catch(() => {});
  };
  process.once('SIGINT', () => shutdown().then(() => process.exit(130)));

  try {
    const failed = await scan(options);
    return failed ? 1 : 0;
  } catch (err) {
    console.error(`error: ${err.message}`);
    return err instanceof UsageError ? 2 : 1;
  } finally {
    await shutdown();
  }
}

process.exitCode = await main();
