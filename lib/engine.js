// Thin wrapper around the QVAC OCR model lifecycle.
// Everything runs locally: the SDK fetches model weights once, then works offline.
import { loadModel, ocr, unloadModel, close, OCR_LATIN } from '@qvac/sdk';

let activeModel = null;

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

// Load the Latin-script OCR model. `onProgress` gets a short status string.
export async function start({ lang = 'en', onProgress } = {}) {
  if (activeModel) return activeModel;

  activeModel = await loadModel({
    modelSrc: OCR_LATIN,
    modelConfig: {
      langList: [lang],
      magRatio: 1.5,
      defaultRotationAngles: [90, 180, 270],
      contrastRetry: false,
      lowConfidenceThreshold: 0.5,
      recognizerBatchSize: 1,
    },
    onProgress: (p) => {
      if (!onProgress || p == null) return;
      const pct = typeof p.percentage === 'number' ? p.percentage.toFixed(0) : '?';
      const size = p.total ? ` (${mb(p.downloaded ?? 0)}/${mb(p.total)} MB)` : '';
      onProgress(`model ${pct}%${size}`);
    },
  });
  return activeModel;
}

// Run OCR on one image path and return the raw blocks: [{ text, bbox, confidence }].
export async function read(imagePath) {
  if (!activeModel) throw new Error('engine not started; call start() first');
  const { blocks } = ocr({
    modelId: activeModel,
    image: imagePath,
    options: { paragraph: false },
  });
  return await blocks;
}

// Release the model and shut the SDK down. Safe to call more than once.
export async function stop() {
  const id = activeModel;
  activeModel = null;
  try {
    if (id) await unloadModel({ modelId: id, clearStorage: false });
  } finally {
    await close();
  }
}
