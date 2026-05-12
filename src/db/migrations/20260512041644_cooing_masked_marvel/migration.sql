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
ALTER TABLE "ddf_media" ADD COLUMN "resource_record_id" text;--> statement-breakpoint
ALTER TABLE "ddf_media" ADD COLUMN "resource_record_key" text;--> statement-breakpoint
ALTER TABLE "ddf_media" ADD COLUMN "resource_name" text;--> statement-breakpoint
ALTER TABLE "ddf_media" ADD COLUMN "long_description" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "member_mls_id" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "original_entry_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "office_national_association_id" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "member_aor_key" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "member_aor" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "address1" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "address2" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "fax" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "middle_name" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "name_prefix" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "name_suffix" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "national_association_id" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "office_phone" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "office_phone_ext" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "pager" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "toll_free_phone" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "ddf_members" ADD COLUMN "email_yn" boolean;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "office_mls_id" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "original_entry_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "office_aor_key" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "office_aor" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "office_national_association_id" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "franchise_national_association_id" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "office_broker_national_association_id" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "address1" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "address2" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "fax" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "phone_ext" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "office_type" text;--> statement-breakpoint
ALTER TABLE "ddf_offices" ADD COLUMN "office_status" text;--> statement-breakpoint
ALTER TABLE "ddf_open_houses" ADD COLUMN "listing_id" text;--> statement-breakpoint
ALTER TABLE "ddf_open_houses" ADD COLUMN "open_house_start_time" time;--> statement-breakpoint
ALTER TABLE "ddf_open_houses" ADD COLUMN "open_house_end_time" time;--> statement-breakpoint
ALTER TABLE "ddf_open_houses" ADD COLUMN "open_house_type" text;--> statement-breakpoint
ALTER TABLE "ddf_open_houses" ADD COLUMN "open_house_status" text;--> statement-breakpoint
ALTER TABLE "ddf_open_houses" ADD COLUMN "open_house_remarks" text;--> statement-breakpoint
ALTER TABLE "ddf_open_houses" ADD COLUMN "livestream_open_house_url" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "listing_id" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "original_entry_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "availability_date" date;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "status_change_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "photos_change_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "property_sub_type" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "business_type" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "public_remarks" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "list_price" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "lease_amount" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "lease_amount_frequency" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "lease_per_unit" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "price_per_unit" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "association_fee" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "association_fee_frequency" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "association_name" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "association_fee_includes" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "total_actual_rent" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "existing_lease_type" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_office_key" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_office_key2" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_office_key3" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_agent_key" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_agent_key2" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "co_list_agent_key3" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "listing_url" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "originating_system_name" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "photos_count" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "common_interest" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "list_aor" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "list_aor_key" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "unparsed_address" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "subdivision_name" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "street_dir_prefix" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "street_dir_suffix" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "street_name" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "street_number" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "street_suffix" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "unit_number" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "directions" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "city_region" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "map_coordinate_verified" boolean;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "geocode_manual" boolean;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "parking_total" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "parking_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "year_built" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "bathrooms_partial" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "bathrooms_total_integer" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "bedrooms_total" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "bedrooms_above_grade" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "bedrooms_below_grade" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "building_area_total" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "building_area_units" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "building_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "above_grade_finished_area" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "above_grade_finished_area_units" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "above_grade_finished_area_source" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "above_grade_finished_area_minimum" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "above_grade_finished_area_maximum" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "below_grade_finished_area" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "below_grade_finished_area_units" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "below_grade_finished_area_source" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "below_grade_finished_area_minimum" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "below_grade_finished_area_maximum" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "living_area" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "living_area_units" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "living_area_source" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "living_area_minimum" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "living_area_maximum" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "fireplaces_total" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "fireplace" boolean;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "fireplace_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "architectural_style" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "heating" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "foundation_details" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "basement" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "exterior_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "flooring" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "cooling" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "property_condition" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "roof" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "construction_materials" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "stories" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "property_attached" boolean;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "accessibility_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "zoning" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "zoning_description" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "tax_annual_amount" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "tax_block" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "tax_lot" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "tax_year" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "structure_type" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "parcel_number" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "utilities" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "irrigation_source" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "water_source" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "sewer" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "electric" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "documents_available" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "water_body_name" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "view" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "number_of_buildings" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "number_of_units_total" integer;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "lot_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "lot_size_area" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "lot_size_dimensions" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "lot_size_units" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "pool_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "road_surface_type" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "current_use" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "possible_use" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "anchors_co_tenants" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "waterfront_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "community_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "frontage_length_numeric" double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "frontage_length_numeric_units" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "fencing" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "appliances" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "other_equipment" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "security_features" jsonb;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "inclusions" text;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "internet_entire_listing_display" boolean;--> statement-breakpoint
ALTER TABLE "ddf_properties" ADD COLUMN "internet_address_display" boolean;--> statement-breakpoint
ALTER TABLE "ddf_property_rooms" ADD COLUMN "listing_id" text;--> statement-breakpoint
ALTER TABLE "ddf_property_rooms" ADD COLUMN "modification_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ddf_property_rooms" ADD COLUMN "room_description" text;--> statement-breakpoint
ALTER TABLE "ddf_property_rooms" ADD COLUMN "room_dimensions" text;--> statement-breakpoint
ALTER TABLE "ddf_property_rooms" ADD COLUMN "room_length" double precision;--> statement-breakpoint
ALTER TABLE "ddf_property_rooms" ADD COLUMN "room_width" double precision;--> statement-breakpoint
ALTER TABLE "ddf_property_rooms" ADD COLUMN "room_length_width_units" text;--> statement-breakpoint
ALTER TABLE "ddf_open_houses" ALTER COLUMN "open_house_date" SET DATA TYPE date USING "open_house_date"::date;--> statement-breakpoint
ALTER TABLE "ddf_properties" ALTER COLUMN "latitude" SET DATA TYPE double precision USING "latitude"::double precision;--> statement-breakpoint
ALTER TABLE "ddf_properties" ALTER COLUMN "longitude" SET DATA TYPE double precision USING "longitude"::double precision;--> statement-breakpoint
CREATE INDEX "ddf_member_designations_member_idx" ON "ddf_member_designations" ("member_key");--> statement-breakpoint
CREATE INDEX "ddf_member_languages_member_idx" ON "ddf_member_languages" ("member_key");--> statement-breakpoint
CREATE INDEX "ddf_members_mls_id_idx" ON "ddf_members" ("member_mls_id");--> statement-breakpoint
CREATE INDEX "ddf_offices_mls_id_idx" ON "ddf_offices" ("office_mls_id");--> statement-breakpoint
CREATE INDEX "ddf_open_houses_listing_id_idx" ON "ddf_open_houses" ("listing_id");--> statement-breakpoint
CREATE INDEX "ddf_properties_listing_id_idx" ON "ddf_properties" ("listing_id");--> statement-breakpoint
CREATE INDEX "ddf_social_media_owner_idx" ON "ddf_social_media" ("resource","resource_key");--> statement-breakpoint
CREATE INDEX "ddf_social_media_modified_idx" ON "ddf_social_media" ("modification_timestamp");