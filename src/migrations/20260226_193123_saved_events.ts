import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "saved_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"event_id" integer NOT NULL,
  	"saved_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "saved_events_id" integer;

  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_events_user_id_users_id_fk') THEN
      ALTER TABLE "saved_events"
      ADD CONSTRAINT "saved_events_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_events_event_id_events_id_fk') THEN
      ALTER TABLE "saved_events"
      ADD CONSTRAINT "saved_events_event_id_events_id_fk"
      FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
      ON DELETE set null ON UPDATE no action;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_saved_events_fk') THEN
      ALTER TABLE "payload_locked_documents_rels"
      ADD CONSTRAINT "payload_locked_documents_rels_saved_events_fk"
      FOREIGN KEY ("saved_events_id") REFERENCES "public"."saved_events"("id")
      ON DELETE cascade ON UPDATE no action;
    END IF;
  END
  $$;

  CREATE INDEX IF NOT EXISTS "saved_events_user_idx" ON "saved_events" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "saved_events_event_idx" ON "saved_events" USING btree ("event_id");
  CREATE INDEX IF NOT EXISTS "saved_events_updated_at_idx" ON "saved_events" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "saved_events_created_at_idx" ON "saved_events" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_saved_events_id_idx" ON "payload_locked_documents_rels" USING btree ("saved_events_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_saved_events_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_saved_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "saved_events_id";
  DROP TABLE IF EXISTS "saved_events" CASCADE;`)
}
