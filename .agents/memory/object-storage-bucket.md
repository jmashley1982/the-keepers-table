---
name: Object storage bucket setup
description: Storage backend is Cloudflare R2 (S3 API); all four R2_* env vars must be set before first use
---

**Rule:** All object storage goes through `StorageService` (server/src/lib/storage.ts), which is an S3 client pointed at Cloudflare R2 (`https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`). It requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` — all four, at boot.

**Why:** `storage.ts` latches an `_initFailed` flag on first failed init — if any R2 env var is missing when storage is first touched, every subsequent call throws for the life of the process, even if the env is later fixed. Historically (on the old Replit Object Storage backend) this surfaced to users as raw "fetch failed" errors and blank map thumbnails.

**How to apply:** Any new code touching object storage should go through `StorageService`. After changing R2 credentials or the bucket, redeploy/restart so the container picks them up. The production bucket is `keepers-table-assets`. Key layout: `campaigns/{campaignId}/assets/{assetId}/{original.ext|thumb.webp|preview.webp}` and `campaigns/{campaignId}/uploads/{uploadId}/{filename}`.
