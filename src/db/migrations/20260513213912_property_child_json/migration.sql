ALTER TABLE "ddf_destinations" ADD COLUMN "member_first_name" text;--> statement-breakpoint
ALTER TABLE "ddf_destinations" ADD COLUMN "member_last_name" text;--> statement-breakpoint
ALTER TABLE "ddf_destinations" ADD COLUMN "member_key" text;--> statement-breakpoint
ALTER TABLE "ddf_destinations" ADD COLUMN "original_entry_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ddf_destinations" ADD COLUMN "modification_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ddf_destinations" ADD COLUMN "full_nsp" boolean;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "rooms" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "media" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "primary_media_url" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" DROP COLUMN "property_type";--> statement-breakpoint
ALTER TABLE "ddf_destinations" ALTER COLUMN "destination_type" SET DATA TYPE text USING "destination_type"::text;--> statement-breakpoint
ALTER TABLE "ddf_destinations" ALTER COLUMN "destination_status" SET DATA TYPE text USING "destination_status"::text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ALTER COLUMN "stories" SET DATA TYPE double precision USING "stories"::double precision;--> statement-breakpoint
CREATE INDEX "ddf_destinations_member_idx" ON "ddf_destinations" ("member_key");--> statement-breakpoint
CREATE INDEX "ddf_properties_list_aor_key_idx" ON "ddf_properties" ("list_aor_key");