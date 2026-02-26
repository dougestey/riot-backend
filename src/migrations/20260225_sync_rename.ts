import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Aligns DB with current Payload schema: ingestion_* → sync_* and
 * enum_events_ingestion_source → enum_events_sync_source.
 * Run this once so future `payload migrate:create` only sees new tables (e.g. saved_events)
 * and stops asking the same enum/rename questions.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Rename enum only when the old enum exists and the new one does not.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'enum_events_ingestion_source'
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'enum_events_sync_source'
      ) THEN
        ALTER TYPE "public"."enum_events_ingestion_source" RENAME TO "enum_events_sync_source";
      END IF;
    END
    $$;
  `)

  // Events: rename columns and drop ones no longer in schema
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'ingestion_source')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'sync_source') THEN
        ALTER TABLE "events" RENAME COLUMN "ingestion_source" TO "sync_source";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'ingestion_external_id')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'sync_external_id') THEN
        ALTER TABLE "events" RENAME COLUMN "ingestion_external_id" TO "sync_external_id";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'ingestion_last_synced_at')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'sync_last_synced_at') THEN
        ALTER TABLE "events" RENAME COLUMN "ingestion_last_synced_at" TO "sync_last_synced_at";
      END IF;
    END
    $$;
  `)
  await db.execute(sql`ALTER TABLE "events" DROP COLUMN IF EXISTS "ingestion_external_url";`)
  await db.execute(sql`ALTER TABLE "events" DROP COLUMN IF EXISTS "ingestion_ai_enhanced";`)
  await db.execute(sql`ALTER TABLE "events" DROP COLUMN IF EXISTS "ingestion_ai_enhanced_at";`)

  await db.execute(sql`DROP INDEX IF EXISTS "events_ingestion_ingestion_external_id_idx";`)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "events_sync_sync_external_id_idx" ON "events" USING btree ("sync_external_id");`,
  )

  // Venues: rename and drop
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'ingestion_external_id')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'sync_external_id') THEN
        ALTER TABLE "venues" RENAME COLUMN "ingestion_external_id" TO "sync_external_id";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'ingestion_last_synced_at')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'sync_last_synced_at') THEN
        ALTER TABLE "venues" RENAME COLUMN "ingestion_last_synced_at" TO "sync_last_synced_at";
      END IF;
    END
    $$;
  `)
  await db.execute(sql`ALTER TABLE "venues" DROP COLUMN IF EXISTS "ingestion_external_url";`)

  await db.execute(sql`DROP INDEX IF EXISTS "venues_ingestion_ingestion_external_id_idx";`)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "venues_sync_sync_external_id_idx" ON "venues" USING btree ("sync_external_id");`,
  )

  // Categories: rename only
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'ingestion_external_id')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'sync_external_id') THEN
        ALTER TABLE "categories" RENAME COLUMN "ingestion_external_id" TO "sync_external_id";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'ingestion_last_synced_at')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'sync_last_synced_at') THEN
        ALTER TABLE "categories" RENAME COLUMN "ingestion_last_synced_at" TO "sync_last_synced_at";
      END IF;
    END
    $$;
  `)

  await db.execute(sql`DROP INDEX IF EXISTS "categories_ingestion_ingestion_external_id_idx";`)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "categories_sync_sync_external_id_idx" ON "categories" USING btree ("sync_external_id");`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "categories_sync_sync_external_id_idx";`)
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'sync_external_id')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'ingestion_external_id') THEN
        ALTER TABLE "categories" RENAME COLUMN "sync_external_id" TO "ingestion_external_id";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'sync_last_synced_at')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'ingestion_last_synced_at') THEN
        ALTER TABLE "categories" RENAME COLUMN "sync_last_synced_at" TO "ingestion_last_synced_at";
      END IF;
    END
    $$;
  `)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "categories_ingestion_ingestion_external_id_idx" ON "categories" USING btree ("ingestion_external_id");`,
  )

  await db.execute(sql`DROP INDEX IF EXISTS "venues_sync_sync_external_id_idx";`)
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'sync_external_id')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'ingestion_external_id') THEN
        ALTER TABLE "venues" RENAME COLUMN "sync_external_id" TO "ingestion_external_id";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'sync_last_synced_at')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'ingestion_last_synced_at') THEN
        ALTER TABLE "venues" RENAME COLUMN "sync_last_synced_at" TO "ingestion_last_synced_at";
      END IF;
    END
    $$;
  `)
  await db.execute(
    sql`ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "ingestion_external_url" varchar;`,
  )
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "venues_ingestion_ingestion_external_id_idx" ON "venues" USING btree ("ingestion_external_id");`,
  )

  await db.execute(sql`DROP INDEX IF EXISTS "events_sync_sync_external_id_idx";`)
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'sync_source')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'ingestion_source') THEN
        ALTER TABLE "events" RENAME COLUMN "sync_source" TO "ingestion_source";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'sync_external_id')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'ingestion_external_id') THEN
        ALTER TABLE "events" RENAME COLUMN "sync_external_id" TO "ingestion_external_id";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'sync_last_synced_at')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'ingestion_last_synced_at') THEN
        ALTER TABLE "events" RENAME COLUMN "sync_last_synced_at" TO "ingestion_last_synced_at";
      END IF;
    END
    $$;
  `)
  await db.execute(
    sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ingestion_external_url" varchar;`,
  )
  await db.execute(
    sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ingestion_ai_enhanced" boolean DEFAULT false;`,
  )
  await db.execute(
    sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ingestion_ai_enhanced_at" timestamp(3) with time zone;`,
  )
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "events_ingestion_ingestion_external_id_idx" ON "events" USING btree ("ingestion_external_id");`,
  )

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'enum_events_sync_source'
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'enum_events_ingestion_source'
      ) THEN
        ALTER TYPE "public"."enum_events_sync_source" RENAME TO "enum_events_ingestion_source";
      END IF;
    END
    $$;
  `)
}
