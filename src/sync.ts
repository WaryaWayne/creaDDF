import { Cause, DateTime, Effect, Exit, Schema } from "effect";
import type { Success as EffectSuccess } from "effect/Effect";
import { DdfHttp } from "./client";
import type { DdfHttpApi } from "./client";
import {
  getMember,
  getOffice,
  getOpenHouse,
  getProperty,
  listOpenHouses,
  replicateMembers,
  replicateMembersForDestination,
  replicateOffices,
  replicateOfficesForDestination,
  replicateProperties,
  replicatePropertiesForDestination,
} from "./resources";
import {
  normalizeMedia,
  normalizePropertyGraph,
  normalizePropertyRooms,
} from "./normalizers";
import { OpenHouseResponseSchema } from "./schema/openHouse";
import type { MediaType } from "./schema/mediaSchema";
import type { RoomsType } from "./schema/roomsSchema";
import type {
  MemberReplicationIdentifier,
  ODataListEnvelope,
  OfficeReplicationIdentifier,
  PropertyReplicationIdentifier,
} from "./schema/odata";
import {
  MemberReplicationIdentifierResponseSchema,
  OfficeReplicationIdentifierResponseSchema,
  PropertyReplicationIdentifierResponseSchema,
} from "./schema/odata";
import type { ODataListQuery, ReplicationQuery } from "./types";

export const SyncModeSchema = Schema.Literals(["initial", "incremental"]);
export const SyncResourceSchema = Schema.Literals([
  "Property",
  "Member",
  "Office",
  "OpenHouse",
]);

export type SyncMode = typeof SyncModeSchema.Type;
export type SyncResource = typeof SyncResourceSchema.Type;
export type SyncStage = "hydrate" | "persist";
export type PropertyRecord = EffectSuccess<ReturnType<typeof getProperty>>;
export type MemberRecord = EffectSuccess<ReturnType<typeof getMember>>;
export type OfficeRecord = EffectSuccess<ReturnType<typeof getOffice>>;
export type OpenHouseRecord = EffectSuccess<ReturnType<typeof getOpenHouse>>;
export type RoomRecord = RoomsType[number];
export type MediaRecord = MediaType[number];

export interface SyncOwner {
  readonly resource: SyncResource;
  readonly key: string;
}

export interface PropertyGraph {
  readonly property: PropertyRecord;
  readonly rooms: ReadonlyArray<RoomRecord>;
  readonly media: ReadonlyArray<MediaRecord>;
}

export interface SyncRecordError {
  readonly resource: SyncResource;
  readonly key: string;
  readonly stage: SyncStage;
  readonly cause: unknown;
  readonly message: string;
}

export interface SyncCounts {
  readonly identifiers: number;
  readonly hydrated: number;
  readonly persisted: number;
  readonly failed: number;
}

export interface SyncResult<Record, Identifier = unknown> {
  readonly resource: SyncResource;
  readonly identifiers: ReadonlyArray<Identifier>;
  readonly records: ReadonlyArray<Record>;
  readonly errors: ReadonlyArray<SyncRecordError>;
  readonly counts: SyncCounts;
  readonly nextWatermark: string | null;
}

export interface BaseSyncOptions {
  readonly mode?: SyncMode;
  readonly since?: string;
  readonly destinationId?: number;
  readonly concurrency?: number;
  readonly query?: ReplicationQuery;
}

export interface PropertySyncSink {
  readonly upsertProperty?: (property: PropertyRecord) => Effect.Effect<void, unknown>;
  readonly upsertRoom?: (
    room: RoomRecord,
    property: PropertyRecord,
  ) => Effect.Effect<void, unknown>;
  readonly upsertMedia?: (
    media: MediaRecord,
    owner: SyncOwner,
  ) => Effect.Effect<void, unknown>;
  readonly saveWatermark?: (
    resource: "Property",
    watermark: string,
  ) => Effect.Effect<void, unknown>;
  readonly markMissingPropertiesInactive?: (
    keys: ReadonlyArray<string>,
  ) => Effect.Effect<void, unknown>;
}

export interface MemberSyncSink {
  readonly upsertMember?: (member: MemberRecord) => Effect.Effect<void, unknown>;
  readonly upsertMedia?: (
    media: MediaRecord,
    owner: SyncOwner,
  ) => Effect.Effect<void, unknown>;
  readonly saveWatermark?: (
    resource: "Member",
    watermark: string,
  ) => Effect.Effect<void, unknown>;
}

export interface OfficeSyncSink {
  readonly upsertOffice?: (office: OfficeRecord) => Effect.Effect<void, unknown>;
  readonly upsertMedia?: (
    media: MediaRecord,
    owner: SyncOwner,
  ) => Effect.Effect<void, unknown>;
  readonly saveWatermark?: (
    resource: "Office",
    watermark: string,
  ) => Effect.Effect<void, unknown>;
}

export interface OpenHouseSyncSink {
  readonly upsertOpenHouse?: (
    openHouse: OpenHouseRecord,
  ) => Effect.Effect<void, unknown>;
  readonly saveWatermark?: (
    resource: "OpenHouse",
    watermark: string,
  ) => Effect.Effect<void, unknown>;
}

export interface PropertySyncOptions extends BaseSyncOptions {
  readonly sink?: PropertySyncSink;
}

export interface MemberSyncOptions extends BaseSyncOptions {
  readonly sink?: MemberSyncSink;
}

export interface OfficeSyncOptions extends BaseSyncOptions {
  readonly sink?: OfficeSyncSink;
}

export interface OpenHouseSyncOptions {
  readonly query?: ODataListQuery;
  readonly concurrency?: number;
  readonly sink?: OpenHouseSyncSink;
  readonly watermarkField?: "OpenHouseDate";
}

export interface MasterListDiff {
  readonly localKeys: ReadonlyArray<string>;
  readonly masterKeys: ReadonlyArray<string>;
  readonly missingLocalKeys: ReadonlyArray<string>;
  readonly newMasterKeys: ReadonlyArray<string>;
}

const boundedConcurrency = (concurrency: number | undefined) =>
  Math.max(1, Math.floor(concurrency ?? 5));

const timestampToWatermark = (timestamp: unknown): string | null => {
  if (timestamp instanceof Date) return timestamp.toISOString();
  if (DateTime.isDateTime(timestamp)) return DateTime.formatIso(timestamp);
  return typeof timestamp === "string" && timestamp.length > 0
    ? timestamp
    : null;
};

const highestWatermark = (timestamps: ReadonlyArray<unknown>) => {
  let highest: string | null = null;
  let highestMillis = Number.NEGATIVE_INFINITY;

  for (const timestamp of timestamps) {
    const watermark = timestampToWatermark(timestamp);
    if (!watermark) continue;

    const millis = Date.parse(watermark);
    if (Number.isFinite(millis) && millis >= highestMillis) {
      highest = watermark;
      highestMillis = millis;
    }
  }

  return highest;
};

const incrementalQuery = (options: BaseSyncOptions | undefined) => {
  const query = options?.query ?? {};
  if (options?.mode !== "incremental" || !options.since) return query;

  const sinceFilter = `ModificationTimestamp gt ${options.since}`;
  return {
    ...query,
    filter: query.filter ? `(${query.filter}) and ${sinceFilter}` : sinceFilter,
  };
};

const causeMessage = (cause: unknown) =>
  Cause.isCause(cause)
    ? Cause.pretty(cause)
    : cause instanceof Error
      ? cause.message
      : String(cause);

const makeRecordError = (
  resource: SyncResource,
  key: string,
  stage: SyncStage,
  cause: unknown,
): SyncRecordError => ({
  resource,
  key,
  stage,
  cause,
  message: causeMessage(cause),
});

const collectPagedIdentifiers = Effect.fn("DdfSync.collectPagedIdentifiers")(
  function* <Identifier>(
    first: ODataListEnvelope<Identifier>,
    schema: Schema.Decoder<ODataListEnvelope<Identifier>, never>,
  ) {
    const http = yield* DdfHttp;
    const out: Array<Identifier> = [...first.value];
    let next = first["@odata.nextLink"] ?? null;

    while (next) {
      const page = yield* http.requestJson(next, undefined, schema);
      out.push(...page.value);
      next = page["@odata.nextLink"] ?? null;
    }

    return out;
  },
);

const collectOpenHousePages = Effect.fn("DdfOpenHouseSync.collectPages")(
  function* (query?: ODataListQuery) {
    const http = yield* DdfHttp;
    const first = yield* listOpenHouses(query);
    const out: Array<OpenHouseRecord> = [...first.value];
    let next = first["@odata.nextLink"] ?? null;

    while (next) {
      const page = yield* http.requestJson<typeof first>(
        next,
        undefined,
        OpenHouseResponseSchema,
      );
      out.push(...page.value);
      next = page["@odata.nextLink"] ?? null;
    }

    return out;
  },
);

const runPersist = Effect.fn("DdfSync.runPersist")(function* (
  resource: SyncResource,
  key: string,
  persist: Effect.Effect<void, unknown>,
) {
  const exit = yield* Effect.exit(persist);
  if (Exit.isSuccess(exit)) return null;
  return makeRecordError(resource, key, "persist", exit.cause);
});

const hydrateOne = Effect.fn("DdfSync.hydrateOne")(function* <Record>(
  resource: SyncResource,
  key: string,
  hydrate: (key: string) => Effect.Effect<Record, unknown, DdfHttpApi>,
) {
  const exit = yield* Effect.exit(hydrate(key));
  if (Exit.isSuccess(exit)) return { record: exit.value, error: null };
  return {
    record: null,
    error: makeRecordError(resource, key, "hydrate", exit.cause),
  };
});

const syncCounts = (
  identifiers: number,
  records: number,
  errors: ReadonlyArray<SyncRecordError>,
): SyncCounts => ({
  identifiers,
  hydrated: records,
  persisted: records - errors.filter((error) => error.stage === "persist").length,
  failed: errors.length,
});

export const syncProperties = Effect.fn("DdfPropertySync.syncProperties")(
  function* (
    options?: PropertySyncOptions,
  ) {
    const first = options?.destinationId === undefined
      ? yield* replicateProperties(incrementalQuery(options))
      : yield* replicatePropertiesForDestination(
          options.destinationId,
          incrementalQuery(options),
        );
    const identifiers = yield* collectPagedIdentifiers(
      first,
      PropertyReplicationIdentifierResponseSchema,
    );
    const hydrated = yield* Effect.forEach(
      identifiers,
      (identifier) =>
        hydrateOne("Property", identifier.ListingKey, (key) => getProperty(key)),
      { concurrency: boundedConcurrency(options?.concurrency) },
    );

    const records: Array<PropertyGraph> = [];
    const errors: Array<SyncRecordError> = [];

    for (const result of hydrated) {
      if (result.error) {
        errors.push(result.error);
        continue;
      }
      if (!result.record) continue;

      const graph = normalizePropertyGraph(result.record as Record<string, unknown>) as unknown as PropertyGraph;
      records.push(graph);

      const propertyKey = String(graph.property.ListingKey ?? "");
      const persist = Effect.gen(function* () {
        if (options?.sink?.upsertProperty) {
          yield* options.sink.upsertProperty(graph.property);
        }
        if (options?.sink?.upsertRoom) {
          yield* Effect.forEach(
            graph.rooms,
            (room) => options.sink?.upsertRoom?.(room, graph.property) ?? Effect.void,
            { discard: true },
          );
        }
        if (options?.sink?.upsertMedia) {
          yield* Effect.forEach(
            graph.media,
            (media) =>
              options.sink?.upsertMedia?.(media, {
                resource: "Property",
                key: propertyKey,
              }) ?? Effect.void,
            { discard: true },
          );
        }
      });
      const persistError = yield* runPersist("Property", propertyKey, persist);
      if (persistError) errors.push(persistError);
    }

    const nextWatermark = highestWatermark(
      identifiers.map((identifier) => identifier.ModificationTimestamp),
    );
    if (nextWatermark && options?.sink?.saveWatermark) {
      const persistError = yield* runPersist(
        "Property",
        "watermark",
        options.sink.saveWatermark("Property", nextWatermark),
      );
      if (persistError) errors.push(persistError);
    }

    return {
      resource: "Property",
      identifiers,
      records,
      errors,
      counts: syncCounts(identifiers.length, records.length, errors),
      nextWatermark,
    };
  },
);

export const syncMembers = Effect.fn("DdfMemberSync.syncMembers")(function* (
  options?: MemberSyncOptions,
) {
  const first = options?.destinationId === undefined
    ? yield* replicateMembers(incrementalQuery(options))
    : yield* replicateMembersForDestination(
        options.destinationId,
        incrementalQuery(options),
      );
  const identifiers = yield* collectPagedIdentifiers(
    first,
    MemberReplicationIdentifierResponseSchema,
  );
  const hydrated = yield* Effect.forEach(
    identifiers,
    (identifier) => hydrateOne("Member", identifier.MemberKey, getMember),
    { concurrency: boundedConcurrency(options?.concurrency) },
  );
  const records: Array<MemberRecord> = [];
  const errors: Array<SyncRecordError> = [];

  for (const result of hydrated) {
    if (result.error) {
      errors.push(result.error);
      continue;
    }
    if (!result.record) continue;
    records.push(result.record);
    const memberKey = String(result.record.MemberKey ?? "");
    const persist = Effect.gen(function* () {
      if (options?.sink?.upsertMember) yield* options.sink.upsertMember(result.record);
      if (options?.sink?.upsertMedia) {
        yield* Effect.forEach(
          (Array.isArray((result.record as Record<string, unknown>).Media)
            ? ((result.record as Record<string, unknown>).Media as MediaType)
            : []
          ).map((media) => normalizeMedia("Member", memberKey, media)),
          (media) =>
            options.sink?.upsertMedia?.(media, {
              resource: "Member",
              key: memberKey,
            }) ?? Effect.void,
          { discard: true },
        );
      }
    });
    const persistError = yield* runPersist("Member", memberKey, persist);
    if (persistError) errors.push(persistError);
  }

  const nextWatermark = highestWatermark(
    identifiers.map((identifier) => identifier.ModificationTimestamp),
  );
  if (nextWatermark && options?.sink?.saveWatermark) {
    const persistError = yield* runPersist(
      "Member",
      "watermark",
      options.sink.saveWatermark("Member", nextWatermark),
    );
    if (persistError) errors.push(persistError);
  }

  return {
    resource: "Member",
    identifiers,
    records,
    errors,
    counts: syncCounts(identifiers.length, records.length, errors),
    nextWatermark,
  };
});

export const syncOffices = Effect.fn("DdfOfficeSync.syncOffices")(function* (
  options?: OfficeSyncOptions,
) {
  const first = options?.destinationId === undefined
    ? yield* replicateOffices(incrementalQuery(options))
    : yield* replicateOfficesForDestination(
        options.destinationId,
        incrementalQuery(options),
      );
  const identifiers = yield* collectPagedIdentifiers(
    first,
    OfficeReplicationIdentifierResponseSchema,
  );
  const hydrated = yield* Effect.forEach(
    identifiers,
    (identifier) => hydrateOne("Office", identifier.OfficeKey, getOffice),
    { concurrency: boundedConcurrency(options?.concurrency) },
  );
  const records: Array<OfficeRecord> = [];
  const errors: Array<SyncRecordError> = [];

  for (const result of hydrated) {
    if (result.error) {
      errors.push(result.error);
      continue;
    }
    if (!result.record) continue;
    records.push(result.record);
    const office = result.record as Record<string, unknown>;
    const officeKey = String(office.OfficeKey ?? "");
    const persist = Effect.gen(function* () {
      if (options?.sink?.upsertOffice) yield* options.sink.upsertOffice(result.record);
      if (options?.sink?.upsertMedia) {
        yield* Effect.forEach(
          (Array.isArray(office.Media) ? (office.Media as MediaType) : []).map(
            (media) => normalizeMedia("Office", officeKey, media),
          ),
          (media) =>
            options.sink?.upsertMedia?.(media, {
              resource: "Office",
              key: officeKey,
            }) ?? Effect.void,
          { discard: true },
        );
      }
    });
    const persistError = yield* runPersist("Office", officeKey, persist);
    if (persistError) errors.push(persistError);
  }

  const nextWatermark = highestWatermark(
    identifiers.map((identifier) => identifier.ModificationTimestamp),
  );
  if (nextWatermark && options?.sink?.saveWatermark) {
    const persistError = yield* runPersist(
      "Office",
      "watermark",
      options.sink.saveWatermark("Office", nextWatermark),
    );
    if (persistError) errors.push(persistError);
  }

  return {
    resource: "Office",
    identifiers,
    records,
    errors,
    counts: syncCounts(identifiers.length, records.length, errors),
    nextWatermark,
  };
});

export const syncOpenHouses = Effect.fn("DdfOpenHouseSync.syncOpenHouses")(
  function* (
    options?: OpenHouseSyncOptions,
  ) {
    const records = yield* collectOpenHousePages(options?.query);
    const errors: Array<SyncRecordError> = [];

    yield* Effect.forEach(
      records,
      (openHouse) =>
        Effect.gen(function* () {
          const key = String(openHouse.OpenHouseKey ?? "");
          if (!options?.sink?.upsertOpenHouse) return;
          const persistError = yield* runPersist(
            "OpenHouse",
            key,
            options.sink.upsertOpenHouse(openHouse),
          );
          if (persistError) errors.push(persistError);
        }),
      { concurrency: boundedConcurrency(options?.concurrency), discard: true },
    );

    const watermarkField = options?.watermarkField ?? "OpenHouseDate";
    const nextWatermark = highestWatermark(
      records.map((record) => (record as Record<string, unknown>)[watermarkField]),
    );
    if (nextWatermark && options?.sink?.saveWatermark) {
      const persistError = yield* runPersist(
        "OpenHouse",
        "watermark",
        options.sink.saveWatermark("OpenHouse", nextWatermark),
      );
      if (persistError) errors.push(persistError);
    }

    return {
      resource: "OpenHouse",
      identifiers: [],
      records,
      errors,
      counts: syncCounts(records.length, records.length, errors),
      nextWatermark,
    };
  },
);

export const getPropertyMasterList = Effect.fn(
  "DdfPropertySync.getPropertyMasterList",
)(function* (options?: Pick<PropertySyncOptions, "destinationId" | "query">) {
  const first = options?.destinationId === undefined
    ? yield* replicateProperties(options?.query)
    : yield* replicatePropertiesForDestination(
        options.destinationId,
        options.query,
      );
  return yield* collectPagedIdentifiers(
    first,
    PropertyReplicationIdentifierResponseSchema,
  );
});

export const diffLocalKeysAgainstMasterList = (
  localKeys: ReadonlyArray<string>,
  masterKeys: ReadonlyArray<string>,
): MasterListDiff => {
  const local = new Set(localKeys);
  const master = new Set(masterKeys);

  return {
    localKeys,
    masterKeys,
    missingLocalKeys: localKeys.filter((key) => !master.has(key)),
    newMasterKeys: masterKeys.filter((key) => !local.has(key)),
  };
};

export const pruneMissingProperties = Effect.fn(
  "DdfPropertySync.pruneMissingProperties",
)(function* (
  localKeys: ReadonlyArray<string>,
  options?: Pick<PropertySyncOptions, "destinationId" | "query" | "sink">,
) {
  const masterList = yield* getPropertyMasterList(options);
  const diff = diffLocalKeysAgainstMasterList(
    localKeys,
    masterList.map((identifier) => identifier.ListingKey),
  );

  if (
    diff.missingLocalKeys.length > 0 &&
    options?.sink?.markMissingPropertiesInactive
  ) {
    yield* options.sink.markMissingPropertiesInactive(diff.missingLocalKeys);
  }

  return diff;
});
