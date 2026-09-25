import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

const accountId = process.env.R2_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET_NAME
const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')

export const r2Configured =
  Boolean(accountId && accessKeyId && secretAccessKey && bucket && publicUrl)

if (!r2Configured) {
  console.warn(
    '[R2] Missing env vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL). Image upload will fail until they are set.'
  )
}

export const r2 = new S3Client({
  region: 'auto',
  endpoint: accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
})

/**
 * Upload a buffer to R2 and return the public URL.
 * Key format: products/<uuid>.webp
 */
export async function uploadImageToR2(
  body: Buffer,
  contentType: string = 'image/webp'
): Promise<string> {
  if (!r2Configured) {
    throw Object.assign(new Error('Cloudflare R2 কনফিগার করা নেই'), { status: 503 })
  }

  const key = `products/${randomUUID()}.webp`

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )

  return `${publicUrl}/${key}`
}
