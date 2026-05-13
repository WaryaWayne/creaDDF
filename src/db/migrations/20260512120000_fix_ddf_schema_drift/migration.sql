ALTER TABLE "ddf_properties" ALTER COLUMN "price_per_unit" SET DATA TYPE text USING "price_per_unit"::text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "list_office_national_association_id" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_office_national_association_id" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_office_national_association_id2" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_office_national_association_id3" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "list_agent_national_association_id" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_agent_national_association_id" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_agent_national_association_id2" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_agent_national_association_id3" text;--> statement-breakpoint
ALTER TABLE "ddf_members" DROP COLUMN IF EXISTS "email";--> statement-breakpoint
CREATE TABLE "ddf_destinations" (
	"destination_id" integer PRIMARY KEY,
	"destination_name" text,
	"destination_url" text,
	"destination_type" text,
	"destination_status" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "ddf_destinations_status_idx" ON "ddf_destinations" ("destination_status");
