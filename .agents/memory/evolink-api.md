---
name: EvoLink image API
description: Correct EvoLink.AI API shape, model ID naming, and validation endpoint for the BYOK image pipeline
---

- EvoLink.AI (api.evolink.ai) is NOT EachLabs (api.eachlabs.ai) — the integration was originally built against the wrong service and returned 401s for valid keys. Docs index: https://docs.evolink.ai/llms.txt
- Submit: `POST /v1/images/generations` `{model, prompt, size}` — size is an aspect-ratio string ('1:1','16:9','4:3','3:4'); no `negative_prompt` param (fold it into the prompt); prompt max 2000 chars. Returns `{id:"task-unified-...", status:"pending", usage:{credits_reserved}}`.
- Poll: `GET /v1/tasks/{id}` → `{status: pending|processing|completed|failed|cancelled, results:[url], error:{message}}`. Image URLs expire after 24h — download promptly.
- Auth: `Authorization: Bearer KEY`. Free key validation: `GET /v1/credits` (200=valid, 401=`{error:{message}}`).
- Model IDs use the upstream vendor names, not marketing names: nano-banana-2-lite → `gemini-3.1-flash-lite-image`, nano-banana-pro → `gemini-3-pro-image-preview`, seedream-4.5 → `doubao-seedream-4.5`. Flux/Stable Diffusion are NOT offered. Keep the friendly-name→ID allow-list in the worker; unknown values must fall back to the default, never pass through.

**Why:** valid keys 401'd for days because the wrong provider's endpoints were used; model marketing names silently differ from API IDs.
**How to apply:** any new EvoLink model or feature — check docs.evolink.ai llms.txt first for the real model ID and request schema.
