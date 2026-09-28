import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_media_source_platform" AS ENUM('instagram', 'facebook', 'wordpress');
  ALTER TABLE "media" ADD COLUMN "source_source_key" varchar;
  ALTER TABLE "media" ADD COLUMN "source_platform" "enum_media_source_platform";
  ALTER TABLE "media" ADD COLUMN "source_external_id" varchar;
  ALTER TABLE "media" ADD COLUMN "source_source_url" varchar;
  ALTER TABLE "oauth_connections" ADD COLUMN "city_id" integer NOT NULL;
  ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "media_source_source_source_key_idx" ON "media" USING btree ("source_source_key");
  CREATE INDEX "media_source_source_external_id_idx" ON "media" USING btree ("source_external_id");
  CREATE INDEX "oauth_connections_city_idx" ON "oauth_connections" USING btree ("city_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "oauth_connections" DROP CONSTRAINT "oauth_connections_city_id_cities_id_fk";
  
  DROP INDEX "media_source_source_source_key_idx";
  DROP INDEX "media_source_source_external_id_idx";
  DROP INDEX "oauth_connections_city_idx";
  ALTER TABLE "media" DROP COLUMN "source_source_key";
  ALTER TABLE "media" DROP COLUMN "source_platform";
  ALTER TABLE "media" DROP COLUMN "source_external_id";
  ALTER TABLE "media" DROP COLUMN "source_source_url";
  ALTER TABLE "oauth_connections" DROP COLUMN "city_id";
  DROP TYPE "public"."enum_media_source_platform";`)
}
