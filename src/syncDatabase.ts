import { eq } from "drizzle-orm";
import { Data, DateTime, Effect } from "effect";
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
  readonly loadOpenHouseListingScopes: () => Effect.Effect<
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
)(function* () {
  const { db } = yield* DdfDatabase;
  return yield* db
    .select({
      listingKey: ddfProperties.listingKey,
      listingId: ddfProperties.listingId,
    })
    .from(ddfProperties)
    .where(eq(ddfProperties.active, true))
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
  >,
) => ({
  property: {
    mode: watermarks.property === null ? "initial" : "incremental",
    since: watermarks.property ?? undefined,
    destinationId: options?.destinationId,
    concurrency: options?.concurrency,
    query: options?.propertyQuery,
  } satisfies Omit<PropertySyncOptions, "sink">,
  member: {
    mode: watermarks.member === null ? "initial" : "incremental",
    since: watermarks.member ?? undefined,
    destinationId: options?.destinationId,
    concurrency: options?.concurrency,
    query: options?.memberQuery,
  } satisfies Omit<MemberSyncOptions, "sink">,
  office: {
    mode: watermarks.office === null ? "initial" : "incremental",
    since: watermarks.office ?? undefined,
    destinationId: options?.destinationId,
    concurrency: options?.concurrency,
    query: options?.officeQuery,
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

    const syncOptions = databaseSyncOptionsFromWatermarks({
      property: propertyWatermark,
      member: memberWatermark,
      office: officeWatermark,
      openHouse: null,
    }, options);
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

    const openHouseListingScopes = yield* dependencies.loadOpenHouseListingScopes();
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
