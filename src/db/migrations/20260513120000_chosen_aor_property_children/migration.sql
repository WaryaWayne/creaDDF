ALTER TABLE "ddf_properties" ADD COLUMN "rooms" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "media" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "primary_media_url" text;--> statement-breakpoint
UPDATE "ddf_properties"
SET
  "rooms" = "raw"->'Rooms',
  "media" = "raw"->'Media',
  "primary_media_url" = COALESCE(
    (
      SELECT media_item->>'MediaURL'
      FROM jsonb_array_elements(COALESCE("raw"->'Media', '[]'::jsonb)) AS media_item
      WHERE media_item->>'MediaURL' IS NOT NULL
      ORDER BY
        CASE WHEN media_item->>'PreferredPhotoYN' = 'true' THEN 0 ELSE 1 END,
        CASE WHEN media_item->>'Order' ~ '^[0-9]+$' THEN (media_item->>'Order')::integer END NULLS LAST
      LIMIT 1
    ),
    NULL
  )
WHERE "raw" IS NOT NULL;
