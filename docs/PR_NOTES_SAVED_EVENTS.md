# PR Notes: Saved Events

- Added a new `saved-events` junction collection to support "My Events" / saved event functionality (Instagram-like likes model).
- Enforced one save per user per event, with server-side ownership (`user` auto-set from `req.user`) and duplicate-save protection.
- Added strict access controls: authenticated create, owner/admin read+delete, and disabled updates.
- Registered the new collection in Payload config and regenerated types.
- Hid `saved-events` from the admin UI (`admin.hidden: true`) so it remains API-only for frontend consumption.
- Added/updated migrations to handle schema alignment and saved-events creation in environments with prior dev-mode drift.

## Validation

- `npx tsc --noEmit` passes.
- `npx payload migrate:status` shows migration state and pending/applied entries correctly.
