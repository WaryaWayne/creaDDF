CREATE TABLE "ddf_media" (
	"media_key" text,
	"resource" text,
	"resource_key" text,
	"modification_timestamp" timestamp with time zone,
	"media_url" text,
	"media_category" text,
	"preferred_photo" boolean,
	"sort_order" integer,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ddf_media_pkey" PRIMARY KEY("resource","resource_key","media_key")
);
--> statement-breakpoint
CREATE TABLE "ddf_members" (
	"member_key" text PRIMARY KEY,
	"modification_timestamp" timestamp with time zone,
	"office_key" text,
	"first_name" text,
	"last_name" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_offices" (
	"office_key" text PRIMARY KEY,
	"modification_timestamp" timestamp with time zone,
	"office_name" text,
	"city" text,
	"province" text,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_open_houses" (
	"open_house_key" text PRIMARY KEY,
	"listing_key" text,
	"open_house_date" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_properties" (
	"listing_key" text PRIMARY KEY,
	"modification_timestamp" timestamp with time zone,
	"list_office_key" text,
	"list_agent_key" text,
	"standard_status" text,
	"property_type" text,
	"city" text,
	"province" text,
	"latitude" text,
	"longitude" text,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_property_rooms" (
	"listing_key" text,
	"room_key" text,
	"room_type" text,
	"room_level" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ddf_property_rooms_pkey" PRIMARY KEY("listing_key","room_key")
);
--> statement-breakpoint
CREATE TABLE "ddf_sync_errors" (
	"id" text PRIMARY KEY,
	"run_id" text,
	"resource" text NOT NULL,
	"record_key" text NOT NULL,
	"stage" text NOT NULL,
	"message" text NOT NULL,
	"cause" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_sync_runs" (
	"id" text PRIMARY KEY,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"destination_id" integer,
	"summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_watermarks" (
	"resource" text PRIMARY KEY,
	"watermark" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ddf_media_owner_idx" ON "ddf_media" ("resource","resource_key");--> statement-breakpoint
CREATE INDEX "ddf_media_modified_idx" ON "ddf_media" ("modification_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "ddf_media_media_key_idx" ON "ddf_media" ("media_key");--> statement-breakpoint
CREATE INDEX "ddf_members_modified_idx" ON "ddf_members" ("modification_timestamp");--> statement-breakpoint
CREATE INDEX "ddf_members_office_idx" ON "ddf_members" ("office_key");--> statement-breakpoint
CREATE INDEX "ddf_offices_modified_idx" ON "ddf_offices" ("modification_timestamp");--> statement-breakpoint
CREATE INDEX "ddf_offices_location_idx" ON "ddf_offices" ("province","city");--> statement-breakpoint
CREATE INDEX "ddf_open_houses_listing_idx" ON "ddf_open_houses" ("listing_key");--> statement-breakpoint
CREATE INDEX "ddf_open_houses_date_idx" ON "ddf_open_houses" ("open_house_date");--> statement-breakpoint
CREATE INDEX "ddf_properties_modified_idx" ON "ddf_properties" ("modification_timestamp");--> statement-breakpoint
CREATE INDEX "ddf_properties_list_office_idx" ON "ddf_properties" ("list_office_key");--> statement-breakpoint
CREATE INDEX "ddf_properties_list_agent_idx" ON "ddf_properties" ("list_agent_key");--> statement-breakpoint
CREATE INDEX "ddf_properties_status_idx" ON "ddf_properties" ("standard_status");--> statement-breakpoint
CREATE INDEX "ddf_properties_location_idx" ON "ddf_properties" ("province","city");--> statement-breakpoint
CREATE INDEX "ddf_property_rooms_listing_idx" ON "ddf_property_rooms" ("listing_key");--> statement-breakpoint
CREATE INDEX "ddf_sync_errors_run_idx" ON "ddf_sync_errors" ("run_id");--> statement-breakpoint
CREATE INDEX "ddf_sync_errors_resource_idx" ON "ddf_sync_errors" ("resource","record_key");--> statement-breakpoint
CREATE INDEX "ddf_sync_runs_started_idx" ON "ddf_sync_runs" ("started_at");