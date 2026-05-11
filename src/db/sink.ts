import { and, eq, inArray } from "drizzle-orm";
import { Cause, Data, Effect } from "effect";
import type {
  MediaRecord,
  MemberRecord,
  MemberSyncSink,
  OfficeRecord,
  OfficeSyncSink,
  OpenHouseRecord,
  OpenHouseSyncSink,
  PropertyGraph,
  PropertyRecord,
  PropertySyncSink,
  RoomRecord,
  SyncOwner,
  SyncRecordError,
} from "../sync";
import { DdfDatabase } from "./layer";
import {
  ddfMedia,
  ddfMembers,
  ddfOffices,
  ddfOpenHouses,
  ddfProperties,
  ddfPropertyRooms,
  ddfSyncErrors,
  touchUpdatedAt,
} from "./schema";

export class DdfDatabaseSinkError extends Data.TaggedError(
  "DdfDatabaseSinkError",
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `DDF database sink operation failed: ${this.operation}`;
  }
}

type JsonRecord = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown): JsonRecord =>
  typeof value === "object" && value !== null ? (value as JsonRecord) : {};

const stringField = (record: JsonRecord, field: string): string | null => {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const numberField = (record: JsonRecord, field: string): number | null => {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const booleanField = (record: JsonRecord, field: string): boolean | null => {
  const value = record[field];
  return typeof value === "boolean" ? value : null;
};

const timestampField = (record: JsonRecord, field: string): Date | null => {
  const value = record[field];
  if (value instanceof Date) return value;
  if (typeof value !== "string") return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis) : null;
};

const requireKey = (operation: string, key: string | null) =>
  key === null
    ? Effect.fail(
        new DdfDatabaseSinkError({
          operation,
          cause: new Error(`Missing stable key for ${operation}`),
        }),
      )
    : Effect.succeed(key);

export const propertyRowFromRecord = (property: unknown) => {
  const record = asRecord(property);
  return {
    listingKey: stringField(record, "ListingKey"),
    modificationTimestamp: timestampField(record, "ModificationTimestamp"),
    listOfficeKey: stringField(record, "ListOfficeKey"),
    listAgentKey: stringField(record, "ListAgentKey"),
    standardStatus: stringField(record, "StandardStatus"),
    propertyType: stringField(record, "PropertyType"),
    city: stringField(record, "City"),
    province: stringField(record, "StateOrProvince"),
    latitude: stringField(record, "Latitude") ?? numberField(record, "Latitude")?.toString() ?? null,
    longitude:
      stringField(record, "Longitude") ?? numberField(record, "Longitude")?.toString() ?? null,
    active: true,
    raw: property,
  };
};

export const roomRowFromRecord = (room: unknown, property: unknown) => {
  const roomRecord = asRecord(room);
  const propertyRecord = asRecord(property);
  const listingKey =
    stringField(roomRecord, "ListingKey") ?? stringField(propertyRecord, "ListingKey");
  return {
    listingKey,
    roomKey:
      stringField(roomRecord, "RoomKey") ??
      [listingKey, stringField(roomRecord, "RoomType"), stringField(roomRecord, "RoomLevel")]
        .filter((part): part is string => part !== null)
        .join(":"),
    roomType: stringField(roomRecord, "RoomType"),
    roomLevel: stringField(roomRecord, "RoomLevel"),
    raw: room,
  };
};

export const mediaRowFromRecord = (media: unknown, owner: SyncOwner) => {
  const record = asRecord(media);
  return {
    mediaKey:
      stringField(record, "MediaKey") ??
      [owner.resource, owner.key, stringField(record, "MediaURL"), numberField(record, "Order")]
        .filter((part): part is string | number => part !== null)
        .join(":"),
    resource: owner.resource,
    resourceKey: owner.key,
    modificationTimestamp: timestampField(record, "ModificationTimestamp"),
    mediaUrl: stringField(record, "MediaURL"),
    mediaCategory: stringField(record, "MediaCategory"),
    preferredPhoto: booleanField(record, "PreferredPhotoYN"),
    sortOrder: numberField(record, "Order"),
    raw: media,
  };
};

export const memberRowFromRecord = (member: unknown) => {
  const record = asRecord(member);
  return {
    memberKey: stringField(record, "MemberKey"),
    modificationTimestamp: timestampField(record, "ModificationTimestamp"),
    officeKey: stringField(record, "OfficeKey"),
    firstName: stringField(record, "MemberFirstName"),
    lastName: stringField(record, "MemberLastName"),
    email: stringField(record, "MemberEmail"),
    active: true,
    raw: member,
  };
};

export const officeRowFromRecord = (office: unknown) => {
  const record = asRecord(office);
  return {
    officeKey: stringField(record, "OfficeKey"),
    modificationTimestamp: timestampField(record, "ModificationTimestamp"),
    officeName: stringField(record, "OfficeName"),
    city: stringField(record, "OfficeCity"),
    province: stringField(record, "OfficeStateOrProvince"),
    active: true,
    raw: office,
  };
};

export const openHouseRowFromRecord = (openHouse: unknown) => {
  const record = asRecord(openHouse);
  return {
    openHouseKey: stringField(record, "OpenHouseKey"),
    listingKey: stringField(record, "ListingKey"),
    openHouseDate: timestampField(record, "OpenHouseDate"),
    raw: openHouse,
  };
};


export interface SerializedCause {
  readonly type: string;
  readonly message: string;
  readonly name?: string;
  readonly stack?: string;
  readonly pretty?: string;
}

export interface SerializedSyncRecordError {
  readonly resource: SyncRecordError["resource"];
  readonly key: string;
  readonly stage: SyncRecordError["stage"];
  readonly message: string;
  readonly cause: SerializedCause;
}

const serializeCauseValue = (cause: unknown): SerializedCause => {
  if (Cause.isCause(cause)) {
    const squashed = Cause.squash(cause);
    const serialized = serializeCauseValue(squashed);
    return {
      ...serialized,
      type: "EffectCause",
      pretty: Cause.pretty(cause),
    };
  }
  if (cause instanceof Error) {
    return {
      type: "Error",
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    };
  }
  if (typeof cause === "object" && cause !== null) {
    const record = asRecord(cause);
    const message = stringField(record, "message") ?? String(cause);
    const tag = stringField(record, "_tag");
    return {
      type: tag ?? "Object",
      message,
    };
  }
  return {
    type: typeof cause,
    message: String(cause),
  };
};

export const serializeSyncRecordError = (
  error: SyncRecordError,
): SerializedSyncRecordError => ({
  resource: error.resource,
  key: error.key,
  stage: error.stage,
  message: error.message,
  cause: serializeCauseValue(error.cause),
});
const mapSinkError = (operation: string) => (cause: unknown) =>
  new DdfDatabaseSinkError({ operation, cause });

export type DdfDatabaseSyncSink = PropertySyncSink &
  MemberSyncSink &
  OfficeSyncSink &
  OpenHouseSyncSink & {
    readonly recordSyncError: (
      error: SyncRecordError,
    ) => Effect.Effect<void, DdfDatabaseSinkError>;
  };

export const makeDdfDatabaseSyncSink = Effect.fn("DdfDatabaseSyncSink.make")(
  function* (options?: { readonly runId?: string }) {
    const { db } = yield* DdfDatabase;
    const sink: DdfDatabaseSyncSink = {
      upsertPropertyGraph: Effect.fn("DdfDatabaseSyncSink.upsertPropertyGraph")(
        function* (graph: PropertyGraph) {
          const propertyRow = propertyRowFromRecord(graph.property);
          const listingKey = yield* requireKey(
            "upsertPropertyGraph.property",
            propertyRow.listingKey,
          );
          yield* db.transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .insert(ddfProperties)
                .values({ ...propertyRow, listingKey })
                .onConflictDoUpdate({
                  target: ddfProperties.listingKey,
                  set: { ...propertyRow, listingKey, ...touchUpdatedAt },
                });
              yield* tx
                .delete(ddfPropertyRooms)
                .where(eq(ddfPropertyRooms.listingKey, listingKey));
              yield* tx
                .delete(ddfMedia)
                .where(
                  and(
                    eq(ddfMedia.resource, "Property"),
                    eq(ddfMedia.resourceKey, listingKey),
                  ),
                );
              yield* Effect.forEach(
                graph.rooms,
                (room) =>
                  Effect.gen(function* () {
                    const row = roomRowFromRecord(room, graph.property);
                    const roomListingKey = yield* requireKey(
                      "upsertPropertyGraph.roomListingKey",
                      row.listingKey,
                    );
                    const roomKey = yield* requireKey(
                      "upsertPropertyGraph.roomKey",
                      row.roomKey.length > 0 ? row.roomKey : null,
                    );
                    yield* tx
                      .insert(ddfPropertyRooms)
                      .values({ ...row, listingKey: roomListingKey, roomKey })
                      .onConflictDoUpdate({
                        target: [ddfPropertyRooms.listingKey, ddfPropertyRooms.roomKey],
                        set: { ...row, listingKey: roomListingKey, roomKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
              yield* Effect.forEach(
                graph.media,
                (media) =>
                  Effect.gen(function* () {
                    const row = mediaRowFromRecord(media, {
                      resource: "Property",
                      key: listingKey,
                    });
                    const mediaKey = yield* requireKey(
                      "upsertPropertyGraph.mediaKey",
                      row.mediaKey.length > 0 ? row.mediaKey : null,
                    );
                    yield* tx
                      .insert(ddfMedia)
                      .values({ ...row, mediaKey })
                      .onConflictDoUpdate({
                        target: [ddfMedia.resource, ddfMedia.resourceKey, ddfMedia.mediaKey],
                        set: { ...row, mediaKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
            }),
          ).pipe(Effect.mapError(mapSinkError("upsertPropertyGraph")));
        },
      ),
      upsertMemberWithMedia: Effect.fn("DdfDatabaseSyncSink.upsertMemberWithMedia")(
        function* (member, media) {
          const row = memberRowFromRecord(member);
          const memberKey = yield* requireKey("upsertMemberWithMedia", row.memberKey);
          yield* db.transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .insert(ddfMembers)
                .values({ ...row, memberKey })
                .onConflictDoUpdate({
                  target: ddfMembers.memberKey,
                  set: { ...row, memberKey, ...touchUpdatedAt },
                });
              yield* tx
                .delete(ddfMedia)
                .where(
                  and(eq(ddfMedia.resource, "Member"), eq(ddfMedia.resourceKey, memberKey)),
                );
              yield* Effect.forEach(
                media,
                (mediaRecord) =>
                  Effect.gen(function* () {
                    const mediaRow = mediaRowFromRecord(mediaRecord, {
                      resource: "Member",
                      key: memberKey,
                    });
                    const mediaKey = yield* requireKey(
                      "upsertMemberWithMedia.mediaKey",
                      mediaRow.mediaKey.length > 0 ? mediaRow.mediaKey : null,
                    );
                    yield* tx
                      .insert(ddfMedia)
                      .values({ ...mediaRow, mediaKey })
                      .onConflictDoUpdate({
                        target: [ddfMedia.resource, ddfMedia.resourceKey, ddfMedia.mediaKey],
                        set: { ...mediaRow, mediaKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
            }),
          ).pipe(Effect.mapError(mapSinkError("upsertMemberWithMedia")));
        },
      ),
      upsertOfficeWithMedia: Effect.fn("DdfDatabaseSyncSink.upsertOfficeWithMedia")(
        function* (office, media) {
          const row = officeRowFromRecord(office);
          const officeKey = yield* requireKey("upsertOfficeWithMedia", row.officeKey);
          yield* db.transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .insert(ddfOffices)
                .values({ ...row, officeKey })
                .onConflictDoUpdate({
                  target: ddfOffices.officeKey,
                  set: { ...row, officeKey, ...touchUpdatedAt },
                });
              yield* tx
                .delete(ddfMedia)
                .where(
                  and(eq(ddfMedia.resource, "Office"), eq(ddfMedia.resourceKey, officeKey)),
                );
              yield* Effect.forEach(
                media,
                (mediaRecord) =>
                  Effect.gen(function* () {
                    const mediaRow = mediaRowFromRecord(mediaRecord, {
                      resource: "Office",
                      key: officeKey,
                    });
                    const mediaKey = yield* requireKey(
                      "upsertOfficeWithMedia.mediaKey",
                      mediaRow.mediaKey.length > 0 ? mediaRow.mediaKey : null,
                    );
                    yield* tx
                      .insert(ddfMedia)
                      .values({ ...mediaRow, mediaKey })
                      .onConflictDoUpdate({
                        target: [ddfMedia.resource, ddfMedia.resourceKey, ddfMedia.mediaKey],
                        set: { ...mediaRow, mediaKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
            }),
          ).pipe(Effect.mapError(mapSinkError("upsertOfficeWithMedia")));
        },
      ),
      upsertProperty: Effect.fn("DdfDatabaseSyncSink.upsertProperty")(
        function* (property) {
          const row = propertyRowFromRecord(property);
          const listingKey = yield* requireKey("upsertProperty", row.listingKey);
          yield* db
            .insert(ddfProperties)
            .values({ ...row, listingKey })
            .onConflictDoUpdate({
              target: ddfProperties.listingKey,
              set: { ...row, listingKey, ...touchUpdatedAt },
            })
            .pipe(Effect.mapError(mapSinkError("upsertProperty")));
        },
      ),
      upsertRoom: Effect.fn("DdfDatabaseSyncSink.upsertRoom")(function* (
        room,
        property,
      ) {
        const row = roomRowFromRecord(room, property);
        const listingKey = yield* requireKey(
          "upsertRoom.listingKey",
          row.listingKey,
        );
        const roomKey = yield* requireKey(
          "upsertRoom.roomKey",
          row.roomKey.length > 0 ? row.roomKey : null,
        );
        yield* db
          .insert(ddfPropertyRooms)
          .values({ ...row, listingKey, roomKey })
          .onConflictDoUpdate({
            target: [ddfPropertyRooms.listingKey, ddfPropertyRooms.roomKey],
            set: { ...row, listingKey, roomKey, ...touchUpdatedAt },
          })
          .pipe(Effect.mapError(mapSinkError("upsertRoom")));
      }),
      upsertMedia: Effect.fn("DdfDatabaseSyncSink.upsertMedia")(function* (
        media,
        owner,
      ) {
        const row = mediaRowFromRecord(media, owner);
        const mediaKey = yield* requireKey(
          "upsertMedia",
          row.mediaKey.length > 0 ? row.mediaKey : null,
        );
        yield* db
          .insert(ddfMedia)
          .values({ ...row, mediaKey })
          .onConflictDoUpdate({
            target: [ddfMedia.resource, ddfMedia.resourceKey, ddfMedia.mediaKey],
            set: { ...row, mediaKey, ...touchUpdatedAt },
          })
          .pipe(Effect.mapError(mapSinkError("upsertMedia")));
      }),
      upsertMember: Effect.fn("DdfDatabaseSyncSink.upsertMember")(function* (
        member,
      ) {
        const row = memberRowFromRecord(member);
        const memberKey = yield* requireKey("upsertMember", row.memberKey);
        yield* db
          .insert(ddfMembers)
          .values({ ...row, memberKey })
          .onConflictDoUpdate({
            target: ddfMembers.memberKey,
            set: { ...row, memberKey, ...touchUpdatedAt },
          })
          .pipe(Effect.mapError(mapSinkError("upsertMember")));
      }),
      upsertOffice: Effect.fn("DdfDatabaseSyncSink.upsertOffice")(function* (
        office,
      ) {
        const row = officeRowFromRecord(office);
        const officeKey = yield* requireKey("upsertOffice", row.officeKey);
        yield* db
          .insert(ddfOffices)
          .values({ ...row, officeKey })
          .onConflictDoUpdate({
            target: ddfOffices.officeKey,
            set: { ...row, officeKey, ...touchUpdatedAt },
          })
          .pipe(Effect.mapError(mapSinkError("upsertOffice")));
      }),
      upsertOpenHouse: Effect.fn("DdfDatabaseSyncSink.upsertOpenHouse")(
        function* (openHouse) {
          const row = openHouseRowFromRecord(openHouse);
          const openHouseKey = yield* requireKey(
            "upsertOpenHouse",
            row.openHouseKey,
          );
          yield* db
            .insert(ddfOpenHouses)
            .values({ ...row, openHouseKey })
            .onConflictDoUpdate({
              target: ddfOpenHouses.openHouseKey,
              set: { ...row, openHouseKey, ...touchUpdatedAt },
            })
            .pipe(Effect.mapError(mapSinkError("upsertOpenHouse")));
        },
      ),
      markMissingPropertiesInactive: Effect.fn(
        "DdfDatabaseSyncSink.markMissingPropertiesInactive",
      )(function* (keys) {
        if (keys.length === 0) return;
        yield* db
          .update(ddfProperties)
          .set({ active: false, ...touchUpdatedAt })
          .where(inArray(ddfProperties.listingKey, keys))
          .pipe(Effect.mapError(mapSinkError("markMissingPropertiesInactive")));
      }),
      markMissingMembersInactive: Effect.fn(
        "DdfDatabaseSyncSink.markMissingMembersInactive",
      )(function* (keys) {
        if (keys.length === 0) return;
        yield* db
          .update(ddfMembers)
          .set({ active: false, ...touchUpdatedAt })
          .where(inArray(ddfMembers.memberKey, keys))
          .pipe(Effect.mapError(mapSinkError("markMissingMembersInactive")));
      }),
      markMissingOfficesInactive: Effect.fn(
        "DdfDatabaseSyncSink.markMissingOfficesInactive",
      )(function* (keys) {
        if (keys.length === 0) return;
        yield* db
          .update(ddfOffices)
          .set({ active: false, ...touchUpdatedAt })
          .where(inArray(ddfOffices.officeKey, keys))
          .pipe(Effect.mapError(mapSinkError("markMissingOfficesInactive")));
      }),
      recordSyncError: Effect.fn("DdfDatabaseSyncSink.recordSyncError")(
        function* (error) {
          const id = [
            options?.runId ?? "adhoc",
            error.resource,
            error.key,
            error.stage,
            error.message,
          ].join(":");
          const serialized = serializeSyncRecordError(error);
          yield* db
            .insert(ddfSyncErrors)
            .values({
              id,
              runId: options?.runId ?? null,
              resource: serialized.resource,
              recordKey: serialized.key,
              stage: serialized.stage,
              message: serialized.message,
              cause: serialized.cause,
            })
            .onConflictDoUpdate({
              target: ddfSyncErrors.id,
              set: { message: serialized.message, cause: serialized.cause },
            })
            .pipe(Effect.mapError(mapSinkError("recordSyncError")));
        },
      ),
    };
    return sink;
  },
);
