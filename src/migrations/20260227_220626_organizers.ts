import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "organizers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"email" varchar,
  	"website" varchar,
  	"sync_external_id" varchar,
  	"sync_last_synced_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "events_rels" ADD COLUMN IF NOT EXISTS "organizers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "organizers_id" integer;
  CREATE UNIQUE INDEX IF NOT EXISTS "organizers_slug_idx" ON "organizers" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "organizers_sync_sync_external_id_idx" ON "organizers" USING btree ("sync_external_id");
  CREATE INDEX IF NOT EXISTS "organizers_updated_at_idx" ON "organizers" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "organizers_created_at_idx" ON "organizers" USING btree ("created_at");
  DO $$ BEGIN
    ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_organizers_fk" FOREIGN KEY ("organizers_id") REFERENCES "public"."organizers"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organizers_fk" FOREIGN KEY ("organizers_id") REFERENCES "public"."organizers"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  CREATE INDEX IF NOT EXISTS "events_rels_organizers_id_idx" ON "events_rels" USING btree ("organizers_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_organizers_id_idx" ON "payload_locked_documents_rels" USING btree ("organizers_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "organizers" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "organizers" CASCADE;
  ALTER TABLE "events_rels" DROP CONSTRAINT "events_rels_organizers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organizers_fk";
  
  DROP INDEX "events_rels_organizers_id_idx";
  DROP INDEX "payload_locked_documents_rels_organizers_id_idx";
  ALTER TABLE "events_rels" DROP COLUMN "organizers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organizers_id";`)
}
