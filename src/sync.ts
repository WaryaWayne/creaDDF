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
import { listSchemaForSelect } from "./schema/select";
import type { MediaType } from "./schema/mediaSchema";
import type { SocialMedia } from "./schema/officeSchema";
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
  ddfSyncSkippedCount,
} from "./metrics";
import { DdfWatermarkStore } from "./watermark";

export const SyncModeSchema = Schema.Literals(["initial", "incremental"]);
export const SyncResourceSchema = Schema.Literals([
  "Destination",
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


export class DdfReplicationIdentifierKeyError extends Data.TaggedError(
  "DdfReplicationIdentifierKeyError",
)<{
  readonly resource: SyncResource;
  readonly keyField: string;
  readonly page: string;
  readonly index: number;
}> {
  override get message() {
    return `${this.resource} replication identifier at ${this.page}[${this.index}] has a missing ${this.keyField}`;
  }
}

const replicationKeyField = (resource: "Property" | "Member" | "Office") => {
  switch (resource) {
    case "Property":
      return "ListingKey";
    case "Member":
      return "MemberKey";
    case "Office":
      return "OfficeKey";
  }
};

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const partitionReplicationIdentifiers = <Identifier>(
  resource: "Property" | "Member" | "Office",
  page: string,
  identifiers: ReadonlyArray<Identifier>,
) => {
  const keyField = replicationKeyField(resource);
  const valid: Array<Identifier> = [];
  const errors: Array<SyncRecordError> = [];

  identifiers.forEach((identifier, index) => {
    const key = nonEmptyString((identifier as Record<string, unknown>)[keyField]);
    if (key !== null) {
      valid.push(identifier);
      return;
    }

    errors.push(
      makeRecordError(
        resource,
        `${page}:row:${index}`,
        "hydrate",
        new DdfReplicationIdentifierKeyError({
          resource,
          keyField,
          page,
          index,
        }),
      ),
    );
  });

  return { valid, errors };
};

const failOnReplicationIdentifierErrors = <Identifier>(
  partition: ReturnType<typeof partitionReplicationIdentifiers<Identifier>>,
): Effect.Effect<void, DdfReplicationIdentifierKeyError> => {
  const [firstError] = partition.errors;
  if (firstError === undefined) return Effect.void;
  const cause = firstError.cause;
  return cause instanceof DdfReplicationIdentifierKeyError
    ? Effect.fail(cause)
    : Effect.die(cause);
};

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

export class DdfReplicationIdentifierError extends Data.TaggedError(
  "DdfReplicationIdentifierError",
)<{
  readonly resource: SyncResource;
  readonly keyName: string;
  readonly index: number;
}> {
  override get message() {
    return `${this.resource} replication identifier at index ${this.index} is missing ${this.keyName}`;
  }
}

export interface BaseSyncOptions {
  readonly mode?: SyncMode;
  readonly since?: string;
  readonly destinationId?: number;
  readonly concurrency?: number;
  readonly query?: ReplicationQuery;
}

export interface PropertySyncSink<SinkError = never> {
  readonly upsertPropertyGraph?: (
    graph: PropertyGraph,
  ) => Effect.Effect<void, SinkError>;
  readonly saveWatermark?: (
    resource: "Property",
    watermark: string,
  ) => Effect.Effect<void, SinkError>;
  readonly markMissingPropertiesInactive?: (
    keys: ReadonlyArray<string>,
  ) => Effect.Effect<void, SinkError>;
  readonly deleteOpenHousesForListings?: (
    listings: ReadonlyArray<OpenHouseListingScope>,
  ) => Effect.Effect<void, SinkError>;
}

export interface MemberSyncSink<SinkError = never> {
  readonly upsertMemberWithMedia?: (
    member: MemberRecord,
    media: ReadonlyArray<MediaRecord>,
  ) => Effect.Effect<void, SinkError>;
  readonly upsertSocialMedia?: (
    socialMedia: SocialMedia,
    owner: SyncOwner,
  ) => Effect.Effect<void, SinkError>;
  readonly saveWatermark?: (
    resource: "Member",
    watermark: string,
  ) => Effect.Effect<void, SinkError>;
  readonly markMissingMembersInactive?: (
    keys: ReadonlyArray<string>,
  ) => Effect.Effect<void, SinkError>;
}

export interface OfficeSyncSink<SinkError = never> {
  readonly upsertOfficeWithMedia?: (
    office: OfficeRecord,
    media: ReadonlyArray<MediaRecord>,
  ) => Effect.Effect<void, SinkError>;
  readonly upsertSocialMedia?: (
    socialMedia: SocialMedia,
    owner: SyncOwner,
  ) => Effect.Effect<void, SinkError>;
  readonly saveWatermark?: (
    resource: "Office",
    watermark: string,
  ) => Effect.Effect<void, SinkError>;
  readonly markMissingOfficesInactive?: (
    keys: ReadonlyArray<string>,
  ) => Effect.Effect<void, SinkError>;
}

export interface OpenHouseSyncSink<SinkError = never> {
  readonly upsertOpenHouse?: (
    openHouse: OpenHouseRecord,
  ) => Effect.Effect<void, SinkError>;
  readonly saveWatermark?: (
    resource: "OpenHouse",
    watermark: string,
  ) => Effect.Effect<void, SinkError>;
}

export interface OpenHouseListingScope {
  readonly listingKey: string;
  readonly listingId: string | null;
}

export interface OpenHouseDateWindow {
  readonly startDate: string;
  readonly endDate?: string;
}

export interface PropertySyncOptions<SinkError = never> extends BaseSyncOptions {
  readonly sink?: PropertySyncSink<SinkError>;
  /**
   * Applied after property hydration because replication identifiers do not expose ListAORKey.
   * Skipped hydrated properties are logged and counted in `crea_ddf_sync_skipped_total`.
   */
  readonly includeProperty?: (property: PropertyRecord) => boolean;
}

export interface MemberSyncOptions<SinkError = never> extends BaseSyncOptions {
  readonly sink?: MemberSyncSink<SinkError>;
  readonly includeMember?: (member: MemberRecord) => boolean;
}

export interface OfficeSyncOptions<SinkError = never> extends BaseSyncOptions {
  readonly sink?: OfficeSyncSink<SinkError>;
  readonly includeOffice?: (office: OfficeRecord) => boolean;
}

export interface OpenHouseSyncOptions<SinkError = never> {
  readonly query?: ODataListQuery;
  readonly concurrency?: number;
  readonly sink?: OpenHouseSyncSink<SinkError>;
  readonly listingScopes?: ReadonlyArray<OpenHouseListingScope>;
  readonly dateWindow?: OpenHouseDateWindow;
  readonly listingChunkSize?: number;
}

export interface MasterListDiff {
  readonly localKeys: ReadonlyArray<string>;
  readonly masterKeys: ReadonlyArray<string>;
  readonly missingLocalKeys: ReadonlyArray<string>;
  readonly newMasterKeys: ReadonlyArray<string>;
}

const boundedConcurrency = (concurrency: number | undefined) =>
  Math.max(1, Math.floor(concurrency ?? 100));

const progressLogInterval = (total: number) => {
  if (total >= 1_000) return 250;
  if (total >= 100) return 50;
  if (total >= 20) return 10;
  return 0;
};

const hydrationBatchSize = (concurrency: number) =>
  Math.max(concurrency, Math.min(concurrency * 10, 100));

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


const asPropertyReplicationQuery = (query: ReplicationQuery | undefined) =>
  query as Parameters<typeof replicateProperties>[0];
const asMemberReplicationQuery = (query: ReplicationQuery | undefined) =>
  query as Parameters<typeof replicateMembers>[0];
const asOfficeReplicationQuery = (query: ReplicationQuery | undefined) =>
  query as Parameters<typeof replicateOffices>[0];
const asOpenHouseListQuery = (query: ODataListQuery) =>
  query as Parameters<typeof listOpenHouses>[0];

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
    resource: "Property" | "Member" | "Office",
    first: ODataListEnvelope<Identifier>,
    schema: Schema.Decoder<ODataListEnvelope<Identifier>, never>,
  ) {
    const http = yield* DdfHttp;
    const firstPage = partitionReplicationIdentifiers(
      resource,
      "page:first",
      first.value,
    );
    yield* failOnReplicationIdentifierErrors(firstPage);
    const out: Array<Identifier> = [...firstPage.valid];
    let next = first["@odata.nextLink"] ?? null;

    while (next !== null) {
      const page = yield* http.requestJson(next, undefined, schema);
      const pageIdentifiers = partitionReplicationIdentifiers(
        resource,
        `page:${next}`,
        page.value,
      );
      yield* failOnReplicationIdentifierErrors(pageIdentifiers);
      out.push(...pageIdentifiers.valid);
      next = page["@odata.nextLink"] ?? null;
    }

    return out;
  },
);

const collectPagedIdentifiersWithErrors = Effect.fn(
  "DdfSync.collectPagedIdentifiersWithErrors",
)(function* <Identifier>(
  resource: "Property" | "Member" | "Office",
  first: ODataListEnvelope<Identifier>,
  schema: Schema.Decoder<ODataListEnvelope<Identifier>, never>,
) {
  const http = yield* DdfHttp;
  const firstPage = partitionReplicationIdentifiers(
    resource,
    "page:first",
    first.value,
  );
  const identifiers: Array<Identifier> = [...firstPage.valid];
  const errors: Array<SyncRecordError> = [...firstPage.errors];
  let next = first["@odata.nextLink"] ?? null;
  let pageCount = 1;

  yield* Effect.logInfo(`${resource} sync: collected identifier page`, {
    pages: pageCount,
    identifiers: identifiers.length,
    pageSize: first.value?.length ?? 0,
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
    const pageValue = pageExit.value.value;
    const pageIdentifiers = partitionReplicationIdentifiers(
      resource,
      pageKey,
      pageValue,
    );
    const pageSize = pageValue.length;
    identifiers.push(...pageIdentifiers.valid);
    errors.push(...pageIdentifiers.errors);
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

const runPersist = Effect.fn("DdfSync.runPersist")(function* <PersistError>(
  resource: SyncResource,
  key: string,
  persist: Effect.Effect<void, PersistError>,
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


const stableReplicationKey = (value: string | null | undefined): string | null =>
  value !== null && value !== undefined && value.length > 0 ? value : null;

const missingReplicationKeyError = (
  resource: SyncResource,
  keyName: string,
) =>
  makeRecordError(
    resource,
    `missing:${keyName}`,
    "hydrate",
    new Error(`Missing ${keyName} in replication identifier`),
  );

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
  function* <SinkError = never>(options?: PropertySyncOptions<SinkError>) {
    const concurrency = boundedConcurrency(options?.concurrency);
    const query = incrementalQuery(options);
    yield* Effect.logInfo(
      "Property sync: requesting replication identifiers",
      baseSyncLogDetails(options, concurrency, query),
    );
    const first =
      options?.destinationId === undefined
        ? yield* replicateProperties(asPropertyReplicationQuery(query))
        : yield* replicatePropertiesForDestination(
            options.destinationId,
            asPropertyReplicationQuery(query),
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
    let skippedRecords = 0;
    const hasParentRecordSink =
      options?.sink?.upsertPropertyGraph !== undefined;

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
            const listingKey = stableReplicationKey(identifier.ListingKey);
            if (listingKey === null) {
              return {
                identifier,
                result: {
                  record: null,
                  error: missingReplicationKeyError("Property", "ListingKey"),
                },
                affectsWatermark: true,
              };
            }
            const result = yield* hydrateOne(
              "Property",
              listingKey,
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
            return { identifier, result, affectsWatermark: true };
          }),
        { concurrency },
      );

      for (const { affectsWatermark, identifier, result } of hydrated) {
        processedRecords += 1;
        if (result.error !== null) {
          errors.push(result.error);
          if (affectsWatermark) failedWatermarks.push(identifier.ModificationTimestamp);
          yield* logPersistProgress(processedRecords);
          continue;
        }
        if (result.record === null) {
          yield* logPersistProgress(processedRecords);
          continue;
        }

        const property = result.record as PropertyRecord;
        hydratedSuccessRecords += 1;
        if (
          options?.includeProperty !== undefined &&
          !options.includeProperty(property)
        ) {
          skippedRecords += 1;
          const propertyKey =
            stableReplicationKey(property.ListingKey) ??
            stableReplicationKey(identifier.ListingKey) ??
            "";
          const propertyListingId = stableReplicationKey(property.ListingId);
          const persistError = yield* runPersist(
            "Property",
            propertyKey,
            Effect.gen(function* () {
              if (propertyKey.length === 0) return;
              if (
                options?.sink?.markMissingPropertiesInactive !== undefined
              ) {
                yield* options.sink.markMissingPropertiesInactive([
                  propertyKey,
                ]);
              }
              if (
                options?.sink?.deleteOpenHousesForListings !== undefined
              ) {
                yield* options.sink.deleteOpenHousesForListings([
                  { listingKey: propertyKey, listingId: propertyListingId },
                ]);
              }
            }),
          );
          if (persistError !== null) {
            errors.push(persistError);
            failedWatermarks.push(identifier.ModificationTimestamp);
          } else {
            successfulWatermarks.push(identifier.ModificationTimestamp);
          }
          yield* logPersistProgress(processedRecords);
          continue;
        }

        const graph: PropertyGraph = yield* normalizePropertyGraph(property);

        const persist = Effect.gen(function* () {
          if (options?.sink?.upsertPropertyGraph !== undefined) {
            yield* options.sink.upsertPropertyGraph(graph);
          }
        });
        const propertyKey = String(graph.property.ListingKey ?? "");
        const persistError = yield* runPersist("Property", propertyKey, persist);
        if (persistError !== null) {
          errors.push(persistError);
          failedWatermarks.push(identifier.ModificationTimestamp);
        } else {
          if (hasParentRecordSink) persistedRecords += 1;
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
    yield* Metric.update(ddfSyncSkippedCount, skippedRecords);
    yield* Effect.logInfo(
      "Property sync: complete",
      {
        ...countsLogDetails(counts, nextWatermark),
        skippedOutOfScope: skippedRecords,
      },
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

export const syncMembers = Effect.fn("DdfMemberSync.syncMembers")(function* <
  SinkError = never,
>(
  options?: MemberSyncOptions<SinkError>,
) {
  const concurrency = boundedConcurrency(options?.concurrency);
  const query = incrementalQuery(options);
  yield* Effect.logInfo(
    "Member sync: requesting replication identifiers",
    baseSyncLogDetails(options, concurrency, query),
  );
  const first =
    options?.destinationId === undefined
      ? yield* replicateMembers(asMemberReplicationQuery(query))
      : yield* replicateMembersForDestination(
          options.destinationId,
          asMemberReplicationQuery(query),
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
  const hasParentRecordSink =
    options?.sink?.upsertMemberWithMedia !== undefined;

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
          const memberKey = stableReplicationKey(identifier.MemberKey);
          if (memberKey === null) {
            return {
              identifier,
              result: {
                record: null,
                error: missingReplicationKeyError("Member", "MemberKey"),
              },
              affectsWatermark: true,
            };
          }
          const result = yield* hydrateOne(
            "Member",
            memberKey,
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
          return { identifier, result, affectsWatermark: true };
        }),
      { concurrency },
    );

    for (const { affectsWatermark, identifier, result } of hydrated) {
      processedRecords += 1;
      if (result.error !== null) {
        errors.push(result.error);
        if (affectsWatermark) failedWatermarks.push(identifier.ModificationTimestamp);
        yield* logPersistProgress(processedRecords);
        continue;
      }
      if (result.record === null) {
        yield* logPersistProgress(processedRecords);
        continue;
      }
      hydratedSuccessRecords += 1;
      if (
        options?.includeMember !== undefined &&
        !options.includeMember(result.record)
      ) {
        const skippedMemberKey =
          stableReplicationKey(result.record.MemberKey) ??
          stableReplicationKey(identifier.MemberKey) ??
          "";
        const persistError = yield* runPersist(
          "Member",
          skippedMemberKey,
          skippedMemberKey.length > 0 &&
            options?.sink?.markMissingMembersInactive !== undefined
            ? options.sink.markMissingMembersInactive([skippedMemberKey])
            : Effect.void,
        );
        if (persistError !== null) {
          errors.push(persistError);
          failedWatermarks.push(identifier.ModificationTimestamp);
        } else {
          successfulWatermarks.push(identifier.ModificationTimestamp);
        }
        yield* logPersistProgress(processedRecords);
        continue;
      }
      const memberKey = String(result.record.MemberKey ?? "");
      const memberMedia = (
        Array.isArray((result.record as Record<string, unknown>).Media)
          ? ((result.record as Record<string, unknown>).Media as MediaType)
          : []
      ).map((media) => normalizeMedia("Member", memberKey, media));
      const memberSocialMedia = result.record.MemberSocialMedia ?? [];
      const persist = Effect.gen(function* () {
        if (options?.sink?.upsertMemberWithMedia !== undefined) {
          yield* options.sink.upsertMemberWithMedia(
            result.record,
            memberMedia,
          );
        }
        if (options?.sink?.upsertSocialMedia !== undefined) {
          yield* Effect.forEach(
            memberSocialMedia,
            (socialMedia) =>
              options.sink?.upsertSocialMedia?.(socialMedia, {
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
        if (hasParentRecordSink) persistedRecords += 1;
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

export const syncOffices = Effect.fn("DdfOfficeSync.syncOffices")(function* <
  SinkError = never,
>(
  options?: OfficeSyncOptions<SinkError>,
) {
  const concurrency = boundedConcurrency(options?.concurrency);
  const query = incrementalQuery(options);
  yield* Effect.logInfo(
    "Office sync: requesting replication identifiers",
    baseSyncLogDetails(options, concurrency, query),
  );
  const first =
    options?.destinationId === undefined
      ? yield* replicateOffices(asOfficeReplicationQuery(query))
      : yield* replicateOfficesForDestination(
          options.destinationId,
          asOfficeReplicationQuery(query),
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
  const hasParentRecordSink =
    options?.sink?.upsertOfficeWithMedia !== undefined;

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
          const officeKey = stableReplicationKey(identifier.OfficeKey);
          if (officeKey === null) {
            return {
              identifier,
              result: {
                record: null,
                error: missingReplicationKeyError("Office", "OfficeKey"),
              },
              affectsWatermark: true,
            };
          }
          const result = yield* hydrateOne(
            "Office",
            officeKey,
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
          return { identifier, result, affectsWatermark: true };
        }),
      { concurrency },
    );

    for (const { affectsWatermark, identifier, result } of hydrated) {
      processedRecords += 1;
      if (result.error !== null) {
        errors.push(result.error);
        if (affectsWatermark) failedWatermarks.push(identifier.ModificationTimestamp);
        yield* logPersistProgress(processedRecords);
        continue;
      }
      if (result.record === null) {
        yield* logPersistProgress(processedRecords);
        continue;
      }
      hydratedSuccessRecords += 1;
      if (
        options?.includeOffice !== undefined &&
        !options.includeOffice(result.record)
      ) {
        const skippedOfficeKey =
          stableReplicationKey(result.record.OfficeKey) ??
          stableReplicationKey(identifier.OfficeKey) ??
          "";
        const persistError = yield* runPersist(
          "Office",
          skippedOfficeKey,
          skippedOfficeKey.length > 0 &&
            options?.sink?.markMissingOfficesInactive !== undefined
            ? options.sink.markMissingOfficesInactive([skippedOfficeKey])
            : Effect.void,
        );
        if (persistError !== null) {
          errors.push(persistError);
          failedWatermarks.push(identifier.ModificationTimestamp);
        } else {
          successfulWatermarks.push(identifier.ModificationTimestamp);
        }
        yield* logPersistProgress(processedRecords);
        continue;
      }
      const office = result.record as Record<string, unknown>;
      const officeKey = String(office.OfficeKey ?? "");
      const officeMedia = (
        Array.isArray(office.Media) ? (office.Media as MediaType) : []
      ).map((media) => normalizeMedia("Office", officeKey, media));
      const officeSocialMedia = result.record.OfficeSocialMedia ?? [];
      const persist = Effect.gen(function* () {
        if (options?.sink?.upsertOfficeWithMedia !== undefined) {
          yield* options.sink.upsertOfficeWithMedia(
            result.record,
            officeMedia,
          );
        }
        if (options?.sink?.upsertSocialMedia !== undefined) {
          yield* Effect.forEach(
            officeSocialMedia,
            (socialMedia) =>
              options.sink?.upsertSocialMedia?.(socialMedia, {
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
        if (hasParentRecordSink) persistedRecords += 1;
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

const escapeODataString = (value: string) => value.replaceAll("'", "''");

const combineODataFilters = (filters: ReadonlyArray<string | undefined>) => {
  const present = filters.filter(
    (filter): filter is string => filter !== undefined && filter.length > 0,
  );
  return present.length === 1
    ? present[0]
    : present.map((filter) => `(${filter})`).join(" and ");
};

const listingScopeFilter = (scope: OpenHouseListingScope) => {
  const listingKey = `ListingKey eq '${escapeODataString(scope.listingKey)}'`;
  return scope.listingId === null
    ? listingKey
    : `(${listingKey} or ListingId eq '${escapeODataString(scope.listingId)}')`;
};

const openHouseDateWindowFilter = (window: OpenHouseDateWindow | undefined) => {
  if (window === undefined) return undefined;
  const start = `OpenHouseDate ge ${window.startDate}`;
  return window.endDate === undefined
    ? start
    : `${start} and OpenHouseDate le ${window.endDate}`;
};

const openHouseQueriesForOptions = <SinkError>(
  options: OpenHouseSyncOptions<SinkError> | undefined,
) => {
  const baseQuery = options?.query ?? {};
  const dateFilter = openHouseDateWindowFilter(options?.dateWindow);
  if (options?.listingScopes === undefined) {
    const filter = combineODataFilters([baseQuery.filter, dateFilter]);
    return [{ ...baseQuery, filter: filter.length > 0 ? filter : undefined }];
  }

  if (options.listingScopes.length === 0) return [];

  const chunkSize = Math.max(1, Math.floor(options.listingChunkSize ?? 5));
  return Array.from(batched(options.listingScopes, chunkSize), (chunk) => {
    const scopeFilter = chunk.map(listingScopeFilter).join(" or ");
    const filter = combineODataFilters([baseQuery.filter, scopeFilter, dateFilter]);
    return { ...baseQuery, filter: filter.length > 0 ? filter : undefined };
  });
};

export const syncOpenHouses = Effect.fn("DdfOpenHouseSync.syncOpenHouses")(
  function* <SinkError = never>(options?: OpenHouseSyncOptions<SinkError>) {
    const concurrency = boundedConcurrency(options?.concurrency);
    const queries = openHouseQueriesForOptions(options);
    yield* Effect.logInfo("OpenHouse sync: collecting and persisting pages", {
      concurrency,
      queryCount: queries.length,
      listingScopes: options?.listingScopes?.length ?? null,
      dateWindowStart: options?.dateWindow?.startDate ?? null,
      dateWindowEnd: options?.dateWindow?.endDate ?? null,
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

    const collectQuery = (query: ODataListQuery, queryIndex: number) =>
      Effect.gen(function* () {
        const firstExit = yield* Effect.exit(
          listOpenHouses(asOpenHouseListQuery(query)),
        );
        if (Exit.isFailure(firstExit)) {
          yield* Effect.logWarning("OpenHouse sync: failed to collect first page", {
            queryIndex,
          });
          errors.push(
            makeRecordError(
              "OpenHouse",
              queries.length === 1 ? "page:first" : `query:${queryIndex}:page:first`,
              "hydrate",
              firstExit.cause,
            ),
          );
          return;
        }

        const http = yield* DdfHttp;
        const pageSchema = yield* listSchemaForSelect(
          "OpenHouse",
          query,
          OpenHouseResponseSchema,
          OpenHouseSchema,
        );
        let page = firstExit.value;
        let next: string | null = null;
        while (true) {
          pageCount += 1;
          next = page["@odata.nextLink"] ?? null;
          yield* Effect.logInfo("OpenHouse sync: collected page", {
            queryIndex,
            pages: pageCount,
            records: processedRecords + (page.value?.length ?? 0),
            pageSize: page.value?.length ?? 0,
            hasNextPage: next !== null,
          });
          const pageValue = page.value ?? [];
          yield* persistPage(pageValue as ReadonlyArray<OpenHouseRecord>);
          yield* logPersistProgress(pageValue.length, next !== null);

          if (next === null) break;

          const pageKey = queries.length === 1
            ? `page:${next}`
            : `query:${queryIndex}:page:${next}`;
          const pageExit = yield* Effect.exit(
            http.requestJson<typeof firstExit.value>(
              next,
              undefined,
              pageSchema as Schema.Decoder<
                typeof firstExit.value,
                never
              >,
            ),
          );
          if (Exit.isFailure(pageExit)) {
            yield* Effect.logWarning("OpenHouse sync: failed to collect page", {
              queryIndex,
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
      });

    yield* Effect.forEach(
      queries,
      (query, index) => collectQuery(query, index + 1),
      { concurrency, discard: true },
    );

    const nextWatermark = options?.dateWindow?.startDate ?? null;

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
      ? yield* replicateProperties(asPropertyReplicationQuery(options?.query))
      : yield* replicatePropertiesForDestination(
          options.destinationId,
          asPropertyReplicationQuery(options.query),
        );
  return yield* collectPagedIdentifiers(
    "Property",
    first,
    PropertyReplicationIdentifierResponseSchema,
  );
});

const masterKeysOrFail = Effect.fn("DdfSync.masterKeysOrFail")(
  function* <Identifier>(
    resource: SyncResource,
    keyName: string,
    identifiers: ReadonlyArray<Identifier>,
    keyOf: (identifier: Identifier) => string | null | undefined,
  ) {
    const keys: Array<string> = [];
    for (const [index, identifier] of identifiers.entries()) {
      const key = keyOf(identifier);
      if (key === null || key === undefined || key.length === 0) {
        return yield* new DdfReplicationIdentifierError({
          resource,
          keyName,
          index,
        });
      }
      keys.push(key);
    }
    return keys;
  },
);

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
)(function* <SinkError = never>(
  localKeys: ReadonlyArray<string>,
  options?: Pick<
    PropertySyncOptions<SinkError>,
    "destinationId" | "query" | "sink"
  >,
) {
  const masterList = yield* getPropertyMasterList(options);
  const masterKeys = yield* masterKeysOrFail(
    "Property",
    "ListingKey",
    masterList,
    (identifier) => identifier.ListingKey,
  );
  const diff = diffLocalKeysAgainstMasterList(localKeys, masterKeys);

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
      ? yield* replicateMembers(asMemberReplicationQuery(options?.query))
      : yield* replicateMembersForDestination(
          options.destinationId,
          asMemberReplicationQuery(options.query),
        );
  return yield* collectPagedIdentifiers(
    "Member",
    first,
    MemberReplicationIdentifierResponseSchema,
  );
});

export const getOfficeMasterList = Effect.fn(
  "DdfOfficeSync.getOfficeMasterList",
)(function* (options?: Pick<OfficeSyncOptions, "destinationId" | "query">) {
  const first =
    options?.destinationId === undefined
      ? yield* replicateOffices(asOfficeReplicationQuery(options?.query))
      : yield* replicateOfficesForDestination(
          options.destinationId,
          asOfficeReplicationQuery(options.query),
        );
  return yield* collectPagedIdentifiers(
    "Office",
    first,
    OfficeReplicationIdentifierResponseSchema,
  );
});

export const pruneMissingMembers = Effect.fn(
  "DdfMemberSync.pruneMissingMembers",
)(function* <SinkError = never>(
  localKeys: ReadonlyArray<string>,
  options?: Pick<
    MemberSyncOptions<SinkError>,
    "destinationId" | "query" | "sink"
  >,
) {
  const masterList = yield* getMemberMasterList(options);
  const masterKeys = yield* masterKeysOrFail(
    "Member",
    "MemberKey",
    masterList,
    (identifier) => identifier.MemberKey,
  );
  const diff = diffLocalKeysAgainstMasterList(localKeys, masterKeys);

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
)(function* <SinkError = never>(
  localKeys: ReadonlyArray<string>,
  options?: Pick<
    OfficeSyncOptions<SinkError>,
    "destinationId" | "query" | "sink"
  >,
) {
  const masterList = yield* getOfficeMasterList(options);
  const masterKeys = yield* masterKeysOrFail(
    "Office",
    "OfficeKey",
    masterList,
    (identifier) => identifier.OfficeKey,
  );
  const diff = diffLocalKeysAgainstMasterList(localKeys, masterKeys);

  if (
    diff.missingLocalKeys.length > 0 &&
    options?.sink?.markMissingOfficesInactive !== undefined
  ) {
    yield* options.sink.markMissingOfficesInactive(diff.missingLocalKeys);
  }

  return diff;
});
