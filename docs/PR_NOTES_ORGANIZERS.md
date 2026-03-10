# PR Notes: Organizers Collection + Import/Webhook Support

Adds a new `organizers` Payload collection to model WordPress Events Calendar organizers, with full import script and webhook handler support.

## Changes

### `src/collections/Organizers.ts` (new)

- New collection with `name`, `slug`, `email`, `website`, and `sync` group (externalId + lastSyncedAt).
- Follows the Categories pattern — no address/coordinates complexity.
- Access: read anyone, create/update/delete editor or admin.

### `src/collections/Events.ts`

- Added `organizers` hasMany relationship field in the Details tab (after `categories`).

### `src/lib/wordpress.ts`

- Added `WPOrganizer` type: `{ id, organizer, slug, email, url, modified }`.
- Added `organizers?: WPOrganizer[]` to the `WPEvent` type.
- Added `upsertOrganizer()` function following the same create-or-update + slug-fallback pattern as `upsertCategory`.
- Extended `upsertEvent()` to accept and persist `organizerIds`.

### `src/scripts/importWordpressData.ts`

- Collects organizers from both dedicated `organizers.json` exports and embedded event organizer arrays (same merge-by-ID pattern as venues/categories).
- Upserts organizers between the categories and events phases.
- Passes resolved `organizerIds` to `upsertEvent` for each event.
- Summary log line includes organizer counts.

### `src/app/api/webhooks/wordpress/route.ts`

- Added organizer upsert block between categories and media (same tolerance pattern — individual failures don't block the event save).
- Passes `organizerIds` to `upsertEvent`.
- Result payload includes `organizers` array.

### `src/payload.config.ts`

- Imported and registered `Organizers` in the collections array.

### Types + Tests

- Regenerated `src/payload-types.ts` with Organizer types.
- Updated `tests/unit/lib/wordpress-upserts.unit.spec.ts` to include `organizerIds` in event upsert opts.

## Validation

- `npx tsc --noEmit` passes with zero errors.
- All 64 tests pass across 4 test files (`npx vitest run`).
