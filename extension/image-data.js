const MAX_FILE_BYTES = 20 * 1024 * 1024;
const rasterFormat = /\.(png|jpe?g|webp)$/i;

export function isImageFile(file) {
  return Boolean(file && (file.type.startsWith("image/") || rasterFormat.test(file.name)));
}

export function encodeCrop(image, left, top, width, height) {
  const scale = Math.min(1, 1536 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(image, left, top, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png").split(",")[1];
}

export async function encodeLocalImage(file, signal) {
  if (file.size > MAX_FILE_BYTES) throw new Error("Pilih gambar dengan ukuran maksimal 20 MB.");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  signal.throwIfAborted();
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const webp = String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8)) === "WEBP";
  if (!png && !jpeg && !webp) throw new Error("Pilih gambar PNG, JPEG, atau WebP yang valid.");

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Gambar tidak bisa dibuka. Coba screenshot atau file lain.");
  }
  try {
    signal.throwIfAborted();
    return encodeCrop(bitmap, 0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
