---
name: Object storage bucket setup
description: Why image postprocess failed with "fetch failed" and how the storage client must be constructed
---

**Rule:** Construct `@replit/object-storage` `Client` with an explicit `bucketId` from `process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID`. Do not rely on `new Client()` auto-discovery.

**Why:** No Object Storage bucket existed originally — every `StorageService.put` in the image postprocess worker threw, surfacing to users as a raw "fetch failed" error and blank map thumbnails in production. Even after the bucket was provisioned, `new Client()` without arguments still threw "A bucket name is needed to use Cloud Storage" in this environment; only passing `bucketId` explicitly worked.

**How to apply:** Any new code touching object storage should go through `StorageService` (server/src/lib/storage.ts), which already handles this. After provisioning storage or changing env vars, the app must be republished for production to pick them up.
