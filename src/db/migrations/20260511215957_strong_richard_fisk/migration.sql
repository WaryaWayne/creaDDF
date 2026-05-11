DROP INDEX "ddf_media_media_key_idx";--> statement-breakpoint
ALTER TABLE "ddf_media" DROP CONSTRAINT "ddf_media_pkey";--> statement-breakpoint
ALTER TABLE "ddf_media" ADD PRIMARY KEY ("media_key");--> statement-breakpoint
ALTER TABLE "ddf_property_rooms" DROP CONSTRAINT "ddf_property_rooms_pkey";--> statement-breakpoint
ALTER TABLE "ddf_property_rooms" ADD PRIMARY KEY ("room_key");