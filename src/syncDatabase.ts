import { and, eq, inArray } from "drizzle-orm";
import { Config, Data, DateTime, Effect } from "effect";
import { randomUUID } from "node:crypto";
import type {
  MemberSyncOptions,
  OfficeSyncOptions,
  OpenHouseListingScope,
  OpenHouseSyncOptions,
  PropertySyncOptions,
  SyncRecordError,
  SyncResult,
} from "./sync";
import {
  syncMembers,
  syncOffices,
  syncOpenHouses,
  syncProperties,
} from "./sync";
import { DdfDatabase } from "./db/layer";
import { runDdfDatabaseMigrations } from "./db/runMigrations";
import { makeDdfDatabaseSyncSink, serializeSyncRecordError } from "./db/sink";
import type { SerializedSyncRecordError } from "./db/sink";
import { ddfProperties, ddfSyncRuns } from "./db/schema";
import {
  loadDatabaseWatermark,
  saveDatabaseWatermark,
} from "./db/watermarks";

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

const normalizeAorKeyValue = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const parseChosenAorKeys = (
  value: string | null | undefined,
): Effect.Effect<ReadonlyArray<string>, DdfChosenAorKeysConfigError> => {
  const raw = value?.trim() ?? "";
  if (raw.length === 0) return Effect.succeed([]);

  const fail = (reason: string) =>
    Effect.fail(new DdfChosenAorKeysConfigError({ value: raw, reason }));

  const parseItems = (items: ReadonlyArray<unknown>) => {
    const keys: Array<string> = [];
    for (const item of items) {
      const key = normalizeAorKeyValue(item);
      if (key === null) {
        return fail(
          "expected a comma-separated list or JSON array containing only non-empty string/number AOR keys",
        );
      }
      keys.push(key);
    }
    return Effect.succeed(keys);
  };

  if (raw.startsWith("{")) {
    return fail("expected a comma-separated list or JSON array, not a JSON object");
  }

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parseItems(parsed)
        : fail("expected JSON array syntax, for example [76,77,93]");
    } catch {
      return fail("expected valid JSON array syntax, for example [76,77,93]");
    }
  }

  if (raw.includes("[") || raw.includes("]")) {
    return fail("brackets are only valid around a JSON array");
  }

  const parts = raw.split(",").map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) {
    return fail("comma-separated values must not contain empty AOR keys");
  }
  return parseItems(parts);
};

export const chosenAorKeysFromConfig = Effect.fn(
  "DdfDatabaseSync.chosenAorKeysFromConfig",
)(function* () {
  const raw = yield* Config.string("CREA_CHOSEN_AOR_KEYS").pipe(
    Config.withDefault(""),
  );
  return yield* parseChosenAorKeys(raw);
});

const odataString = (value: string) => `'${value.replaceAll("'", "''")}'`;

const chosenAorFilter = (
  field: "ListAORKey" | "MemberAORKey" | "OfficeAORKey",
  chosenAorKeys: ReadonlyArray<string>,
): string | undefined =>
  chosenAorKeys.length === 0
    ? undefined
    : `${field} in (${chosenAorKeys.map(odataString).join(",")})`;

const combineFilters = (
  filters: ReadonlyArray<string | undefined>,
): string | undefined => {
  const active = filters.filter((filter): filter is string =>
    filter !== undefined && filter.length > 0,
  );
  if (active.length === 0) return undefined;
  return active.map((filter) => `(${filter})`).join(" and ");
};

const withAorFilter = (
  query: PropertySyncOptions["query"],
  field: "ListAORKey" | "MemberAORKey" | "OfficeAORKey",
  chosenAorKeys: ReadonlyArray<string>,
): PropertySyncOptions["query"] => {
  if (chosenAorKeys.length === 0) return query;
  const filter = combineFilters([chosenAorFilter(field, chosenAorKeys), query?.filter]);
  return filter === undefined ? query : { ...query, filter };
};

export interface SyncDdfDatabaseOnceOptions {
  readonly runMigrations?: boolean;
  readonly destinationId?: number;
  readonly concurrency?: number;
  readonly propertyQuery?: PropertySyncOptions["query"];
  readonly memberQuery?: MemberSyncOptions["query"];
  readonly officeQuery?: OfficeSyncOptions["query"];
  readonly openHouseQuery?: OpenHouseSyncOptions["query"];
  readonly openHouseDateWindow?: OpenHouseSyncOptions["dateWindow"];
  readonly openHouseListingChunkSize?: number;
  readonly dependencies?: Partial<SyncDdfDatabaseDependencies>;
}

export interface SyncDdfDatabaseDependencies {
  readonly syncProperties: typeof syncProperties;
  readonly syncMembers: typeof syncMembers;
  readonly syncOffices: typeof syncOffices;
  readonly syncOpenHouses: typeof syncOpenHouses;
  readonly loadWatermark: typeof loadDatabaseWatermark;
  readonly saveWatermark: typeof saveDatabaseWatermark;
  readonly runMigrations: typeof runDdfDatabaseMigrations;
  readonly makeSink: typeof makeDdfDatabaseSyncSink;
  readonly loadOpenHouseListingScopes: (
    chosenAorKeys: ReadonlyArray<string>,
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
)(function* (chosenAorKeys: ReadonlyArray<string> = []) {
  const { db } = yield* DdfDatabase;
  return yield* db
    .select({
      listingKey: ddfProperties.listingKey,
      listingId: ddfProperties.listingId,
    })
    .from(ddfProperties)
    .where(
      chosenAorKeys.length === 0
        ? eq(ddfProperties.active, true)
        : and(
            eq(ddfProperties.active, true),
            inArray(ddfProperties.listAorKey, chosenAorKeys),
          ),
    )
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
  > & { readonly chosenAorKeys?: ReadonlyArray<string> },
) => ({
  property: {
    mode: watermarks.property === null ? "initial" : "incremental",
    since: watermarks.property ?? undefined,
    destinationId: options?.destinationId,
    concurrency: options?.concurrency,
    query: withAorFilter(options?.propertyQuery, "ListAORKey", options?.chosenAorKeys ?? []),
  } satisfies Omit<PropertySyncOptions, "sink">,
  member: {
    mode: watermarks.member === null ? "initial" : "incremental",
    since: watermarks.member ?? undefined,
    destinationId: options?.destinationId,
    concurrency: options?.concurrency,
    query: withAorFilter(options?.memberQuery, "MemberAORKey", options?.chosenAorKeys ?? []),
  } satisfies Omit<MemberSyncOptions, "sink">,
  office: {
    mode: watermarks.office === null ? "initial" : "incremental",
    since: watermarks.office ?? undefined,
    destinationId: options?.destinationId,
    concurrency: options?.concurrency,
    query: withAorFilter(options?.officeQuery, "OfficeAORKey", options?.chosenAorKeys ?? []),
  } satisfies Omit<OfficeSyncOptions, "sink">,
  openHouse: {
    query: openHouseQueryForDatabaseSync(options?.openHouseQuery),
    concurrency: options?.concurrency,
    listingChunkSize: options?.openHouseListingChunkSize,
  } satisfies Omit<OpenHouseSyncOptions, "sink">,
});
const saveIfAdvanced = Effect.fn("DdfDatabaseSync.saveIfAdvanced")(function* (
  saveWatermark: SyncDdfDatabaseDependencies["saveWatermark"],
  resource: Parameters<typeof saveDatabaseWatermark>[0],
  watermark: string | null,
) {
  if (watermark === null) {
    yield* Effect.logInfo("DDF database sync: watermark unchanged", { resource });
    return;
  }

  yield* Effect.logInfo("DDF database sync: saving watermark", {
    resource,
    watermark,
  });
  yield* saveWatermark(resource, watermark);
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
    const runId = `ddf-sync-${randomUUID()}`;
    const shouldRunMigrations = options?.runMigrations ?? true;

    yield* Effect.logInfo("DDF database sync: starting", {
      runId,
      destinationId: options?.destinationId ?? null,
      concurrency: options?.concurrency ?? null,
      runMigrations: shouldRunMigrations,
    });

    if (shouldRunMigrations) {
      yield* Effect.logInfo("DDF database sync: running database migrations", {
        runId,
      });
      yield* dependencies.runMigrations();
      yield* Effect.logInfo("DDF database sync: database migrations complete", {
        runId,
      });
    } else {
      yield* Effect.logInfo("DDF database sync: skipping database migrations", {
        runId,
      });
    }

    const startedAt = yield* DateTime.nowAsDate;
    yield* Effect.logInfo("DDF database sync: preparing database sink", {
      runId,
    });
    const sink = yield* dependencies.makeSink({ runId });

    yield* Effect.logInfo("DDF database sync: loading watermarks", { runId });
    const [propertyWatermark, memberWatermark, officeWatermark] =
      yield* Effect.all([
        dependencies.loadWatermark("Property"),
        dependencies.loadWatermark("Member"),
        dependencies.loadWatermark("Office"),
      ]);
    yield* Effect.logInfo("DDF database sync: loaded watermarks", {
      runId,
      property: propertyWatermark,
      member: memberWatermark,
      office: officeWatermark,
    });

    const chosenAorKeys = yield* chosenAorKeysFromConfig();
    yield* Effect.logInfo("DDF database sync: loaded AOR scope", {
      runId,
      chosenAorKeys: chosenAorKeys.length,
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
    });
    yield* Effect.logInfo(
      "DDF database sync: properties complete",
      syncResultLogDetails(property),
    );
    yield* saveIfAdvanced(
      dependencies.saveWatermark,
      "Property",
      property.nextWatermark,
    );

    yield* Effect.logInfo("DDF database sync: syncing members", {
      runId,
      mode: syncOptions.member.mode,
      since: syncOptions.member.since ?? null,
    });
    const member = yield* dependencies.syncMembers({
      ...syncOptions.member,
      sink,
    });
    yield* Effect.logInfo(
      "DDF database sync: members complete",
      syncResultLogDetails(member),
    );
    yield* saveIfAdvanced(dependencies.saveWatermark, "Member", member.nextWatermark);

    yield* Effect.logInfo("DDF database sync: syncing offices", {
      runId,
      mode: syncOptions.office.mode,
      since: syncOptions.office.since ?? null,
    });
    const office = yield* dependencies.syncOffices({
      ...syncOptions.office,
      sink,
    });
    yield* Effect.logInfo(
      "DDF database sync: offices complete",
      syncResultLogDetails(office),
    );
    yield* saveIfAdvanced(dependencies.saveWatermark, "Office", office.nextWatermark);

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
    });
    yield* Effect.logInfo(
      "DDF database sync: open houses complete",
      syncResultLogDetails(openHouse),
    );
    const syncErrors = [
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
    );

    const completedAt = yield* DateTime.nowAsDate;
    const hasErrors =
      property.errors.length +
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
      property: resourceSummary(property),
      member: resourceSummary(member),
      office: resourceSummary(office),
      openHouse: resourceSummary(openHouse),
    };

    yield* Effect.logInfo("DDF database sync: recording run summary", {
      runId,
      status: summary.status,
    });
    yield* dependencies.recordRun(summary, options?.destinationId);
    yield* Effect.logInfo("DDF database sync: finished", {
      runId,
      status: summary.status,
      startedAt,
      completedAt,
    });
    return summary;
  },
);
