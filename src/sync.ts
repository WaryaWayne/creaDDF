import {
  Cause,
  Data,
  DateTime,
  Effect,
  Exit,
  Metric,
  Option,
  Schema,
} from "effect";
import type { Success as EffectSuccess } from "effect/Effect";
import { DdfHttp } from "./client";
import type { DdfHttpError } from "./client";
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
import { OpenHouseResponseSchema, OpenHouseSchema } from "./schema/openHouse";
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
import {
  ddfSyncFailedCount,
  ddfSyncHydratedCount,
  ddfSyncPersistedCount,
} from "./metrics";
import { DdfWatermarkStore } from "./watermark";

type SelectQuery = { readonly select?: ReadonlyArray<string> };

const hasSelect = (query?: SelectQuery) =>
  query?.select !== undefined && query.select.length > 0;

const partialStruct = <Fields extends Schema.Struct.Fields>(
  schema: Schema.Struct<Fields>,
) =>
  schema.mapFields(
    (fields) =>
      Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [
          key,
          Schema.optionalKey(field as Schema.Top),
        ]),
      ) as { readonly [Key in keyof Fields]: Schema.optionalKey<Fields[Key]> },
  );

const selectedOpenHouseResponseSchema = Schema.Struct({
  "@odata.context": Schema.optionalKey(Schema.NullOr(Schema.String)),
  "@odata.count": Schema.optionalKey(Schema.Number),
  "@odata.nextLink": Schema.optionalKey(Schema.NullOr(Schema.String)),
  value: Schema.Array(
    Schema.Struct({
      "@odata.context": Schema.optionalKey(Schema.NullOr(Schema.String)),
      ...partialStruct(OpenHouseSchema).fields,
    }),
  ),
});

const openHousePageSchema = (query?: SelectQuery) =>
  hasSelect(query) ? selectedOpenHouseResponseSchema : OpenHouseResponseSchema;

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

export interface SyncResult<Identifier = unknown> {
  readonly resource: SyncResource;
  readonly identifiers: ReadonlyArray<Identifier>;
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
  readonly upsertPropertyGraph?: (
    graph: PropertyGraph,
  ) => Effect.Effect<void, unknown>;
  readonly upsertProperty?: (
    property: PropertyRecord,
  ) => Effect.Effect<void, unknown>;
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
  readonly upsertMemberWithMedia?: (
    member: MemberRecord,
    media: ReadonlyArray<MediaRecord>,
  ) => Effect.Effect<void, unknown>;
  readonly upsertMember?: (
    member: MemberRecord,
  ) => Effect.Effect<void, unknown>;
  readonly upsertMedia?: (
    media: MediaRecord,
    owner: SyncOwner,
  ) => Effect.Effect<void, unknown>;
  readonly saveWatermark?: (
    resource: "Member",
    watermark: string,
  ) => Effect.Effect<void, unknown>;
  readonly markMissingMembersInactive?: (
    keys: ReadonlyArray<string>,
  ) => Effect.Effect<void, unknown>;
}

export interface OfficeSyncSink {
  readonly upsertOfficeWithMedia?: (
    office: OfficeRecord,
    media: ReadonlyArray<MediaRecord>,
  ) => Effect.Effect<void, unknown>;
  readonly upsertOffice?: (
    office: OfficeRecord,
  ) => Effect.Effect<void, unknown>;
  readonly upsertMedia?: (
    media: MediaRecord,
    owner: SyncOwner,
  ) => Effect.Effect<void, unknown>;
  readonly saveWatermark?: (
    resource: "Office",
    watermark: string,
  ) => Effect.Effect<void, unknown>;
  readonly markMissingOfficesInactive?: (
    keys: ReadonlyArray<string>,
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
}

export interface MasterListDiff {
  readonly localKeys: ReadonlyArray<string>;
  readonly masterKeys: ReadonlyArray<string>;
  readonly missingLocalKeys: ReadonlyArray<string>;
  readonly newMasterKeys: ReadonlyArray<string>;
}

const boundedConcurrency = (concurrency: number | undefined) =>
  Math.max(1, Math.floor(concurrency ?? 5));

const progressLogInterval = (total: number) => {
  if (total >= 1_000) return 250;
  if (total >= 100) return 50;
  if (total >= 20) return 10;
  return 0;
};

const hydrationBatchSize = (concurrency: number) =>
  Math.max(concurrency, concurrency * 10);

function* batched<Item>(
  items: ReadonlyArray<Item>,
  size: number,
): Iterable<ReadonlyArray<Item>> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}

const shouldLogProgress = (
  completed: number,
  total: number,
  interval: number,
) =>
  total > 0 &&
  (completed === total || (interval > 0 && completed % interval === 0));

const shouldLogPageProgress = (pageCount: number, hasNextPage: boolean) =>
  pageCount === 1 || pageCount % 10 === 0 || !hasNextPage;

const queryLogDetails = (query?: {
  readonly filter?: string;
  readonly select?: ReadonlyArray<string>;
  readonly top?: number;
  readonly count?: boolean;
}) => ({
  hasFilter: query?.filter !== undefined,
  selectFields: query?.select?.length ?? 0,
  top: query?.top ?? null,
  count: query?.count ?? null,
});

const baseSyncLogDetails = (
  options: BaseSyncOptions | undefined,
  concurrency: number,
  query: BaseSyncOptions["query"],
) => ({
  mode: options?.mode ?? "initial",
  since: options?.since ?? null,
  destinationId: options?.destinationId ?? null,
  concurrency,
  ...queryLogDetails(query),
});

const countsLogDetails = (counts: SyncCounts, nextWatermark: string | null) => ({
  identifiers: counts.identifiers,
  hydrated: counts.hydrated,
  persisted: counts.persisted,
  failed: counts.failed,
  nextWatermark,
});

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
    if (watermark === null) continue;

    const millis = Date.parse(watermark);
    if (Number.isFinite(millis) && millis >= highestMillis) {
      highest = watermark;
      highestMillis = millis;
    }
  }

  return highest;
};

const safeHighestWatermark = (
  successfulTimestamps: ReadonlyArray<unknown>,
  failedTimestamps: ReadonlyArray<unknown>,
) => {
  if (failedTimestamps.length === 0)
    return highestWatermark(successfulTimestamps);

  let earliestFailedMillis = Number.POSITIVE_INFINITY;
  for (const timestamp of failedTimestamps) {
    const watermark = timestampToWatermark(timestamp);
    if (watermark === null) return null;

    const millis = Date.parse(watermark);
    if (!Number.isFinite(millis)) return null;
    earliestFailedMillis = Math.min(earliestFailedMillis, millis);
  }

  return highestWatermark(
    successfulTimestamps.filter((timestamp) => {
      const watermark = timestampToWatermark(timestamp);
      if (watermark === null) return false;

      const millis = Date.parse(watermark);
      return Number.isFinite(millis) && millis < earliestFailedMillis;
    }),
  );
};

const incrementalQuery = (options: BaseSyncOptions | undefined) => {
  const query = options?.query ?? {};
  if (options?.mode !== "incremental" || options.since === undefined) return query;

  const sinceFilter = `ModificationTimestamp gt ${options.since}`;
  return {
    ...query,
    filter: query.filter !== undefined ? `(${query.filter}) and ${sinceFilter}` : sinceFilter,
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

    while (next !== null) {
      const page = yield* http.requestJson(next, undefined, schema);
      out.push(...page.value);
      next = page["@odata.nextLink"] ?? null;
    }

    return out;
  },
);

const collectPagedIdentifiersWithErrors = Effect.fn(
  "DdfSync.collectPagedIdentifiersWithErrors",
)(function* <Identifier>(
  resource: SyncResource,
  first: ODataListEnvelope<Identifier>,
  schema: Schema.Decoder<ODataListEnvelope<Identifier>, never>,
) {
  const http = yield* DdfHttp;
  const identifiers: Array<Identifier> = [...first.value];
  const errors: Array<SyncRecordError> = [];
  let next = first["@odata.nextLink"] ?? null;
  let pageCount = 1;

  yield* Effect.logInfo(`${resource} sync: collected identifier page`, {
    pages: pageCount,
    identifiers: identifiers.length,
    pageSize: first.value.length,
    hasNextPage: next !== null,
  });

  while (next !== null) {
    const pageKey = `page:${next}`;
    const pageExit = yield* Effect.exit(
      http.requestJson(next, undefined, schema),
    );
    if (Exit.isFailure(pageExit)) {
      yield* Effect.logWarning(`${resource} sync: failed to collect identifier page`, {
        nextPage: pageCount + 1,
        identifiers: identifiers.length,
      });
      errors.push(
        makeRecordError(resource, pageKey, "hydrate", pageExit.cause),
      );
      break;
    }
    pageCount += 1;
    const pageSize = pageExit.value.value.length;
    identifiers.push(...pageExit.value.value);
    next = pageExit.value["@odata.nextLink"] ?? null;
    if (shouldLogPageProgress(pageCount, next !== null)) {
      yield* Effect.logInfo(`${resource} sync: collected identifier page`, {
        pages: pageCount,
        identifiers: identifiers.length,
        pageSize,
        hasNextPage: next !== null,
      });
    }
  }

  return { identifiers, errors };
});

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
  hydrate: (key: string) => Effect.Effect<Record, DdfHttpError, DdfHttp>,
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
  hydrated: number,
  persisted: number,
  errors: ReadonlyArray<SyncRecordError>,
): SyncCounts => ({
  identifiers,
  hydrated,
  persisted,
  failed: errors.length,
});

const saveWatermarkToService = Effect.fn("DdfSync.saveWatermarkToService")(
  function* (resource: SyncResource, watermark: string) {
    const store = yield* Effect.serviceOption(DdfWatermarkStore);
    if (Option.isSome(store)) yield* store.value.save(resource, watermark);
  },
);

const trackSyncMetrics = (counts: SyncCounts) =>
  Effect.all(
    [
      Metric.update(ddfSyncHydratedCount, counts.hydrated),
      Metric.update(ddfSyncPersistedCount, counts.persisted),
      Metric.update(ddfSyncFailedCount, counts.failed),
    ],
    { discard: true },
  );

export const syncProperties = Effect.fn("DdfPropertySync.syncProperties")(
  function* (options?: PropertySyncOptions) {
    const concurrency = boundedConcurrency(options?.concurrency);
    const query = incrementalQuery(options);
    yield* Effect.logInfo(
      "Property sync: requesting replication identifiers",
      baseSyncLogDetails(options, concurrency, query),
    );
    const first =
      options?.destinationId === undefined
        ? yield* replicateProperties(query)
        : yield* replicatePropertiesForDestination(
            options.destinationId,
            query,
          );
    const collected = yield* collectPagedIdentifiersWithErrors(
      "Property",
      first,
      PropertyReplicationIdentifierResponseSchema,
    );
    const identifiers = collected.identifiers;
    yield* Effect.logInfo("Property sync: collected identifiers", {
      identifiers: identifiers.length,
      pageErrors: collected.errors.length,
    });
    const batchSize = hydrationBatchSize(concurrency);
    yield* Effect.logInfo("Property sync: hydrating records", {
      identifiers: identifiers.length,
      concurrency,
      batchSize,
    });
    const hydrateProgressEvery = progressLogInterval(identifiers.length);
    let hydratedRecords = 0;

    let hydratedSuccessRecords = 0;
    const errors: Array<SyncRecordError> = [...collected.errors];
    const successfulWatermarks: Array<unknown> = [];
    const failedWatermarks: Array<unknown> =
      collected.errors.length > 0 ? [null] : [];
    let persistedRecords = 0;
    const hasRecordSink =
      options?.sink?.upsertPropertyGraph !== undefined ||
      options?.sink?.upsertProperty !== undefined ||
      options?.sink?.upsertRoom !== undefined ||
      options?.sink?.upsertMedia !== undefined;

    yield* Effect.logInfo("Property sync: normalizing and persisting records", {
      identifiers: identifiers.length,
      batchSize,
    });
    const persistProgressEvery = progressLogInterval(identifiers.length);
    let processedRecords = 0;
    const logPersistProgress = (completed: number) =>
      shouldLogProgress(completed, identifiers.length, persistProgressEvery)
        ? Effect.logInfo("Property sync: persist progress", {
            completed,
            total: identifiers.length,
            persisted: persistedRecords,
            failed: errors.length,
          })
        : Effect.void;

    for (const batch of batched(identifiers, batchSize)) {
      const hydrated = yield* Effect.forEach(
        batch,
        (identifier) =>
          Effect.gen(function* () {
            const result = yield* hydrateOne(
              "Property",
              identifier.ListingKey,
              (key) => getProperty(key),
            );
            hydratedRecords += 1;
            if (
              shouldLogProgress(
                hydratedRecords,
                identifiers.length,
                hydrateProgressEvery,
              )
            ) {
              yield* Effect.logInfo("Property sync: hydrate progress", {
                completed: hydratedRecords,
                total: identifiers.length,
              });
            }
            return { identifier, result };
          }),
        { concurrency },
      );

      for (const { identifier, result } of hydrated) {
        processedRecords += 1;
        if (result.error !== null) {
          errors.push(result.error);
          failedWatermarks.push(identifier.ModificationTimestamp);
          yield* logPersistProgress(processedRecords);
          continue;
        }
        if (result.record === null) {
          yield* logPersistProgress(processedRecords);
          continue;
        }

        const graph: PropertyGraph = yield* normalizePropertyGraph(
          result.record,
        );
        hydratedSuccessRecords += 1;

        const propertyKey = String(graph.property.ListingKey ?? "");
        const persist = Effect.gen(function* () {
          if (options?.sink?.upsertPropertyGraph !== undefined) {
            yield* options.sink.upsertPropertyGraph(graph);
            return;
          }
          if (options?.sink?.upsertProperty !== undefined) {
            yield* options.sink.upsertProperty(graph.property);
          }
          if (options?.sink?.upsertRoom !== undefined) {
            yield* Effect.forEach(
              graph.rooms,
              (room) =>
                options.sink?.upsertRoom?.(room, graph.property) ?? Effect.void,
              { discard: true },
            );
          }
          if (options?.sink?.upsertMedia !== undefined) {
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
        if (persistError !== null) {
          errors.push(persistError);
          failedWatermarks.push(identifier.ModificationTimestamp);
        } else {
          if (hasRecordSink) persistedRecords += 1;
          successfulWatermarks.push(identifier.ModificationTimestamp);
        }
        yield* logPersistProgress(processedRecords);
      }
    }

    const nextWatermark = safeHighestWatermark(
      successfulWatermarks,
      failedWatermarks,
    );
    if (nextWatermark !== null) {
      yield* saveWatermarkToService("Property", nextWatermark);
      if (options?.sink?.saveWatermark !== undefined) {
        const persistError = yield* runPersist(
          "Property",
          "watermark",
          options.sink.saveWatermark("Property", nextWatermark),
        );
        if (persistError !== null) errors.push(persistError);
      }
    }

    const counts = syncCounts(
      identifiers.length,
      hydratedSuccessRecords,
      persistedRecords,
      errors,
    );
    yield* trackSyncMetrics(counts);
    yield* Effect.logInfo(
      "Property sync: complete",
      countsLogDetails(counts, nextWatermark),
    );

    return {
      resource: "Property",
      identifiers,
      errors,
      counts,
      nextWatermark,
    };
  },
);

export const syncMembers = Effect.fn("DdfMemberSync.syncMembers")(function* (
  options?: MemberSyncOptions,
) {
  const concurrency = boundedConcurrency(options?.concurrency);
  const query = incrementalQuery(options);
  yield* Effect.logInfo(
    "Member sync: requesting replication identifiers",
    baseSyncLogDetails(options, concurrency, query),
  );
  const first =
    options?.destinationId === undefined
      ? yield* replicateMembers(query)
      : yield* replicateMembersForDestination(
          options.destinationId,
          query,
        );
  const collected = yield* collectPagedIdentifiersWithErrors(
    "Member",
    first,
    MemberReplicationIdentifierResponseSchema,
  );
  const identifiers = collected.identifiers;
  yield* Effect.logInfo("Member sync: collected identifiers", {
    identifiers: identifiers.length,
    pageErrors: collected.errors.length,
  });
  const batchSize = hydrationBatchSize(concurrency);
  yield* Effect.logInfo("Member sync: hydrating records", {
    identifiers: identifiers.length,
    concurrency,
    batchSize,
  });
  const hydrateProgressEvery = progressLogInterval(identifiers.length);
  let hydratedRecords = 0;
  let hydratedSuccessRecords = 0;
  const errors: Array<SyncRecordError> = [...collected.errors];
  const successfulWatermarks: Array<unknown> = [];
  const failedWatermarks: Array<unknown> =
    collected.errors.length > 0 ? [null] : [];
  let persistedRecords = 0;
  const hasRecordSink =
    options?.sink?.upsertMemberWithMedia !== undefined ||
    options?.sink?.upsertMember !== undefined ||
    options?.sink?.upsertMedia !== undefined;

  yield* Effect.logInfo("Member sync: normalizing and persisting records", {
    identifiers: identifiers.length,
    batchSize,
  });
  const persistProgressEvery = progressLogInterval(identifiers.length);
  let processedRecords = 0;
  const logPersistProgress = (completed: number) =>
    shouldLogProgress(completed, identifiers.length, persistProgressEvery)
      ? Effect.logInfo("Member sync: persist progress", {
          completed,
          total: identifiers.length,
          persisted: persistedRecords,
          failed: errors.length,
        })
      : Effect.void;

  for (const batch of batched(identifiers, batchSize)) {
    const hydrated = yield* Effect.forEach(
      batch,
      (identifier) =>
        Effect.gen(function* () {
          const result = yield* hydrateOne(
            "Member",
            identifier.MemberKey,
            getMember,
          );
          hydratedRecords += 1;
          if (
            shouldLogProgress(
              hydratedRecords,
              identifiers.length,
              hydrateProgressEvery,
            )
          ) {
            yield* Effect.logInfo("Member sync: hydrate progress", {
              completed: hydratedRecords,
              total: identifiers.length,
            });
          }
          return { identifier, result };
        }),
      { concurrency },
    );

    for (const { identifier, result } of hydrated) {
      processedRecords += 1;
      if (result.error !== null) {
        errors.push(result.error);
        failedWatermarks.push(identifier.ModificationTimestamp);
        yield* logPersistProgress(processedRecords);
        continue;
      }
      if (result.record === null) {
        yield* logPersistProgress(processedRecords);
        continue;
      }
      const memberKey = String(result.record.MemberKey ?? "");
      const memberMedia = (
        Array.isArray((result.record as Record<string, unknown>).Media)
          ? ((result.record as Record<string, unknown>).Media as MediaType)
          : []
      ).map((media) => normalizeMedia("Member", memberKey, media));
      hydratedSuccessRecords += 1;
      const persist = Effect.gen(function* () {
        if (options?.sink?.upsertMemberWithMedia !== undefined) {
          yield* options.sink.upsertMemberWithMedia(
            result.record,
            memberMedia,
          );
          return;
        }
        if (options?.sink?.upsertMember !== undefined)
          yield* options.sink.upsertMember(result.record);
        if (options?.sink?.upsertMedia !== undefined) {
          yield* Effect.forEach(
            memberMedia,
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
      if (persistError !== null) {
        errors.push(persistError);
        failedWatermarks.push(identifier.ModificationTimestamp);
      } else {
        if (hasRecordSink) persistedRecords += 1;
        successfulWatermarks.push(identifier.ModificationTimestamp);
      }
      yield* logPersistProgress(processedRecords);
    }
  }

  const nextWatermark = safeHighestWatermark(
    successfulWatermarks,
    failedWatermarks,
  );
  if (nextWatermark !== null) {
    yield* saveWatermarkToService("Member", nextWatermark);
    if (options?.sink?.saveWatermark !== undefined) {
      const persistError = yield* runPersist(
        "Member",
        "watermark",
        options.sink.saveWatermark("Member", nextWatermark),
      );
      if (persistError !== null) errors.push(persistError);
    }
  }

  const counts = syncCounts(
    identifiers.length,
    hydratedSuccessRecords,
    persistedRecords,
    errors,
  );
  yield* trackSyncMetrics(counts);
  yield* Effect.logInfo(
    "Member sync: complete",
    countsLogDetails(counts, nextWatermark),
  );

  return {
    resource: "Member",
    identifiers,
    errors,
    counts,
    nextWatermark,
  };
});

export const syncOffices = Effect.fn("DdfOfficeSync.syncOffices")(function* (
  options?: OfficeSyncOptions,
) {
  const concurrency = boundedConcurrency(options?.concurrency);
  const query = incrementalQuery(options);
  yield* Effect.logInfo(
    "Office sync: requesting replication identifiers",
    baseSyncLogDetails(options, concurrency, query),
  );
  const first =
    options?.destinationId === undefined
      ? yield* replicateOffices(query)
      : yield* replicateOfficesForDestination(
          options.destinationId,
          query,
        );
  const collected = yield* collectPagedIdentifiersWithErrors(
    "Office",
    first,
    OfficeReplicationIdentifierResponseSchema,
  );
  const identifiers = collected.identifiers;
  yield* Effect.logInfo("Office sync: collected identifiers", {
    identifiers: identifiers.length,
    pageErrors: collected.errors.length,
  });
  const batchSize = hydrationBatchSize(concurrency);
  yield* Effect.logInfo("Office sync: hydrating records", {
    identifiers: identifiers.length,
    concurrency,
    batchSize,
  });
  const hydrateProgressEvery = progressLogInterval(identifiers.length);
  let hydratedRecords = 0;
  let hydratedSuccessRecords = 0;
  const errors: Array<SyncRecordError> = [...collected.errors];
  const successfulWatermarks: Array<unknown> = [];
  const failedWatermarks: Array<unknown> =
    collected.errors.length > 0 ? [null] : [];
  let persistedRecords = 0;
  const hasRecordSink =
    options?.sink?.upsertOfficeWithMedia !== undefined ||
    options?.sink?.upsertOffice !== undefined ||
    options?.sink?.upsertMedia !== undefined;

  yield* Effect.logInfo("Office sync: normalizing and persisting records", {
    identifiers: identifiers.length,
    batchSize,
  });
  const persistProgressEvery = progressLogInterval(identifiers.length);
  let processedRecords = 0;
  const logPersistProgress = (completed: number) =>
    shouldLogProgress(completed, identifiers.length, persistProgressEvery)
      ? Effect.logInfo("Office sync: persist progress", {
          completed,
          total: identifiers.length,
          persisted: persistedRecords,
          failed: errors.length,
        })
      : Effect.void;

  for (const batch of batched(identifiers, batchSize)) {
    const hydrated = yield* Effect.forEach(
      batch,
      (identifier) =>
        Effect.gen(function* () {
          const result = yield* hydrateOne(
            "Office",
            identifier.OfficeKey,
            getOffice,
          );
          hydratedRecords += 1;
          if (
            shouldLogProgress(
              hydratedRecords,
              identifiers.length,
              hydrateProgressEvery,
            )
          ) {
            yield* Effect.logInfo("Office sync: hydrate progress", {
              completed: hydratedRecords,
              total: identifiers.length,
            });
          }
          return { identifier, result };
        }),
      { concurrency },
    );

    for (const { identifier, result } of hydrated) {
      processedRecords += 1;
      if (result.error !== null) {
        errors.push(result.error);
        failedWatermarks.push(identifier.ModificationTimestamp);
        yield* logPersistProgress(processedRecords);
        continue;
      }
      if (result.record === null) {
        yield* logPersistProgress(processedRecords);
        continue;
      }
      const office = result.record as Record<string, unknown>;
      const officeKey = String(office.OfficeKey ?? "");
      const officeMedia = (
        Array.isArray(office.Media) ? (office.Media as MediaType) : []
      ).map((media) => normalizeMedia("Office", officeKey, media));
      hydratedSuccessRecords += 1;
      const persist = Effect.gen(function* () {
        if (options?.sink?.upsertOfficeWithMedia !== undefined) {
          yield* options.sink.upsertOfficeWithMedia(
            result.record,
            officeMedia,
          );
          return;
        }
        if (options?.sink?.upsertOffice !== undefined)
          yield* options.sink.upsertOffice(result.record);
        if (options?.sink?.upsertMedia !== undefined) {
          yield* Effect.forEach(
            officeMedia,
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
      if (persistError !== null) {
        errors.push(persistError);
        failedWatermarks.push(identifier.ModificationTimestamp);
      } else {
        if (hasRecordSink) persistedRecords += 1;
        successfulWatermarks.push(identifier.ModificationTimestamp);
      }
      yield* logPersistProgress(processedRecords);
    }
  }

  const nextWatermark = safeHighestWatermark(
    successfulWatermarks,
    failedWatermarks,
  );
  if (nextWatermark !== null) {
    yield* saveWatermarkToService("Office", nextWatermark);
    if (options?.sink?.saveWatermark !== undefined) {
      const persistError = yield* runPersist(
        "Office",
        "watermark",
        options.sink.saveWatermark("Office", nextWatermark),
      );
      if (persistError !== null) errors.push(persistError);
    }
  }

  const counts = syncCounts(
    identifiers.length,
    hydratedSuccessRecords,
    persistedRecords,
    errors,
  );
  yield* trackSyncMetrics(counts);
  yield* Effect.logInfo(
    "Office sync: complete",
    countsLogDetails(counts, nextWatermark),
  );

  return {
    resource: "Office",
    identifiers,
    errors,
    counts,
    nextWatermark,
  };
});

export const syncOpenHouses = Effect.fn("DdfOpenHouseSync.syncOpenHouses")(
  function* (options?: OpenHouseSyncOptions) {
    const concurrency = boundedConcurrency(options?.concurrency);
    yield* Effect.logInfo("OpenHouse sync: collecting and persisting pages", {
      concurrency,
      ...queryLogDetails(options?.query),
    });

    const errors: Array<SyncRecordError> = [];
    let hydratedRecords = 0;
    let persistedRecords = 0;
    let processedRecords = 0;
    let pageCount = 0;

    const logPersistProgress = (pageSize: number, hasNextPage: boolean) =>
      shouldLogPageProgress(pageCount, hasNextPage)
        ? Effect.logInfo("OpenHouse sync: persist progress", {
            pages: pageCount,
            processed: processedRecords,
            pageSize,
            persisted: persistedRecords,
            failed: errors.length,
            hasNextPage,
          })
        : Effect.void;

    const persistPage = (records: ReadonlyArray<OpenHouseRecord>) =>
      Effect.forEach(
        records,
        (openHouse) =>
          Effect.gen(function* () {
            hydratedRecords += 1;
            const key = String(openHouse.OpenHouseKey ?? "");
            if (options?.sink?.upsertOpenHouse === undefined) {
              processedRecords += 1;
              return;
            }
            const persistError = yield* runPersist(
              "OpenHouse",
              key,
              options.sink.upsertOpenHouse(openHouse),
            );
            if (persistError !== null) {
              errors.push(persistError);
            } else {
              persistedRecords += 1;
            }
            processedRecords += 1;
          }),
        { concurrency, discard: true },
      );

    const firstExit = yield* Effect.exit(listOpenHouses(options?.query));
    if (Exit.isFailure(firstExit)) {
      yield* Effect.logWarning("OpenHouse sync: failed to collect first page");
      errors.push(
        makeRecordError("OpenHouse", "page:first", "hydrate", firstExit.cause),
      );
    } else {
      const http = yield* DdfHttp;
      let page = firstExit.value;
      let next: string | null = null;
      while (true) {
        pageCount += 1;
        next = page["@odata.nextLink"] ?? null;
        yield* Effect.logInfo("OpenHouse sync: collected page", {
          pages: pageCount,
          records: processedRecords + page.value.length,
          pageSize: page.value.length,
          hasNextPage: next !== null,
        });
        yield* persistPage(page.value);
        yield* logPersistProgress(page.value.length, next !== null);

        if (next === null) break;

        const pageKey = `page:${next}`;
        const pageExit = yield* Effect.exit(
          http.requestJson<typeof firstExit.value>(
            next,
            undefined,
            openHousePageSchema(options?.query) as Schema.Decoder<
              typeof firstExit.value,
              never
            >,
          ),
        );
        if (Exit.isFailure(pageExit)) {
          yield* Effect.logWarning("OpenHouse sync: failed to collect page", {
            nextPage: pageCount + 1,
            records: processedRecords,
          });
          errors.push(
            makeRecordError("OpenHouse", pageKey, "hydrate", pageExit.cause),
          );
          break;
        }
        page = pageExit.value;
      }
    }

    const nextWatermark: string | null = null;

    const counts = syncCounts(0, hydratedRecords, persistedRecords, errors);
    yield* trackSyncMetrics(counts);
    yield* Effect.logInfo(
      "OpenHouse sync: complete",
      countsLogDetails(counts, nextWatermark),
    );

    return {
      resource: "OpenHouse",
      identifiers: [],
      errors,
      counts,
      nextWatermark,
    };
  },
);

export const getPropertyMasterList = Effect.fn(
  "DdfPropertySync.getPropertyMasterList",
)(function* (options?: Pick<PropertySyncOptions, "destinationId" | "query">) {
  const first =
    options?.destinationId === undefined
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
    options?.sink?.markMissingPropertiesInactive !== undefined
  ) {
    yield* options.sink.markMissingPropertiesInactive(diff.missingLocalKeys);
  }

  return diff;
});

export const getMemberMasterList = Effect.fn(
  "DdfMemberSync.getMemberMasterList",
)(function* (options?: Pick<MemberSyncOptions, "destinationId" | "query">) {
  const first =
    options?.destinationId === undefined
      ? yield* replicateMembers(options?.query)
      : yield* replicateMembersForDestination(
          options.destinationId,
          options.query,
        );
  return yield* collectPagedIdentifiers(
    first,
    MemberReplicationIdentifierResponseSchema,
  );
});

export const getOfficeMasterList = Effect.fn(
  "DdfOfficeSync.getOfficeMasterList",
)(function* (options?: Pick<OfficeSyncOptions, "destinationId" | "query">) {
  const first =
    options?.destinationId === undefined
      ? yield* replicateOffices(options?.query)
      : yield* replicateOfficesForDestination(
          options.destinationId,
          options.query,
        );
  return yield* collectPagedIdentifiers(
    first,
    OfficeReplicationIdentifierResponseSchema,
  );
});

export const pruneMissingMembers = Effect.fn(
  "DdfMemberSync.pruneMissingMembers",
)(function* (
  localKeys: ReadonlyArray<string>,
  options?: Pick<MemberSyncOptions, "destinationId" | "query" | "sink">,
) {
  const masterList = yield* getMemberMasterList(options);
  const diff = diffLocalKeysAgainstMasterList(
    localKeys,
    masterList.map((identifier) => identifier.MemberKey),
  );

  if (
    diff.missingLocalKeys.length > 0 &&
    options?.sink?.markMissingMembersInactive !== undefined
  ) {
    yield* options.sink.markMissingMembersInactive(diff.missingLocalKeys);
  }

  return diff;
});

export const pruneMissingOffices = Effect.fn(
  "DdfOfficeSync.pruneMissingOffices",
)(function* (
  localKeys: ReadonlyArray<string>,
  options?: Pick<OfficeSyncOptions, "destinationId" | "query" | "sink">,
) {
  const masterList = yield* getOfficeMasterList(options);
  const diff = diffLocalKeysAgainstMasterList(
    localKeys,
    masterList.map((identifier) => identifier.OfficeKey),
  );

  if (
    diff.missingLocalKeys.length > 0 &&
    options?.sink?.markMissingOfficesInactive !== undefined
  ) {
    yield* options.sink.markMissingOfficesInactive(diff.missingLocalKeys);
  }

  return diff;
});
