import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { SyncResource, SyncStage } from "../sync";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const ddfProperties = pgTable(
  "ddf_properties",
  {
    listingKey: text("listing_key").primaryKey(),
    modificationTimestamp: timestamp("modification_timestamp", {
      withTimezone: true,
    }),
    listOfficeKey: text("list_office_key"),
    listAgentKey: text("list_agent_key"),
    standardStatus: text("standard_status"),
    propertyType: text("property_type"),
    city: text("city"),
    province: text("province"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    active: boolean("active").default(true).notNull(),
    raw: jsonb("raw").$type<unknown>().notNull(),
    ...timestamps,
  },
  (table) => [
    index("ddf_properties_modified_idx").on(table.modificationTimestamp),
    index("ddf_properties_list_office_idx").on(table.listOfficeKey),
    index("ddf_properties_list_agent_idx").on(table.listAgentKey),
    index("ddf_properties_status_idx").on(table.standardStatus),
    index("ddf_properties_location_idx").on(table.province, table.city),
  ],
);

export const ddfPropertyRooms = pgTable(
  "ddf_property_rooms",
  {
    listingKey: text("listing_key").notNull(),
    roomKey: text("room_key").primaryKey(),
    roomType: text("room_type"),
    roomLevel: text("room_level"),
    raw: jsonb("raw").$type<unknown>().notNull(),
    ...timestamps,
  },
  (table) => [
    index("ddf_property_rooms_listing_idx").on(table.listingKey),
  ],
);

export const ddfMedia = pgTable(
  "ddf_media",
  {
    mediaKey: text("media_key").primaryKey(),
    resource: text("resource").$type<SyncResource>().notNull(),
    resourceKey: text("resource_key").notNull(),
    modificationTimestamp: timestamp("modification_timestamp", {
      withTimezone: true,
    }),
    mediaUrl: text("media_url"),
    mediaCategory: text("media_category"),
    preferredPhoto: boolean("preferred_photo"),
    sortOrder: integer("sort_order"),
    raw: jsonb("raw").$type<unknown>().notNull(),
    ...timestamps,
  },
  (table) => [
    index("ddf_media_owner_idx").on(table.resource, table.resourceKey),
    index("ddf_media_modified_idx").on(table.modificationTimestamp),
  ],
);

export const ddfMembers = pgTable(
  "ddf_members",
  {
    memberKey: text("member_key").primaryKey(),
    modificationTimestamp: timestamp("modification_timestamp", {
      withTimezone: true,
    }),
    officeKey: text("office_key"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    active: boolean("active").default(true).notNull(),
    raw: jsonb("raw").$type<unknown>().notNull(),
    ...timestamps,
  },
  (table) => [
    index("ddf_members_modified_idx").on(table.modificationTimestamp),
    index("ddf_members_office_idx").on(table.officeKey),
  ],
);

export const ddfOffices = pgTable(
  "ddf_offices",
  {
    officeKey: text("office_key").primaryKey(),
    modificationTimestamp: timestamp("modification_timestamp", {
      withTimezone: true,
    }),
    officeName: text("office_name"),
    city: text("city"),
    province: text("province"),
    active: boolean("active").default(true).notNull(),
    raw: jsonb("raw").$type<unknown>().notNull(),
    ...timestamps,
  },
  (table) => [
    index("ddf_offices_modified_idx").on(table.modificationTimestamp),
    index("ddf_offices_location_idx").on(table.province, table.city),
  ],
);

export const ddfOpenHouses = pgTable(
  "ddf_open_houses",
  {
    openHouseKey: text("open_house_key").primaryKey(),
    listingKey: text("listing_key"),
    openHouseDate: timestamp("open_house_date", { withTimezone: true }),
    raw: jsonb("raw").$type<unknown>().notNull(),
    ...timestamps,
  },
  (table) => [
    index("ddf_open_houses_listing_idx").on(table.listingKey),
    index("ddf_open_houses_date_idx").on(table.openHouseDate),
  ],
);

export const ddfWatermarks = pgTable("ddf_watermarks", {
  resource: text("resource").$type<SyncResource>().primaryKey(),
  watermark: text("watermark").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ddfSyncRuns = pgTable(
  "ddf_sync_runs",
  {
    id: text("id").primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    status: text("status").$type<"success" | "partial_failure" | "failed">().notNull(),
    destinationId: integer("destination_id"),
    summary: jsonb("summary").$type<unknown>().notNull(),
  },
  (table) => [index("ddf_sync_runs_started_idx").on(table.startedAt)],
);

export const ddfSyncErrors = pgTable(
  "ddf_sync_errors",
  {
    id: text("id").primaryKey(),
    runId: text("run_id"),
    resource: text("resource").$type<SyncResource>().notNull(),
    recordKey: text("record_key").notNull(),
    stage: text("stage").$type<SyncStage>().notNull(),
    message: text("message").notNull(),
    cause: jsonb("cause").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ddf_sync_errors_run_idx").on(table.runId),
    index("ddf_sync_errors_resource_idx").on(table.resource, table.recordKey),
  ],
);

export const touchUpdatedAt = { updatedAt: sql<Date>`now()` };
