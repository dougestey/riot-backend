import * as migration_20260202_203210_initial_setup from './20260202_203210_initial_setup'
import * as migration_20260203_135003 from './20260203_135003'
import * as migration_20260225_sync_rename from './20260225_sync_rename'
import * as migration_20260226_193123_saved_events from './20260226_193123_saved_events'

export const migrations = [
  {
    up: migration_20260202_203210_initial_setup.up,
    down: migration_20260202_203210_initial_setup.down,
    name: '20260202_203210_initial_setup',
  },
  {
    up: migration_20260203_135003.up,
    down: migration_20260203_135003.down,
    name: '20260203_135003',
  },
  {
    up: migration_20260225_sync_rename.up,
    down: migration_20260225_sync_rename.down,
    name: '20260225_sync_rename',
  },
  {
    up: migration_20260226_193123_saved_events.up,
    down: migration_20260226_193123_saved_events.down,
    name: '20260226_193123_saved_events',
  },
]
