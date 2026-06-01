// image.js — turn an uploaded image File into a small data URL suitable for a
// collection cover. We downscale to keep chrome.storage (and the sync file)
// lean; covers are only ever shown at ~64px, so a 512px max is plenty.

const MAX_EDGE = 512;

/**
 * Read an image File and return a downscaled JPEG/PNG data URL.
 * Resolves to a data: URL string; rejects if the file isn't a decodable image.
 */
export async function fileToCover(file, maxEdge = MAX_EDGE) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Not an image file');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // PNG preserves transparency; everything else compresses better as JPEG.
  const isPng = file.type === 'image/png';
  const blob = await canvas.convertToBlob(
    isPng ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.82 }
  );

  return await blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
