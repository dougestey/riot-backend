import * as migration_20260202_203210_initial_setup from './20260202_203210_initial_setup'
import * as migration_20260203_135003 from './20260203_135003'
import * as migration_20260225_sync_rename from './20260225_sync_rename'
import * as migration_20260226_193123_saved_events from './20260226_193123_saved_events'
import * as migration_20260227_220626_organizers from './20260227_220626_organizers'
import * as migration_20260928_163242_social_event_ingestion from './20260928_163242_social_event_ingestion'
import * as migration_20260928_163941_social_event_ingestion_followup from './20260928_163941_social_event_ingestion_followup'
import * as migration_20260928_164016_social_event_ingestion_jobs from './20260928_164016_social_event_ingestion_jobs'
import * as migration_20260928_165040_social_event_ingestion_concurrency from './20260928_165040_social_event_ingestion_concurrency'

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
  {
    up: migration_20260227_220626_organizers.up,
    down: migration_20260227_220626_organizers.down,
    name: '20260227_220626_organizers',
  },
  {
    up: migration_20260928_163242_social_event_ingestion.up,
    down: migration_20260928_163242_social_event_ingestion.down,
    name: '20260928_163242_social_event_ingestion',
  },
  {
    up: migration_20260928_163941_social_event_ingestion_followup.up,
    down: migration_20260928_163941_social_event_ingestion_followup.down,
    name: '20260928_163941_social_event_ingestion_followup',
  },
  {
    up: migration_20260928_164016_social_event_ingestion_jobs.up,
    down: migration_20260928_164016_social_event_ingestion_jobs.down,
    name: '20260928_164016_social_event_ingestion_jobs',
  },
  {
    up: migration_20260928_165040_social_event_ingestion_concurrency.up,
    down: migration_20260928_165040_social_event_ingestion_concurrency.down,
    name: '20260928_165040_social_event_ingestion_concurrency',
  },
]
