# qvac-local-receipt-reader

A command-line receipt reader that runs entirely on your machine. It uses the
OCR model from the [QVAC SDK](https://www.npmjs.com/package/@qvac/sdk) to read
receipt images, rebuilds the printed lines from the text boxes, and pulls out
the merchant, date and total. No image or text ever leaves your computer.

## QVAC functions used

Built on **`@qvac/sdk@0.20.0`** (declared as `^0.20.0` in `package.json`).

| Function | Where | What for |
| --- | --- | --- |
| `loadModel` | `lib/engine.js` | loads the `OCR_LATIN` model, with download progress |
| `ocr` | `lib/engine.js` | reads an image into text blocks with bounding boxes and confidence |
| `unloadModel` | `lib/engine.js` | frees the model when a scan is finished |
| `close` | `lib/engine.js` | shuts the SDK down, also after errors or Ctrl+C |

## Why bounding boxes matter

The OCR model returns a receipt label and its amount as separate blocks, for
example `TOTAL` and `13.32`. Searching for "the number on the line that says
total" therefore finds nothing. This tool groups blocks whose vertical centres
line up into one visual row (`lib/rows.js`), sorts each row left to right, and
only then looks for fields (`lib/fields.js`):

- **merchant**: the first row that contains real words
- **date**: `2026-09-18`, `21/09/2026`, `Sep 22, 2026`, `12 Mar 2026` and
  similar; dates like `03/04/2026` where day and month can't be told apart are
  reported as ambiguous instead of guessed
- **total**: the row labelled *grand total*, then *amount/balance due*, then
  *total* (never *subtotal*), taking the right-most amount on that row

## Requirements

- Node.js **22.17 or newer**
- About 100 MB of free disk space for the OCR model
- An internet connection for the first run only. The SDK downloads the model
  once (about 94 MB); after that everything works offline.

Tested on Windows 11 with Node 22.19.

## Install

```bash
git clone https://github.com/zayedarchives-png/qvac-local-receipt-reader.git
cd qvac-local-receipt-reader
npm install
```

## Usage

```bash
# scan every image in a folder
node bin/receipt.js scan samples/

# scan one image and also save the result as JSON
node bin/receipt.js scan samples/northway-fuel.png --json output/

# ignore OCR blocks the model is unsure about
node bin/receipt.js scan photo.jpg --min-confidence 0.5
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--json <dir>` | off | write one `<image>.json` per receipt into `<dir>` |
| `--lang <code>` | `en` | OCR language code |
| `--min-confidence <n>` | `0` | drop OCR blocks below this confidence (0 to 1) |
| `-h`, `--help` | | show help |

Supported images: `.png`, `.jpg`, `.jpeg`. Exit code is `0` on success, `1` if
any image failed and `2` for bad arguments (missing file, unsupported type, and
so on).

After `npm install` you can also run `npm run scan` to scan the bundled samples.

## Example output

A real run of `node bin/receipt.js scan samples/` (first receipt shown). Each
row shows the text, the right-most value and the lowest confidence in the row:

```
samples\greenleaf-grocery.png  (11 rows, 17.5s)
------------------------------------------
  GREENLEAF GROCERY                 0.80
  14 Orchard Road                   0.55
  Date: 2026-09-18           10.42  0.75
  Bananas 1kg                 1.89  0.85
  Oat Milk                    3.25  0.55
  Brown Rice 2kg              4.60  0.95
  Cheddar 6007                2.95  0.85
  Subtotal                   12.69  0.99
  Tax                         0.63  1.00
  TOTAL                      13.32  0.99
  Thank you!                        0.99
------------------------------------------
  merchant  GREENLEAF GROCERY
  date      2026-09-18
  total     13.32  [TOTAL]
```

The other two samples give `MAPLESIDE PHARMACY / 2026-09-22 / 21.04 [GRAND TOTAL]`
and `NORTHWAY FUEL / 2026-09-21 / 65.32 [AMOUNT DUE]`.

The output also shows real OCR mistakes, left as they are: `200g` is read as
`6007` and the time `10:42` as `10.42`. The fields still come out right because
they only depend on the rows that matter.

## Project layout

```
bin/receipt.js           CLI entry point (scan command)
lib/engine.js            model lifecycle: start / read / stop
lib/rows.js              groups OCR blocks into visual rows
lib/fields.js            merchant, date and total extraction
tools/make-samples.js    draws the sample receipts in samples/
tools/check-samples.js   runs the samples and compares against known values
tools/try-engine.js      prints raw OCR blocks for one image
samples/                 generated test receipts (grocery, fuel, pharmacy)
```

To regenerate the samples and check the pipeline:

```bash
npm run samples
node tools/check-samples.js
```

## License

MIT, see [LICENSE](LICENSE).
