// Group OCR blocks into visual rows.
//
// The recognizer returns a label and its amount as separate blocks
// ("TOTAL" and "13.32"), so a receipt line only exists once we put blocks
// that share a vertical band back together.

// bbox is [x1, y1, x2, y2]; rotated detections can carry fractional coordinates.
function geometry(block) {
  const [x1, y1, x2, y2] = block.bbox;
  return { ...block, left: x1, right: x2, top: y1, bottom: y2, cy: (y1 + y2) / 2, h: y2 - y1 };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// `tolerance` is a fraction of the median block height: two blocks land in
// the same row when their vertical centres are closer than that.
export function groupRows(blocks, { tolerance = 0.5 } = {}) {
  if (!blocks.length) return [];

  const items = blocks.map(geometry).sort((a, b) => a.cy - b.cy);
  const maxGap = median(items.map((b) => b.h)) * tolerance;
  const rows = [];

  for (const item of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(item.cy - row.cy) <= maxGap) {
      row.cells.push(item);
      row.cy = row.cells.reduce((sum, c) => sum + c.cy, 0) / row.cells.length;
    } else {
      rows.push({ cy: item.cy, cells: [item] });
    }
  }

  return rows.map((row) => {
    const cells = row.cells.sort((a, b) => a.left - b.left);
    return {
      top: Math.min(...cells.map((c) => c.top)),
      bottom: Math.max(...cells.map((c) => c.bottom)),
      cells: cells.map(({ text, bbox, confidence }) => ({ text, bbox, confidence })),
      text: cells.map((c) => c.text).join(' '),
      confidence: Math.min(...cells.map((c) => c.confidence)),
    };
  });
}
