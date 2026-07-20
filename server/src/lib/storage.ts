import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

// ─── Cloudflare R2 storage backend ─────────────────────────────────────────
// R2 is S3-compatible, so we talk to it with the standard AWS SDK v3 client
// pointed at the account's R2 endpoint. Required env vars:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
// (Replaces the previous @replit/object-storage backend, which only worked
// inside a Repl.)

let _client: S3Client | null = null
let _initFailed = false

function newClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Cloudflare R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
        'R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.',
    )
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

function getClient(): S3Client {
  if (_initFailed) {
    throw new Error(
      'Cloudflare R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
        'R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.',
    )
  }
  if (!_client) {
    try {
      _client = newClient()
    } catch (err) {
      _initFailed = true
      throw err
    }
  }
  return _client
}

function bucketName(): string {
  const name = process.env.R2_BUCKET_NAME
  if (!name) throw new Error('R2_BUCKET_NAME environment variable is not set.')
  return name
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export const StorageService = {
  isAvailable(): boolean {
    if (_initFailed) return false
    if (_client) return true
    try {
      _client = newClient()
      return true
    } catch {
      _initFailed = true
      return false
    }
  },

  async put(key: string, buffer: Buffer, contentType?: string): Promise<void> {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucketName(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    )
  },

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await getClient().send(
        new GetObjectCommand({ Bucket: bucketName(), Key: key }),
      )
      if (!result.Body) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await streamToBuffer(result.Body as any)
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
      if (name === 'NoSuchKey' || status === 404) {
        return null
      }
      throw new Error(`Storage get failed for key "${key}": ${err instanceof Error ? err.message : String(err)}`)
    }
  },

  async delete(key: string): Promise<void> {
    try {
      await getClient().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }))
    } catch (err) {
      console.warn(`Storage delete failed for key "${key}": ${err instanceof Error ? err.message : String(err)}`)
    }
  },

  assetKey(campaignId: string, assetId: string, rendition: 'original' | 'thumb' | 'preview', ext = 'png'): string {
    const filename = rendition === 'original' ? `original.${ext}` : `${rendition}.webp`
    return `campaigns/${campaignId}/assets/${assetId}/${filename}`
  },

  uploadKey(campaignId: string, uploadId: string, filename: string): string {
    return `campaigns/${campaignId}/uploads/${uploadId}/${filename}`
  },
}
