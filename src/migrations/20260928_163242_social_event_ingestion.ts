import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_venues_instagram_status" AS ENUM('unverified', 'active', 'unavailable', 'error');
  CREATE TYPE "public"."enum_oauth_connections_provider" AS ENUM('google', 'meta');
  CREATE TYPE "public"."enum_oauth_connections_status" AS ENUM('pending', 'active', 'error', 'revoked');
  CREATE TYPE "public"."enum_ingestion_records_source" AS ENUM('facebook', 'google-calendar', 'ical', 'facebook-export', 'csv', 'instagram', 'wordpress');
  CREATE TYPE "public"."enum_ingestion_records_status" AS ENUM('pending', 'processing', 'needs-review', 'event-created', 'skipped', 'failed');
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'ambassador' BEFORE 'attendee';
  ALTER TYPE "public"."enum_events_sync_source" ADD VALUE 'facebook';
  ALTER TYPE "public"."enum_events_sync_source" ADD VALUE 'google-calendar';
  ALTER TYPE "public"."enum_events_sync_source" ADD VALUE 'ical';
  ALTER TYPE "public"."enum_events_sync_source" ADD VALUE 'facebook-export';
  ALTER TYPE "public"."enum_events_sync_source" ADD VALUE 'csv';
  ALTER TYPE "public"."enum_events_sync_source" ADD VALUE 'instagram';
  CREATE TABLE "users_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"cities_id" integer
  );
  
  CREATE TABLE "cities" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"region" varchar,
  	"country" varchar DEFAULT 'Canada' NOT NULL,
  	"timezone" varchar DEFAULT 'America/Halifax' NOT NULL,
  	"active" boolean DEFAULT true NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "oauth_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer NOT NULL,
  	"label" varchar NOT NULL,
  	"provider" "enum_oauth_connections_provider" NOT NULL,
  	"status" "enum_oauth_connections_status" DEFAULT 'pending' NOT NULL,
  	"external_account_id" varchar,
  	"calendar_id" varchar,
  	"calendar_name" varchar,
  	"encrypted_credentials" varchar,
  	"encrypted_o_auth_state" varchar,
  	"state_expires_at" timestamp(3) with time zone,
  	"sync_token" varchar,
  	"last_synced_at" timestamp(3) with time zone,
  	"last_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "oauth_connections_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "ingestion_records_errors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field" varchar,
  	"message" varchar NOT NULL
  );
  
  CREATE TABLE "ingestion_records" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source" "enum_ingestion_records_source" NOT NULL,
  	"source_key" varchar NOT NULL,
  	"external_id" varchar NOT NULL,
  	"canonical_url" varchar,
  	"status" "enum_ingestion_records_status" DEFAULT 'pending' NOT NULL,
  	"city_id" integer NOT NULL,
  	"venue_id" integer,
  	"submitted_by_id" integer,
  	"connection_id" integer,
  	"linked_event_id" integer,
  	"normalized_payload" jsonb NOT NULL,
  	"source_payload" jsonb,
  	"payload_hash" varchar NOT NULL,
  	"confidence" numeric,
  	"model" varchar,
  	"extraction_evidence" jsonb,
  	"source_updated_at" timestamp(3) with time zone,
  	"processed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ingestion_records_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"events_id" integer
  );
  
  ALTER TABLE "events" ADD COLUMN "city_id" integer;
  ALTER TABLE "events" ADD COLUMN "sync_source_key" varchar;
  ALTER TABLE "events" ADD COLUMN "sync_external_url" varchar;
  ALTER TABLE "events" ADD COLUMN "sync_ingestion_record_id" integer;
  ALTER TABLE "venues" ADD COLUMN "city_id" integer;
  ALTER TABLE "venues" ADD COLUMN "instagram_username" varchar;
  ALTER TABLE "venues" ADD COLUMN "instagram_account_id" varchar;
  ALTER TABLE "venues" ADD COLUMN "instagram_monitoring_enabled" boolean DEFAULT false;
  ALTER TABLE "venues" ADD COLUMN "instagram_last_checked_at" timestamp(3) with time zone;
  ALTER TABLE "venues" ADD COLUMN "instagram_status" "enum_venues_instagram_status" DEFAULT 'unverified';
  ALTER TABLE "venues" ADD COLUMN "instagram_last_error" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cities_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "oauth_connections_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ingestion_records_id" integer;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_cities_fk" FOREIGN KEY ("cities_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "oauth_connections_texts" ADD CONSTRAINT "oauth_connections_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."oauth_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ingestion_records_errors" ADD CONSTRAINT "ingestion_records_errors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ingestion_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ingestion_records" ADD CONSTRAINT "ingestion_records_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ingestion_records" ADD CONSTRAINT "ingestion_records_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ingestion_records" ADD CONSTRAINT "ingestion_records_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ingestion_records" ADD CONSTRAINT "ingestion_records_connection_id_oauth_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."oauth_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ingestion_records" ADD CONSTRAINT "ingestion_records_linked_event_id_events_id_fk" FOREIGN KEY ("linked_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ingestion_records_rels" ADD CONSTRAINT "ingestion_records_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ingestion_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ingestion_records_rels" ADD CONSTRAINT "ingestion_records_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_rels_order_idx" ON "users_rels" USING btree ("order");
  CREATE INDEX "users_rels_parent_idx" ON "users_rels" USING btree ("parent_id");
  CREATE INDEX "users_rels_path_idx" ON "users_rels" USING btree ("path");
  CREATE INDEX "users_rels_cities_id_idx" ON "users_rels" USING btree ("cities_id");
  CREATE UNIQUE INDEX "cities_slug_idx" ON "cities" USING btree ("slug");
  CREATE INDEX "cities_active_idx" ON "cities" USING btree ("active");
  CREATE INDEX "cities_updated_at_idx" ON "cities" USING btree ("updated_at");
  CREATE INDEX "cities_created_at_idx" ON "cities" USING btree ("created_at");
  CREATE INDEX "oauth_connections_owner_idx" ON "oauth_connections" USING btree ("owner_id");
  CREATE INDEX "oauth_connections_provider_idx" ON "oauth_connections" USING btree ("provider");
  CREATE INDEX "oauth_connections_status_idx" ON "oauth_connections" USING btree ("status");
  CREATE INDEX "oauth_connections_external_account_id_idx" ON "oauth_connections" USING btree ("external_account_id");
  CREATE INDEX "oauth_connections_calendar_id_idx" ON "oauth_connections" USING btree ("calendar_id");
  CREATE INDEX "oauth_connections_updated_at_idx" ON "oauth_connections" USING btree ("updated_at");
  CREATE INDEX "oauth_connections_created_at_idx" ON "oauth_connections" USING btree ("created_at");
  CREATE INDEX "oauth_connections_texts_order_parent" ON "oauth_connections_texts" USING btree ("order","parent_id");
  CREATE INDEX "ingestion_records_errors_order_idx" ON "ingestion_records_errors" USING btree ("_order");
  CREATE INDEX "ingestion_records_errors_parent_id_idx" ON "ingestion_records_errors" USING btree ("_parent_id");
  CREATE INDEX "ingestion_records_source_idx" ON "ingestion_records" USING btree ("source");
  CREATE UNIQUE INDEX "ingestion_records_source_key_idx" ON "ingestion_records" USING btree ("source_key");
  CREATE INDEX "ingestion_records_external_id_idx" ON "ingestion_records" USING btree ("external_id");
  CREATE INDEX "ingestion_records_status_idx" ON "ingestion_records" USING btree ("status");
  CREATE INDEX "ingestion_records_city_idx" ON "ingestion_records" USING btree ("city_id");
  CREATE INDEX "ingestion_records_venue_idx" ON "ingestion_records" USING btree ("venue_id");
  CREATE INDEX "ingestion_records_submitted_by_idx" ON "ingestion_records" USING btree ("submitted_by_id");
  CREATE INDEX "ingestion_records_connection_idx" ON "ingestion_records" USING btree ("connection_id");
  CREATE INDEX "ingestion_records_linked_event_idx" ON "ingestion_records" USING btree ("linked_event_id");
  CREATE INDEX "ingestion_records_payload_hash_idx" ON "ingestion_records" USING btree ("payload_hash");
  CREATE INDEX "ingestion_records_updated_at_idx" ON "ingestion_records" USING btree ("updated_at");
  CREATE INDEX "ingestion_records_created_at_idx" ON "ingestion_records" USING btree ("created_at");
  CREATE INDEX "ingestion_records_rels_order_idx" ON "ingestion_records_rels" USING btree ("order");
  CREATE INDEX "ingestion_records_rels_parent_idx" ON "ingestion_records_rels" USING btree ("parent_id");
  CREATE INDEX "ingestion_records_rels_path_idx" ON "ingestion_records_rels" USING btree ("path");
  CREATE INDEX "ingestion_records_rels_events_id_idx" ON "ingestion_records_rels" USING btree ("events_id");
  ALTER TABLE "events" ADD CONSTRAINT "events_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_sync_ingestion_record_id_ingestion_records_id_fk" FOREIGN KEY ("sync_ingestion_record_id") REFERENCES "public"."ingestion_records"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "venues" ADD CONSTRAINT "venues_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cities_fk" FOREIGN KEY ("cities_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_oauth_connections_fk" FOREIGN KEY ("oauth_connections_id") REFERENCES "public"."oauth_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ingestion_records_fk" FOREIGN KEY ("ingestion_records_id") REFERENCES "public"."ingestion_records"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "events_city_idx" ON "events" USING btree ("city_id");
  CREATE UNIQUE INDEX "events_sync_sync_source_key_idx" ON "events" USING btree ("sync_source_key");
  CREATE INDEX "events_sync_sync_ingestion_record_idx" ON "events" USING btree ("sync_ingestion_record_id");
  CREATE INDEX "venues_city_idx" ON "venues" USING btree ("city_id");
  CREATE INDEX "venues_instagram_instagram_username_idx" ON "venues" USING btree ("instagram_username");
  CREATE INDEX "venues_instagram_instagram_account_id_idx" ON "venues" USING btree ("instagram_account_id");
  CREATE INDEX "payload_locked_documents_rels_cities_id_idx" ON "payload_locked_documents_rels" USING btree ("cities_id");
  CREATE INDEX "payload_locked_documents_rels_oauth_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("oauth_connections_id");
  CREATE INDEX "payload_locked_documents_rels_ingestion_records_id_idx" ON "payload_locked_documents_rels" USING btree ("ingestion_records_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "oauth_connections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "oauth_connections_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ingestion_records_errors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ingestion_records" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ingestion_records_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_city_id_cities_id_fk";
  
  ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_sync_ingestion_record_id_ingestion_records_id_fk";
  
  ALTER TABLE "venues" DROP CONSTRAINT IF EXISTS "venues_city_id_cities_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_cities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_oauth_connections_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_ingestion_records_fk";
  
  UPDATE "users_roles" SET "value" = 'attendee' WHERE "value" = 'ambassador';
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_roles";
  CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'editor', 'attendee');
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_roles" USING "value"::"public"."enum_users_roles";
  UPDATE "events" SET "sync_source" = 'manual' WHERE "sync_source" NOT IN ('manual', 'wordpress');
  ALTER TABLE "events" ALTER COLUMN "sync_source" SET DATA TYPE text;
  ALTER TABLE "events" ALTER COLUMN "sync_source" SET DEFAULT 'manual'::text;
  DROP TYPE "public"."enum_events_sync_source";
  CREATE TYPE "public"."enum_events_sync_source" AS ENUM('manual', 'wordpress');
  ALTER TABLE "events" ALTER COLUMN "sync_source" SET DEFAULT 'manual'::"public"."enum_events_sync_source";
  ALTER TABLE "events" ALTER COLUMN "sync_source" SET DATA TYPE "public"."enum_events_sync_source" USING "sync_source"::"public"."enum_events_sync_source";
  DROP INDEX "events_city_idx";
  DROP INDEX "events_sync_sync_source_key_idx";
  DROP INDEX "events_sync_sync_ingestion_record_idx";
  DROP INDEX "venues_city_idx";
  DROP INDEX "venues_instagram_instagram_username_idx";
  DROP INDEX "venues_instagram_instagram_account_id_idx";
  DROP INDEX "payload_locked_documents_rels_cities_id_idx";
  DROP INDEX "payload_locked_documents_rels_oauth_connections_id_idx";
  DROP INDEX "payload_locked_documents_rels_ingestion_records_id_idx";
  ALTER TABLE "events" DROP COLUMN "city_id";
  ALTER TABLE "events" DROP COLUMN "sync_source_key";
  ALTER TABLE "events" DROP COLUMN "sync_external_url";
  ALTER TABLE "events" DROP COLUMN "sync_ingestion_record_id";
  ALTER TABLE "venues" DROP COLUMN "city_id";
  ALTER TABLE "venues" DROP COLUMN "instagram_username";
  ALTER TABLE "venues" DROP COLUMN "instagram_account_id";
  ALTER TABLE "venues" DROP COLUMN "instagram_monitoring_enabled";
  ALTER TABLE "venues" DROP COLUMN "instagram_last_checked_at";
  ALTER TABLE "venues" DROP COLUMN "instagram_status";
  ALTER TABLE "venues" DROP COLUMN "instagram_last_error";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "cities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "oauth_connections_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ingestion_records_id";
  DROP TABLE "users_rels" CASCADE;
  DROP TABLE "oauth_connections_texts" CASCADE;
  DROP TABLE "ingestion_records_errors" CASCADE;
  DROP TABLE "ingestion_records_rels" CASCADE;
  DROP TABLE "oauth_connections" CASCADE;
  DROP TABLE "ingestion_records" CASCADE;
  DROP TABLE "cities" CASCADE;
  DROP TYPE "public"."enum_venues_instagram_status";
  DROP TYPE "public"."enum_oauth_connections_provider";
  DROP TYPE "public"."enum_oauth_connections_status";
  DROP TYPE "public"."enum_ingestion_records_source";
  DROP TYPE "public"."enum_ingestion_records_status";`)
}
