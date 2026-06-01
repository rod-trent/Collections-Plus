// image.js — downscale an image (uploaded file, fetched URL, or a screenshot
// data URL) into a small data URL. Used for collection covers, locally-captured
// page thumbnails, and offline image caching. We downscale to keep
// chrome.storage (and the sync file) lean; these are only shown small.

const MAX_EDGE = 512;

/** Downscale an image Blob to a JPEG/PNG data URL no larger than maxEdge. */
export async function blobToCover(blob, maxEdge = MAX_EDGE) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // PNG preserves transparency; everything else compresses better as JPEG.
  const isPng = blob.type === 'image/png';
  const out = await canvas.convertToBlob(
    isPng ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.82 }
  );
  return blobToDataUrl(out);
}

/**
 * Read an image File and return a downscaled data URL.
 * Rejects if the file isn't a decodable image.
 */
export async function fileToCover(file, maxEdge = MAX_EDGE) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Not an image file');
  }
  return blobToCover(file, maxEdge);
}

/**
 * Fetch an image URL (or decode a data: URL) and return a downscaled data URL.
 * Requires host access to the source; rejects on network/decoding failure.
 */
export async function srcToCover(src, maxEdge = MAX_EDGE) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Not an image');
  return blobToCover(blob, maxEdge);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
