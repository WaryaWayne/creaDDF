CREATE TABLE "ddf_destinations" (
	"destination_id" integer PRIMARY KEY,
	"destination_name" text,
	"destination_url" text,
	"destination_type" text,
	"destination_status" text,
	"member_first_name" text,
	"member_last_name" text,
	"member_key" text,
	"original_entry_timestamp" timestamp with time zone,
	"modification_timestamp" timestamp with time zone,
	"full_nsp" boolean,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_media" (
	"media_key" text PRIMARY KEY,
	"resource" text NOT NULL,
	"resource_key" text NOT NULL,
	"resource_record_id" text,
	"resource_record_key" text,
	"resource_name" text,
	"modification_timestamp" timestamp with time zone,
	"media_url" text,
	"media_category" text,
	"long_description" text,
	"preferred_photo" boolean,
	"sort_order" integer,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_member_designations" (
	"member_key" text NOT NULL,
	"designation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_member_languages" (
	"member_key" text NOT NULL,
	"language" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_members" (
	"member_key" text PRIMARY KEY,
	"member_mls_id" text,
	"modification_timestamp" timestamp with time zone,
	"original_entry_timestamp" timestamp with time zone,
	"office_key" text,
	"office_national_association_id" text,
	"job_title" text,
	"member_aor_key" text,
	"member_aor" text,
	"address1" text,
	"address2" text,
	"city" text,
	"province" text,
	"country" text,
	"postal_code" text,
	"fax" text,
	"first_name" text,
	"last_name" text,
	"middle_name" text,
	"name_prefix" text,
	"name_suffix" text,
	"national_association_id" text,
	"nickname" text,
	"office_phone" text,
	"office_phone_ext" text,
	"pager" text,
	"toll_free_phone" text,
	"status" text,
	"type" text,
	"email_yn" boolean,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_offices" (
	"office_key" text PRIMARY KEY,
	"office_mls_id" text,
	"modification_timestamp" timestamp with time zone,
	"original_entry_timestamp" timestamp with time zone,
	"office_name" text,
	"office_aor_key" text,
	"office_aor" text,
	"office_national_association_id" text,
	"franchise_national_association_id" text,
	"office_broker_national_association_id" text,
	"address1" text,
	"address2" text,
	"city" text,
	"province" text,
	"country" text,
	"fax" text,
	"phone" text,
	"phone_ext" text,
	"postal_code" text,
	"office_type" text,
	"office_status" text,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_open_houses" (
	"open_house_key" text PRIMARY KEY,
	"listing_key" text,
	"listing_id" text,
	"open_house_date" date,
	"open_house_start_time" time,
	"open_house_end_time" time,
	"open_house_type" text,
	"open_house_status" text,
	"open_house_remarks" text,
	"livestream_open_house_url" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_properties" (
	"listing_key" text PRIMARY KEY,
	"listing_id" text,
	"modification_timestamp" timestamp with time zone,
	"original_entry_timestamp" timestamp with time zone,
	"availability_date" date,
	"status_change_timestamp" timestamp with time zone,
	"photos_change_timestamp" timestamp with time zone,
	"standard_status" text,
	"property_sub_type" text,
	"business_type" jsonb,
	"public_remarks" text,
	"list_price" double precision,
	"lease_amount" double precision,
	"lease_amount_frequency" text,
	"lease_per_unit" text,
	"price_per_unit" text,
	"association_fee" double precision,
	"association_fee_frequency" text,
	"association_name" text,
	"association_fee_includes" jsonb,
	"total_actual_rent" double precision,
	"existing_lease_type" jsonb,
	"list_office_key" text,
	"co_list_office_key" text,
	"co_list_office_key2" text,
	"co_list_office_key3" text,
	"list_office_national_association_id" text,
	"co_list_office_national_association_id" text,
	"co_list_office_national_association_id2" text,
	"co_list_office_national_association_id3" text,
	"list_agent_key" text,
	"co_list_agent_key" text,
	"co_list_agent_key2" text,
	"co_list_agent_key3" text,
	"list_agent_national_association_id" text,
	"co_list_agent_national_association_id" text,
	"co_list_agent_national_association_id2" text,
	"co_list_agent_national_association_id3" text,
	"listing_url" text,
	"originating_system_name" text,
	"photos_count" integer,
	"common_interest" text,
	"list_aor" text,
	"list_aor_key" text,
	"unparsed_address" text,
	"postal_code" text,
	"subdivision_name" text,
	"province" text,
	"street_dir_prefix" text,
	"street_dir_suffix" text,
	"street_name" text,
	"street_number" text,
	"street_suffix" text,
	"unit_number" text,
	"country" text,
	"city" text,
	"directions" text,
	"city_region" text,
	"latitude" double precision,
	"longitude" double precision,
	"map_coordinate_verified" boolean,
	"geocode_manual" boolean,
	"parking_total" integer,
	"parking_features" jsonb,
	"year_built" integer,
	"bathrooms_partial" integer,
	"bathrooms_total_integer" integer,
	"bedrooms_total" integer,
	"bedrooms_above_grade" integer,
	"bedrooms_below_grade" integer,
	"building_area_total" double precision,
	"building_area_units" text,
	"building_features" jsonb,
	"above_grade_finished_area" double precision,
	"above_grade_finished_area_units" text,
	"above_grade_finished_area_source" text,
	"above_grade_finished_area_minimum" double precision,
	"above_grade_finished_area_maximum" double precision,
	"below_grade_finished_area" double precision,
	"below_grade_finished_area_units" text,
	"below_grade_finished_area_source" text,
	"below_grade_finished_area_minimum" double precision,
	"below_grade_finished_area_maximum" double precision,
	"living_area" double precision,
	"living_area_units" text,
	"living_area_source" text,
	"living_area_minimum" double precision,
	"living_area_maximum" double precision,
	"fireplaces_total" integer,
	"fireplace" boolean,
	"fireplace_features" jsonb,
	"architectural_style" jsonb,
	"heating" jsonb,
	"foundation_details" jsonb,
	"basement" jsonb,
	"exterior_features" jsonb,
	"flooring" jsonb,
	"cooling" jsonb,
	"property_condition" jsonb,
	"roof" jsonb,
	"construction_materials" jsonb,
	"stories" double precision,
	"property_attached" boolean,
	"accessibility_features" jsonb,
	"zoning" text,
	"zoning_description" text,
	"tax_annual_amount" double precision,
	"tax_block" text,
	"tax_lot" text,
	"tax_year" integer,
	"structure_type" jsonb,
	"parcel_number" text,
	"utilities" jsonb,
	"irrigation_source" jsonb,
	"water_source" jsonb,
	"sewer" jsonb,
	"electric" jsonb,
	"documents_available" jsonb,
	"water_body_name" text,
	"view" jsonb,
	"number_of_buildings" integer,
	"number_of_units_total" integer,
	"lot_features" jsonb,
	"lot_size_area" double precision,
	"lot_size_dimensions" text,
	"lot_size_units" text,
	"pool_features" jsonb,
	"road_surface_type" jsonb,
	"current_use" jsonb,
	"possible_use" jsonb,
	"anchors_co_tenants" text,
	"waterfront_features" jsonb,
	"community_features" jsonb,
	"frontage_length_numeric" double precision,
	"frontage_length_numeric_units" text,
	"fencing" jsonb,
	"appliances" jsonb,
	"other_equipment" jsonb,
	"security_features" jsonb,
	"inclusions" text,
	"internet_entire_listing_display" boolean,
	"internet_address_display" boolean,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_property_rooms" (
	"room_key" text PRIMARY KEY,
	"listing_key" text NOT NULL,
	"listing_id" text,
	"modification_timestamp" timestamp with time zone,
	"room_description" text,
	"room_dimensions" text,
	"room_length" double precision,
	"room_level" text,
	"room_width" double precision,
	"room_length_width_units" text,
	"room_type" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ddf_social_media" (
	"social_media_key" text PRIMARY KEY,
	"resource" text NOT NULL,
	"resource_key" text NOT NULL,
	"resource_record_key" text,
	"social_media_type" text,
	"modification_timestamp" timestamp with time zone,
	"resource_name" text,
	"social_media_url_or_id" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE INDEX "ddf_destinations_status_idx" ON "ddf_destinations" ("destination_status");--> statement-breakpoint
CREATE INDEX "ddf_destinations_member_idx" ON "ddf_destinations" ("member_key");--> statement-breakpoint
CREATE INDEX "ddf_media_owner_idx" ON "ddf_media" ("resource","resource_key");--> statement-breakpoint
CREATE INDEX "ddf_media_modified_idx" ON "ddf_media" ("modification_timestamp");--> statement-breakpoint
CREATE INDEX "ddf_member_designations_member_idx" ON "ddf_member_designations" ("member_key");--> statement-breakpoint
CREATE INDEX "ddf_member_languages_member_idx" ON "ddf_member_languages" ("member_key");--> statement-breakpoint
CREATE INDEX "ddf_members_modified_idx" ON "ddf_members" ("modification_timestamp");--> statement-breakpoint
CREATE INDEX "ddf_members_office_idx" ON "ddf_members" ("office_key");--> statement-breakpoint
CREATE INDEX "ddf_members_mls_id_idx" ON "ddf_members" ("member_mls_id");--> statement-breakpoint
CREATE INDEX "ddf_offices_modified_idx" ON "ddf_offices" ("modification_timestamp");--> statement-breakpoint
CREATE INDEX "ddf_offices_location_idx" ON "ddf_offices" ("province","city");--> statement-breakpoint
CREATE INDEX "ddf_offices_mls_id_idx" ON "ddf_offices" ("office_mls_id");--> statement-breakpoint
CREATE INDEX "ddf_open_houses_listing_idx" ON "ddf_open_houses" ("listing_key");--> statement-breakpoint
CREATE INDEX "ddf_open_houses_listing_id_idx" ON "ddf_open_houses" ("listing_id");--> statement-breakpoint
CREATE INDEX "ddf_open_houses_date_idx" ON "ddf_open_houses" ("open_house_date");--> statement-breakpoint
CREATE INDEX "ddf_properties_modified_idx" ON "ddf_properties" ("modification_timestamp");--> statement-breakpoint
CREATE INDEX "ddf_properties_list_office_idx" ON "ddf_properties" ("list_office_key");--> statement-breakpoint
CREATE INDEX "ddf_properties_list_agent_idx" ON "ddf_properties" ("list_agent_key");--> statement-breakpoint
CREATE INDEX "ddf_properties_status_idx" ON "ddf_properties" ("standard_status");--> statement-breakpoint
CREATE INDEX "ddf_properties_location_idx" ON "ddf_properties" ("province","city");--> statement-breakpoint
CREATE INDEX "ddf_properties_listing_id_idx" ON "ddf_properties" ("listing_id");--> statement-breakpoint
CREATE INDEX "ddf_property_rooms_listing_idx" ON "ddf_property_rooms" ("listing_key");--> statement-breakpoint
CREATE INDEX "ddf_social_media_owner_idx" ON "ddf_social_media" ("resource","resource_key");--> statement-breakpoint
CREATE INDEX "ddf_social_media_modified_idx" ON "ddf_social_media" ("modification_timestamp");--> statement-breakpoint
CREATE INDEX "ddf_sync_errors_run_idx" ON "ddf_sync_errors" ("run_id");--> statement-breakpoint
CREATE INDEX "ddf_sync_errors_resource_idx" ON "ddf_sync_errors" ("resource","record_key");--> statement-breakpoint
CREATE INDEX "ddf_sync_runs_started_idx" ON "ddf_sync_runs" ("started_at");