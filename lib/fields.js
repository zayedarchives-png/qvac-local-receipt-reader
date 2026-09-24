// Pull the useful fields out of grouped rows: merchant, date and total.

const MONEY = /^[-(]?[$€£]?\d{1,3}(?:[,\s]?\d{3})*[.,]\d{2}\)?$/;

// Checked in order: a "grand total" beats "amount due", which beats a plain "total".
const TOTAL_LABELS = [
  /\bgrand\s*total\b/i,
  /\b(?:amount|balance|total)\s*due\b/i,
  /\btotal\b/i,
];
const NOT_TOTAL = /\bsub\s*-?\s*total\b/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pad = (n) => String(n).padStart(2, '0');

function isoDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Returns { raw, iso }. `iso` is null when the order of day and month is ambiguous.
export function parseDate(text) {
  let m = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return { raw: m[0], iso: isoDate(+m[1], +m[2], +m[3]) };

  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    let iso = null;
    if (a > 12 && b <= 12) iso = isoDate(y, b, a);      // day first
    else if (b > 12 && a <= 12) iso = isoDate(y, a, b); // month first
    else if (a === b) iso = isoDate(y, a, b);
    return { raw: m[0], iso };
  }

  m = text.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    if (month) return { raw: m[0], iso: isoDate(+m[3], month, +m[2]) };
  }

  m = text.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    if (month) return { raw: m[0], iso: isoDate(+m[3], month, +m[1]) };
  }

  return null;
}

// "1,234.50" / "(2.00)" / "-2.00" -> number
export function parseAmount(text) {
  const clean = text.replace(/\s/g, '');
  if (!MONEY.test(clean)) return null;
  const negative = /^[-(]/.test(clean);
  let digits = clean.replace(/[^\d.,]/g, '');
  // The last separator is the decimal point; any earlier ones group thousands.
  digits = digits.slice(0, -3).replace(/[.,]/g, '') + '.' + digits.slice(-2);
  const value = Number(digits);
  return negative ? -value : value;
}

// The amount on a row is its right-most money-shaped cell.
function rowAmount(row) {
  for (let i = row.cells.length - 1; i >= 0; i--) {
    const value = parseAmount(row.cells[i].text);
    if (value !== null) return { value, cell: row.cells[i] };
  }
  return null;
}

function findTotal(rows) {
  for (const label of TOTAL_LABELS) {
    // Bottom-most match wins: totals sit below the line items.
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (!label.test(row.text) || NOT_TOTAL.test(row.text)) continue;
      const amount = rowAmount(row);
      if (!amount) continue;
      const labelText = row.cells
        .filter((c) => c !== amount.cell)
        .map((c) => c.text)
        .join(' ');
      return {
        label: labelText,
        value: amount.value,
        confidence: Math.min(amount.cell.confidence, ...row.cells.map((c) => c.confidence)),
      };
    }
  }
  return null;
}

function findMerchant(rows) {
  // The first row with real letters in it, ignoring stray marks at the top.
  const row = rows.find((r) => /[A-Za-z]{3,}/.test(r.text));
  return row ? { name: row.text, confidence: row.confidence } : null;
}

function findDate(rows) {
  for (const row of rows) {
    const date = parseDate(row.text);
    if (date) return date;
  }
  return null;
}

export function extractFields(rows) {
  return {
    merchant: findMerchant(rows),
    date: findDate(rows),
    total: findTotal(rows),
  };
}
