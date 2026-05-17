import { and, eq, inArray } from "drizzle-orm";
import { Cause, Config, Data, DateTime, Effect, Exit } from "effect";
import { randomUUID } from "node:crypto";
import { DdfHttp } from "#/client";
import { listDestinations } from "#/resources";
import type { Destination } from "#/schema/destinationSchema";
import { DestinationResponseSchema } from "#/schema/destinationSchema";
import type { ODataListEnvelope } from "#/schema/odata";
import type {
  MemberRecord,
  MemberSyncOptions,
  OfficeRecord,
  OfficeSyncOptions,
  OpenHouseListingScope,
  OpenHouseSyncOptions,
  PropertyRecord,
  PropertySyncOptions,
  SyncRecordError,
  SyncResource,
  SyncResult,
} from "#/sync";
import {
  syncMembers,
  syncOffices,
  syncOpenHouses,
  syncProperties,
} from "#/sync";
import { DdfDatabase } from "#/db/layer";
import { runDdfDatabaseMigrations } from "#/db/runMigrations";
import { makeDdfDatabaseSyncSink, serializeSyncRecordError } from "#/db/sink";
import type { DdfDatabaseSyncSink } from "#/db/sink";
import type { SerializedSyncRecordError } from "#/db/sink";
import { ddfProperties, ddfSyncRuns } from "#/db/schema";
import {
  loadDatabaseWatermark,
  saveDatabaseWatermark,
} from "#/db/watermarks";
import type { DdfWatermarkScope } from "#/db/schema";

export class DdfDatabaseSyncError extends Data.TaggedError(
  "DdfDatabaseSyncError",
)<{
  readonly operation: "loadOpenHouseListingScopes" | "recordRun";
  readonly cause: unknown;
}> {
  override get message() {
    return `DDF database sync operation failed: ${this.operation}`;
  }
}

const mapDatabaseSyncError =
  (operation: DdfDatabaseSyncError["operation"]) => (cause: unknown) =>
    new DdfDatabaseSyncError({ operation, cause });

export class DdfChosenAorKeysConfigError extends Data.TaggedError(
  "DdfChosenAorKeysConfigError",
)<{
  readonly value: string;
  readonly reason: string;
}> {
  override get message() {
    return `Invalid CREA_CHOSEN_AOR_KEYS: ${this.reason}`;
  }
}

export type ChosenAorKeys = ReadonlyArray<string>;

const normalizeChosenAorKey = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const invalidChosenAorKeys = (value: string, reason: string) =>
  new DdfChosenAorKeysConfigError({ value, reason });

const parseJsonChosenAorKeys = (raw: string): ReadonlyArray<unknown> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("expected a JSON array, not an object or scalar");
    }
    return parsed;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw invalidChosenAorKeys(raw, reason);
  }
};

export const parseChosenAorKeys = (value: string | null | undefined): ChosenAorKeys => {
  const raw = value?.trim() ?? "";
  if (raw.length === 0) return [];

  const values: ReadonlyArray<unknown> = (() => {
    if (raw.startsWith("[")) return parseJsonChosenAorKeys(raw);
    if (raw.startsWith("{") || raw.endsWith("}")) {
      throw invalidChosenAorKeys(raw, "JSON object syntax is not supported; use a JSON array or comma-separated list");
    }
    if (raw.includes("[") || raw.includes("]")) {
      throw invalidChosenAorKeys(raw, "stray bracket in comma-separated list; use a valid JSON array or remove brackets");
    }
    const entries = raw.split(",");
    const emptyIndex = entries.findIndex((entry) => entry.trim().length === 0);
    if (emptyIndex >= 0) {
      throw invalidChosenAorKeys(raw, `entry at index ${emptyIndex} must not be empty`);
    }
    return entries;
  })();

  const keys = values.map(normalizeChosenAorKey);
  const invalidIndex = keys.findIndex((key) => key === null);
  if (invalidIndex >= 0) {
    throw invalidChosenAorKeys(
      raw,
      `entry at index ${invalidIndex} must be a non-empty string or finite number`,
    );
  }

  return [...new Set(keys as Array<string>)];
};

const chosenAorKeysRawConfig = Config.string("CREA_CHOSEN_AOR_KEYS").pipe(
  Config.withDefault(""),
);

const parseChosenAorKeysEffect = (value: string) =>
  Effect.try({
    try: () => parseChosenAorKeys(value),
    catch: (cause) => cause instanceof DdfChosenAorKeysConfigError
      ? cause
      : new DdfChosenAorKeysConfigError({ value, reason: cause instanceof Error ? cause.message : String(cause) }),
  });

export const chosenAorKeysFromEnv = Effect.fn("DdfDatabaseSync.chosenAorKeysFromEnv")(
  function* () {
    const raw = yield* chosenAorKeysRawConfig;
    return yield* parseChosenAorKeysEffect(raw);
  },
);

const loadChosenAorKeys = Effect.fn("DdfDatabaseSync.loadChosenAorKeys")(
  function* (options?: Pick<SyncDdfDatabaseOnceOptions, "chosenAorKeys">) {
    if (options?.chosenAorKeys !== undefined) {
      return yield* parseChosenAorKeysEffect(options.chosenAorKeys.join(","));
    }
    return yield* chosenAorKeysFromEnv();
  },
);

const includeAorKey = (chosenAorKeys: ChosenAorKeys) => {
  if (chosenAorKeys.length === 0) return undefined;
  const keySet = new Set(chosenAorKeys);
  return (value: string | null | undefined) =>
    value !== null && value !== undefined && keySet.has(value);
};

const includeMemberForAorKeys = (chosenAorKeys: ChosenAorKeys) => {
  const includes = includeAorKey(chosenAorKeys);
  return includes === undefined
    ? undefined
    : (member: MemberRecord) => includes(member.MemberAORKey);
};

const includePropertyForAorKeys = (chosenAorKeys: ChosenAorKeys) => {
  const includes = includeAorKey(chosenAorKeys);
  return includes === undefined
    ? undefined
    : (property: PropertyRecord) => includes(property.ListAORKey);
};

const includeOfficeForAorKeys = (chosenAorKeys: ChosenAorKeys) => {
  const includes = includeAorKey(chosenAorKeys);
  return includes === undefined
    ? undefined
    : (office: OfficeRecord) => includes(office.OfficeAORKey);
};

export interface SyncDdfDatabaseOnceOptions {
  readonly runId?: string;
  readonly runMigrations?: boolean;
  readonly destinationId?: number;
  readonly concurrency?: number;
  readonly destinationQuery?: Parameters<typeof listDestinations>[0];
  readonly propertyQuery?: PropertySyncOptions["query"];
  readonly memberQuery?: MemberSyncOptions["query"];
  readonly officeQuery?: OfficeSyncOptions["query"];
  readonly openHouseQuery?: OpenHouseSyncOptions["query"];
  readonly openHouseDateWindow?: OpenHouseSyncOptions["dateWindow"];
  readonly openHouseListingChunkSize?: number;
  /**
   * Limits persisted Property/Member/Office rows and OpenHouse listing scopes to these AOR keys.
   * Property replication is destination-scoped and is not AOR-filtered because replication
   * identifier rows do not expose ListAORKey. Database watermarks are stored with destination
   * and AOR scope metadata, so changing either scope starts a fresh processed-stream cursor.
   * Existing rows outside this scope are not pruned automatically.
   */
  readonly chosenAorKeys?: ChosenAorKeys;
  readonly dependencies?: Partial<SyncDdfDatabaseDependencies>;
}

export interface SyncDdfDatabaseDependencies {
  readonly syncDestinations: typeof syncDestinations;
  readonly syncProperties: typeof syncProperties;
  readonly syncMembers: typeof syncMembers;
  readonly syncOffices: typeof syncOffices;
  readonly syncOpenHouses: typeof syncOpenHouses;
  readonly loadWatermark: typeof loadDatabaseWatermark;
  readonly saveWatermark: typeof saveDatabaseWatermark;
  readonly runMigrations: typeof runDdfDatabaseMigrations;
  readonly makeSink: typeof makeDdfDatabaseSyncSink;
  readonly loadOpenHouseListingScopes: (
    chosenAorKeys: ChosenAorKeys,
  ) => Effect.Effect<
    ReadonlyArray<OpenHouseListingScope>,
    DdfDatabaseSyncError,
    DdfDatabase
  >;
  readonly recordRun: (
    summary: SyncDdfDatabaseOnceSummary,
    destinationId?: number,
  ) => Effect.Effect<void, DdfDatabaseSyncError, DdfDatabase>;
}

export interface DdfDatabaseResourceSummary {
  readonly counts: SyncResult<unknown>["counts"];
  readonly nextWatermark: string | null;
  readonly errors: ReadonlyArray<SerializedSyncRecordError>;
}

export interface SyncDdfDatabaseOnceSummary {
  readonly runId: string;
  readonly status: "success" | "partial_failure";
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly destination: DdfDatabaseResourceSummary;
  readonly property: DdfDatabaseResourceSummary;
  readonly member: DdfDatabaseResourceSummary;
  readonly office: DdfDatabaseResourceSummary;
  readonly openHouse: DdfDatabaseResourceSummary;
}

const resourceSummary = (result: { readonly counts: SyncResult<unknown>["counts"]; readonly nextWatermark: string | null; readonly errors: ReadonlyArray<SyncRecordError>; }): DdfDatabaseResourceSummary => ({
  counts: result.counts,
  nextWatermark: result.nextWatermark,
  errors: result.errors.map(serializeSyncRecordError),
});

const syncResultLogDetails = (result: {
  readonly counts: SyncResult<unknown>["counts"];
  readonly nextWatermark: string | null;
  readonly errors: ReadonlyArray<unknown>;
}) => ({
  identifiers: result.counts.identifiers,
  hydrated: result.counts.hydrated,
  persisted: result.counts.persisted,
  failed: result.counts.failed,
  errors: result.errors.length,
  nextWatermark: result.nextWatermark,
});

const causeMessage = (cause: unknown) =>
  Cause.isCause(cause)
    ? Cause.pretty(cause)
    : cause instanceof Error
      ? cause.message
      : String(cause);

const makeSyncRecordError = (
  resource: SyncResource,
  key: string,
  stage: SyncRecordError["stage"],
  cause: unknown,
): SyncRecordError => ({
  resource,
  key,
  stage,
  cause,
  message: causeMessage(cause),
});

const failedDestinationResult = (cause: unknown): SyncResult<Destination> => ({
  resource: "Destination",
  identifiers: [],
  counts: {
    identifiers: 0,
    hydrated: 0,
    persisted: 0,
    failed: 1,
  },
  errors: [
    makeSyncRecordError("Destination", "destination-sync", "hydrate", cause),
  ],
  nextWatermark: null,
});

const collectPagedDestinations = Effect.fn(
  "DdfDatabaseSync.collectPagedDestinations",
)(function* (first: ODataListEnvelope<Destination>) {
  const http = yield* DdfHttp;
  const destinations: Array<Destination> = [...first.value];
  let next = first["@odata.nextLink"] ?? null;
  let pageCount = 1;

  yield* Effect.logInfo("DDF database sync: collected destination page", {
    pages: pageCount,
    destinations: destinations.length,
    pageSize: first.value.length,
    hasNextPage: next !== null,
  });

  while (next !== null) {
    const page = yield* http.requestJson(
      next,
      undefined,
      DestinationResponseSchema,
    );
    pageCount += 1;
    destinations.push(...page.value);
    next = page["@odata.nextLink"] ?? null;
    yield* Effect.logInfo("DDF database sync: collected destination page", {
      pages: pageCount,
      destinations: destinations.length,
      pageSize: page.value.length,
      hasNextPage: next !== null,
    });
  }

  return destinations;
});

export const syncDestinations = Effect.fn("DdfDatabaseSync.syncDestinations")(
  function* (
    sink: Pick<DdfDatabaseSyncSink, "upsertDestination">,
    query?: Parameters<typeof listDestinations>[0],
  ) {
    const first = yield* listDestinations(query);
    const destinations = yield* collectPagedDestinations(first);
    const errors: Array<SyncRecordError> = [];
    let persisted = 0;

    for (const destination of destinations) {
      const destinationKey = String(destination.DestinationId);
      const exit = yield* Effect.exit(sink.upsertDestination(destination));
      if (Exit.isFailure(exit)) {
        errors.push(makeSyncRecordError("Destination", destinationKey, "persist", exit.cause));
      } else {
        persisted += 1;
      }
    }

    const counts = {
      identifiers: destinations.length,
      hydrated: destinations.length,
      persisted,
      failed: errors.length,
    };
    const result: SyncResult<Destination> = {
      resource: "Destination",
      identifiers: destinations,
      counts,
      errors,
      nextWatermark: null,
    };
    return result;
  },
);

const openHouseQueryForDatabaseSync = (
  query: OpenHouseSyncOptions["query"],
): OpenHouseSyncOptions["query"] => query;

const defaultOpenHouseDateWindow = Effect.fn(
  "DdfDatabaseSync.defaultOpenHouseDateWindow",
)(function* () {
  const today = yield* DateTime.now;
  return {
    startDate: DateTime.formatIsoDateUtc(today),
    endDate: DateTime.formatIsoDateUtc(DateTime.add(today, { days: 30 })),
  } satisfies NonNullable<OpenHouseSyncOptions["dateWindow"]>;
});

const loadOpenHouseListingScopes = Effect.fn(
  "DdfDatabaseSync.loadOpenHouseListingScopes",
)(function* (chosenAorKeys: ChosenAorKeys = []) {
  const { db } = yield* DdfDatabase;
  const filters = [
    eq(ddfProperties.active, true),
    ...(chosenAorKeys.length > 0
      ? [inArray(ddfProperties.listAorKey, [...chosenAorKeys])]
      : []),
  ];
  return yield* db
    .select({
      listingKey: ddfProperties.listingKey,
      listingId: ddfProperties.listingId,
    })
    .from(ddfProperties)
    .where(and(...filters))
    .pipe(Effect.mapError(mapDatabaseSyncError("loadOpenHouseListingScopes")));
});

export interface DatabaseSyncWatermarks {
  readonly property: string | null;
  readonly member: string | null;
  readonly office: string | null;
  readonly openHouse: string | null;
}

export const databaseSyncOptionsFromWatermarks = (
  watermarks: DatabaseSyncWatermarks,
  options?: Pick<
    SyncDdfDatabaseOnceOptions,
    | "destinationId"
    | "concurrency"
    | "propertyQuery"
    | "memberQuery"
    | "officeQuery"
    | "openHouseQuery"
    | "openHouseListingChunkSize"
    | "chosenAorKeys"
  >,
) => ({
  property: {
    mode: watermarks.property === null ? "initial" : "incremental",
    since: watermarks.property ?? undefined,
    destinationId: options?.destinationId,
    concurrency: options?.concurrency,
    query: options?.propertyQuery,
    includeProperty: includePropertyForAorKeys(options?.chosenAorKeys ?? []),
  } satisfies Omit<PropertySyncOptions, "sink">,
  member: {
    mode: watermarks.member === null ? "initial" : "incremental",
    since: watermarks.member ?? undefined,
    destinationId: options?.destinationId,
    concurrency: options?.concurrency,
    query: options?.memberQuery,
    includeMember: includeMemberForAorKeys(options?.chosenAorKeys ?? []),
  } satisfies Omit<MemberSyncOptions, "sink">,
  office: {
    mode: watermarks.office === null ? "initial" : "incremental",
    since: watermarks.office ?? undefined,
    destinationId: options?.destinationId,
    concurrency: options?.concurrency,
    query: options?.officeQuery,
    includeOffice: includeOfficeForAorKeys(options?.chosenAorKeys ?? []),
  } satisfies Omit<OfficeSyncOptions, "sink">,
  openHouse: {
    query: openHouseQueryForDatabaseSync(options?.openHouseQuery),
    concurrency: options?.concurrency,
    listingChunkSize: options?.openHouseListingChunkSize,
  } satisfies Omit<OpenHouseSyncOptions, "sink">,
});

const databaseWatermarkScope = (
  options: Pick<SyncDdfDatabaseOnceOptions, "destinationId"> | undefined,
  chosenAorKeys: ChosenAorKeys,
): DdfWatermarkScope => ({
  destinationId: options?.destinationId ?? null,
  chosenAorKeys,
});

const saveIfAdvanced = Effect.fn("DdfDatabaseSync.saveIfAdvanced")(function* (
  saveWatermark: SyncDdfDatabaseDependencies["saveWatermark"],
  resource: Parameters<typeof saveDatabaseWatermark>[0],
  watermark: string | null,
  scope: DdfWatermarkScope,
) {
  if (watermark === null) {
    yield* Effect.logInfo("DDF database sync: watermark unchanged", { resource });
    return;
  }

  yield* Effect.logInfo("DDF database sync: saving watermark", {
    resource,
    watermark,
  });
  yield* saveWatermark(resource, watermark, scope);
});

const recordRunSummary = Effect.fn("DdfDatabaseSync.recordRunSummary")(
  function* (summary: SyncDdfDatabaseOnceSummary, destinationId?: number) {
    const { db } = yield* DdfDatabase;
    yield* db
      .insert(ddfSyncRuns)
      .values({
        id: summary.runId,
        startedAt: summary.startedAt,
        completedAt: summary.completedAt,
        status: summary.status,
        destinationId: destinationId ?? null,
        summary,
      })
      .onConflictDoUpdate({
        target: ddfSyncRuns.id,
        set: {
          completedAt: summary.completedAt,
          status: summary.status,
          summary,
        },
      })
      .pipe(Effect.mapError(mapDatabaseSyncError("recordRun")));
  },
);

const defaultDependencies: SyncDdfDatabaseDependencies = {
  syncDestinations,
  syncProperties,
  syncMembers,
  syncOffices,
  syncOpenHouses,
  loadWatermark: loadDatabaseWatermark,
  saveWatermark: saveDatabaseWatermark,
  runMigrations: runDdfDatabaseMigrations,
  makeSink: makeDdfDatabaseSyncSink,
  loadOpenHouseListingScopes,
  recordRun: recordRunSummary,
};

export const syncDdfDatabaseOnce = Effect.fn("DdfDatabaseSync.syncOnce")(
  function* (options?: SyncDdfDatabaseOnceOptions) {
    const dependencies = { ...defaultDependencies, ...options?.dependencies };
    const runId = options?.runId ?? `ddf-sync-${randomUUID()}`;
    const shouldRunMigrations = options?.runMigrations ?? true;
    const chosenAorKeys = yield* loadChosenAorKeys(options);
    yield* Effect.annotateCurrentSpan({
      "ddf.run_id": runId,
      "ddf.destination_id": options?.destinationId ?? null,
      "ddf.sync.concurrency": options?.concurrency ?? null,
      "ddf.sync.run_migrations": shouldRunMigrations,
      "ddf.sync.chosen_aor_keys": chosenAorKeys.length,
    });

    yield* Effect.logInfo("DDF database sync: starting", {
      runId,
      destinationId: options?.destinationId ?? null,
      concurrency: options?.concurrency ?? null,
      runMigrations: shouldRunMigrations,
      chosenAorKeys: chosenAorKeys.length,
    });

    if (shouldRunMigrations) {
      yield* Effect.logInfo("DDF database sync: running database migrations", {
        runId,
      });
      yield* dependencies.runMigrations().pipe(
        Effect.withSpan("DdfDatabaseSync.runMigrations", {
          attributes: { "ddf.run_id": runId },
        }),
      );
      yield* Effect.logInfo("DDF database sync: database migrations complete", {
        runId,
      });
    } else {
      yield* Effect.logInfo("DDF database sync: skipping database migrations", {
        runId,
      });
    }

    const startedAt = yield* DateTime.nowAsDate;
    // TODO: harden processed-stream cursoring further:
    // cap source timestamps by each resource sync start time, apply a small lookback,
    // and persist richer DB runtime metadata alongside reset-on-AOR-change guidance.

    yield* Effect.logInfo("DDF database sync: preparing database sink", {
      runId,
    });
    const sink = yield* dependencies.makeSink({ runId }).pipe(
      Effect.withSpan("DdfDatabaseSync.makeSink", {
        attributes: { "ddf.run_id": runId },
      }),
    );
    const watermarkScope = databaseWatermarkScope(options, chosenAorKeys);

    yield* Effect.logInfo("DDF database sync: syncing destinations", {
      runId,
    });
    const destinationExit = yield* Effect.exit(
      dependencies.syncDestinations(sink, options?.destinationQuery).pipe(
        Effect.withSpan("DdfDatabaseSync.syncDestinationsPhase", {
          attributes: { "ddf.run_id": runId, "ddf.resource": "Destination" },
        }),
      ),
    );
    const destination = Exit.isSuccess(destinationExit)
      ? destinationExit.value
      : failedDestinationResult(destinationExit.cause);
    if (Exit.isFailure(destinationExit)) {
      yield* Effect.logWarning("DDF database sync: destination sync failed; continuing replication", {
        runId,
        cause: causeMessage(destinationExit.cause),
      });
    }
    yield* Effect.logInfo(
      "DDF database sync: destinations complete",
      syncResultLogDetails(destination),
    );

    yield* Effect.logInfo("DDF database sync: loading watermarks", { runId });
    const [propertyWatermark, memberWatermark, officeWatermark] =
      yield* Effect.all([
        dependencies.loadWatermark("Property", watermarkScope),
        dependencies.loadWatermark("Member", watermarkScope),
        dependencies.loadWatermark("Office", watermarkScope),
      ]).pipe(
        Effect.withSpan("DdfDatabaseSync.loadWatermarks", {
          attributes: { "ddf.run_id": runId },
        }),
      );
    yield* Effect.logInfo("DDF database sync: loaded watermarks", {
      runId,
      property: propertyWatermark,
      member: memberWatermark,
      office: officeWatermark,
    });

    const syncOptions = databaseSyncOptionsFromWatermarks({
      property: propertyWatermark,
      member: memberWatermark,
      office: officeWatermark,
      openHouse: null,
    }, { ...options, chosenAorKeys });
    yield* Effect.logInfo("DDF database sync: sync plan ready", {
      runId,
      propertyMode: syncOptions.property.mode,
      memberMode: syncOptions.member.mode,
      officeMode: syncOptions.office.mode,
    });

    yield* Effect.logInfo("DDF database sync: syncing properties", {
      runId,
      mode: syncOptions.property.mode,
      since: syncOptions.property.since ?? null,
    });
    const property = yield* dependencies.syncProperties({
      ...syncOptions.property,
      sink,
    }).pipe(
      Effect.withSpan("DdfDatabaseSync.syncPropertiesPhase", {
        attributes: {
          "ddf.run_id": runId,
          "ddf.resource": "Property",
          "ddf.sync.mode": syncOptions.property.mode,
        },
      }),
    );
    yield* Effect.logInfo(
      "DDF database sync: properties complete",
      syncResultLogDetails(property),
    );
    yield* saveIfAdvanced(
      dependencies.saveWatermark,
      "Property",
      property.nextWatermark,
      watermarkScope,
    );

    yield* Effect.logInfo("DDF database sync: syncing members", {
      runId,
      mode: syncOptions.member.mode,
      since: syncOptions.member.since ?? null,
    });
    const member = yield* dependencies.syncMembers({
      ...syncOptions.member,
      sink,
    }).pipe(
      Effect.withSpan("DdfDatabaseSync.syncMembersPhase", {
        attributes: {
          "ddf.run_id": runId,
          "ddf.resource": "Member",
          "ddf.sync.mode": syncOptions.member.mode,
        },
      }),
    );
    yield* Effect.logInfo(
      "DDF database sync: members complete",
      syncResultLogDetails(member),
    );
    yield* saveIfAdvanced(
      dependencies.saveWatermark,
      "Member",
      member.nextWatermark,
      watermarkScope,
    );

    yield* Effect.logInfo("DDF database sync: syncing offices", {
      runId,
      mode: syncOptions.office.mode,
      since: syncOptions.office.since ?? null,
    });
    const office = yield* dependencies.syncOffices({
      ...syncOptions.office,
      sink,
    }).pipe(
      Effect.withSpan("DdfDatabaseSync.syncOfficesPhase", {
        attributes: {
          "ddf.run_id": runId,
          "ddf.resource": "Office",
          "ddf.sync.mode": syncOptions.office.mode,
        },
      }),
    );
    yield* Effect.logInfo(
      "DDF database sync: offices complete",
      syncResultLogDetails(office),
    );
    yield* saveIfAdvanced(
      dependencies.saveWatermark,
      "Office",
      office.nextWatermark,
      watermarkScope,
    );

    const openHouseListingScopes = yield* dependencies.loadOpenHouseListingScopes(chosenAorKeys);
    const openHouseDateWindow = options?.openHouseDateWindow ?? (yield* defaultOpenHouseDateWindow());
    yield* Effect.logInfo("DDF database sync: syncing open houses", {
      runId,
      listingScopes: openHouseListingScopes.length,
      dateWindowStart: openHouseDateWindow.startDate,
      dateWindowEnd: openHouseDateWindow.endDate ?? null,
    });
    const openHouse = yield* dependencies.syncOpenHouses({
      ...syncOptions.openHouse,
      listingScopes: openHouseListingScopes,
      dateWindow: openHouseDateWindow,
      sink,
    }).pipe(
      Effect.withSpan("DdfDatabaseSync.syncOpenHousesPhase", {
        attributes: {
          "ddf.run_id": runId,
          "ddf.resource": "OpenHouse",
          "ddf.sync.listing_scopes": openHouseListingScopes.length,
        },
      }),
    );
    yield* Effect.logInfo(
      "DDF database sync: open houses complete",
      syncResultLogDetails(openHouse),
    );
    const syncErrors = [
      ...destination.errors,
      ...property.errors,
      ...member.errors,
      ...office.errors,
      ...openHouse.errors,
    ];
    yield* Effect.logInfo("DDF database sync: recording sync errors", {
      runId,
      errors: syncErrors.length,
    });
    yield* Effect.forEach(
      syncErrors,
      sink.recordSyncError,
      { discard: true },
    ).pipe(
      Effect.withSpan("DdfDatabaseSync.recordSyncErrors", {
        attributes: { "ddf.run_id": runId, "ddf.sync.errors": syncErrors.length },
      }),
    );

    const completedAt = yield* DateTime.nowAsDate;
    const hasErrors =
      property.errors.length +
        destination.errors.length +
        member.errors.length +
        office.errors.length +
        openHouse.errors.length >
      0;
    if (hasErrors) {
      yield* Effect.logWarning("DDF database sync: completed with record errors", {
        runId,
        errors: syncErrors.length,
      });
    }
    const summary: SyncDdfDatabaseOnceSummary = {
      runId,
      status: hasErrors ? "partial_failure" : "success",
      startedAt,
      completedAt,
      destination: resourceSummary(destination),
      property: resourceSummary(property),
      member: resourceSummary(member),
      office: resourceSummary(office),
      openHouse: resourceSummary(openHouse),
    };

    yield* Effect.logInfo("DDF database sync: recording run summary", {
      runId,
      status: summary.status,
    });
    yield* dependencies.recordRun(summary, options?.destinationId).pipe(
      Effect.withSpan("DdfDatabaseSync.recordRun", {
        attributes: { "ddf.run_id": runId, "ddf.sync.status": summary.status },
      }),
    );
    yield* Effect.logInfo("DDF database sync: finished", {
      runId,
      status: summary.status,
      startedAt,
      completedAt,
    });
    return summary;
  },
);
