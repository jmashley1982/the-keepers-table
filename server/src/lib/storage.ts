import { Client } from '@replit/object-storage'

let _client: Client | null = null
let _initFailed = false

function newClient(): Client {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
  return bucketId ? new Client({ bucketId }) : new Client()
}

function getClient(): Client {
  if (_initFailed) throw new Error('Replit Object Storage is not configured (no bucket available). Enable it in the Replit storage panel.')
  if (!_client) {
    try {
      _client = newClient()
    } catch (err) {
      _initFailed = true
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Replit Object Storage initialization failed: ${msg}. Enable Object Storage in your Repl settings.`)
    }
  }
  return _client
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

  async put(key: string, buffer: Buffer, _contentType?: string): Promise<void> {
    const result = await getClient().uploadFromBytes(key, buffer)
    if (!result.ok) {
      throw new Error(`Storage put failed for key "${key}": ${result.error?.message ?? 'unknown error'}`)
    }
  },

  async get(key: string): Promise<Buffer | null> {
    const result = await getClient().downloadAsBytes(key)
    if (!result.ok) {
      if (result.error?.message?.includes('not found') || result.error?.message?.includes('404')) {
        return null
      }
      throw new Error(`Storage get failed for key "${key}": ${result.error?.message ?? 'unknown error'}`)
    }
    const raw = result.value as unknown
    if (Buffer.isBuffer(raw)) return raw
    if (raw instanceof Uint8Array) return Buffer.from(raw)
    if (Array.isArray(raw) && raw.length > 0) return Buffer.from(raw[0] as Uint8Array)
    return Buffer.from(raw as ArrayBuffer)
  },

  async delete(key: string): Promise<void> {
    const result = await getClient().delete(key)
    if (!result.ok) {
      console.warn(`Storage delete failed for key "${key}": ${result.error?.message ?? 'unknown error'}`)
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
