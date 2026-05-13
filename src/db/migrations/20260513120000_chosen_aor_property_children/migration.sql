ALTER TABLE "ddf_properties" ADD COLUMN IF NOT EXISTS "rooms" jsonb;
ALTER TABLE "ddf_properties" ADD COLUMN IF NOT EXISTS "media" jsonb;
ALTER TABLE "ddf_properties" ADD COLUMN IF NOT EXISTS "primary_media_url" text;
CREATE INDEX IF NOT EXISTS "ddf_properties_list_aor_key_idx" ON "ddf_properties" ("list_aor_key");
