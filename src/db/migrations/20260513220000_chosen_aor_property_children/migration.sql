ALTER TABLE "ddf_properties" ADD COLUMN "rooms" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "media" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "primary_media_url" text;--> statement-breakpoint
CREATE INDEX "ddf_properties_list_aor_key_idx" ON "ddf_properties" ("list_aor_key");--> statement-breakpoint
CREATE INDEX "ddf_members_aor_key_idx" ON "ddf_members" ("member_aor_key");--> statement-breakpoint
CREATE INDEX "ddf_offices_aor_key_idx" ON "ddf_offices" ("office_aor_key");
