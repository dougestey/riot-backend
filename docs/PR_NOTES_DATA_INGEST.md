# PR Notes: WordPress Data Import Script

- Adds `src/scripts/importWordpressData.ts` — a one-shot import script that reads exported WordPress/The Events Calendar JSON files from an `imports/` directory and seeds the Payload CMS database with events, venues, and categories.
- Handles upsert logic (create or update by slug/ID) for Events, Venues, and Categories collections.
- Type-safe WP data shapes (`WPEvent`, `WPVenue`, `WPCategory`) mapped to Payload collection fields.
- Added `imports/` directory with `.gitignore` to exclude actual data files from source control.
- Added `tsx` as a dev dependency to support running the script directly via `package.json` scripts.

## Usage

Drop exported JSON files into `imports/`, then run `npm run import:wordpress`.
