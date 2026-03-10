# PR Notes: WordPress Live Data Ingest

Extends the one-shot import script with a live webhook handler and shared library, enabling ongoing sync from WordPress as events are created or updated.

## Changes

### `src/lib/wordpress.ts` (new)

- Extracted all WP type definitions (`WPEvent`, `WPVenue`, `WPCategory`) and upsert logic into a shared library.
- Centralizes `upsertEvent`, `upsertVenue`, `upsertCategory`, `getOrCreateMediaFromUrl`, `cleanText`, and `extractImageUrl` so both the import script and webhook handler use identical logic.

### `src/app/api/webhooks/wordpress/route.ts` (new)

- POST endpoint at `/api/webhooks/wordpress` that receives individual event payloads from WordPress.
- Authenticates via `x-webhook-secret` header (timing-safe compare against `WORDPRESS_WEBHOOK_SECRET` env var).
- Upserts venue, categories, media, and event in order; tolerates partial failures and returns a structured result payload.

### `src/scripts/importWordpressData.ts`

- Refactored to consume `src/lib/wordpress.ts` — removed ~330 lines of duplicated logic.

### Tests

- `tests/unit/lib/wordpress-upserts.unit.spec.ts` — unit tests for upsert helpers (create and update paths).
- `tests/unit/lib/wordpress-utils.unit.spec.ts` — unit tests for `cleanText`, `extractImageUrl`, and related utilities.
- `tests/unit/webhooks/wordpress-route.unit.spec.ts` — unit tests for the webhook route (auth, validation, success/failure cases).

### Config

- Added `WORDPRESS_WEBHOOK_SECRET` to `.env.example`.
