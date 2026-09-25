import sharp from 'sharp'

const MAX_BYTES = 200 * 1024 // 200 KB
const MAX_DIMENSION = 1200

/**
 * Resize + compress an image buffer so the result is WebP ≤ 200 KB.
 * Tries quality from 80 down to 40; if still too large, scales dimensions further.
 */
export async function compressToUnder200KB(input: Buffer): Promise<Buffer> {
  let image = sharp(input, { failOn: 'none' }).rotate() // auto-orient from EXIF

  const meta = await image.metadata()
  const width = meta.width || MAX_DIMENSION
  const height = meta.height || MAX_DIMENSION

  // First pass: fit inside 1200×1200
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    image = image.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  // Try decreasing quality until under limit
  for (let quality = 80; quality >= 40; quality -= 10) {
    const buf = await image
      .clone()
      .webp({ quality, effort: 4 })
      .toBuffer()
    if (buf.length <= MAX_BYTES) return buf
  }

  // Still too big — scale down more aggressively and try again
  for (const scale of [0.75, 0.5, 0.35]) {
    const targetW = Math.round((width > MAX_DIMENSION ? MAX_DIMENSION : width) * scale)
    const targetH = Math.round((height > MAX_DIMENSION ? MAX_DIMENSION : height) * scale)
    for (let quality = 70; quality >= 30; quality -= 10) {
      const buf = await sharp(input, { failOn: 'none' })
        .rotate()
        .resize({ width: targetW, height: targetH, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer()
      if (buf.length <= MAX_BYTES) return buf
    }
  }

  // Last resort: very low quality small image
  return sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 25, effort: 4 })
    .toBuffer()
}
