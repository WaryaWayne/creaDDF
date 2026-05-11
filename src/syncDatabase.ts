import { DateTime, Effect } from "effect";
import { randomUUID } from "node:crypto";
import type {
  MemberSyncOptions,
  OfficeSyncOptions,
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
import { ddfSyncRuns } from "./db/schema";
import {
  loadDatabaseWatermark,
  saveDatabaseWatermark,
} from "./db/watermarks";

export interface SyncDdfDatabaseOnceOptions {
  readonly runMigrations?: boolean;
  readonly destinationId?: number;
  readonly concurrency?: number;
  readonly propertyQuery?: PropertySyncOptions["query"];
  readonly memberQuery?: MemberSyncOptions["query"];
  readonly officeQuery?: OfficeSyncOptions["query"];
  readonly openHouseQuery?: OpenHouseSyncOptions["query"];
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
  readonly recordRun: (summary: SyncDdfDatabaseOnceSummary, destinationId?: number) => Effect.Effect<void, unknown, DdfDatabase>;
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

const openHouseQueryWithSince = (
  query: OpenHouseSyncOptions["query"],
  since: string | null,
): OpenHouseSyncOptions["query"] =>
  since === null
    ? query
    : {
        ...query,
        filter:
          query?.filter === undefined
            ? `OpenHouseDate ge ${since}`
            : `(${query.filter}) and OpenHouseDate ge ${since}`,
      };


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
    query: openHouseQueryWithSince(options?.openHouseQuery, watermarks.openHouse),
    concurrency: options?.concurrency,
  } satisfies Omit<OpenHouseSyncOptions, "sink">,
});
const saveIfAdvanced = Effect.fn("DdfDatabaseSync.saveIfAdvanced")(function* (
  saveWatermark: SyncDdfDatabaseDependencies["saveWatermark"],
  resource: Parameters<typeof saveDatabaseWatermark>[0],
  watermark: string | null,
) {
  if (watermark !== null) yield* saveWatermark(resource, watermark);
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
      });
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
  recordRun: recordRunSummary,
};

export const syncDdfDatabaseOnce = Effect.fn("DdfDatabaseSync.syncOnce")(
  function* (options?: SyncDdfDatabaseOnceOptions) {
    const dependencies = { ...defaultDependencies, ...options?.dependencies };
    if (options?.runMigrations ?? true) {
      yield* dependencies.runMigrations();
    }

    const runId = `ddf-sync-${randomUUID()}`;
    const startedAt = yield* DateTime.nowAsDate;
    const sink = yield* dependencies.makeSink({ runId });

    const [propertyWatermark, memberWatermark, officeWatermark, openHouseWatermark] =
      yield* Effect.all([
        dependencies.loadWatermark("Property"),
        dependencies.loadWatermark("Member"),
        dependencies.loadWatermark("Office"),
        dependencies.loadWatermark("OpenHouse"),
      ]);

    const syncOptions = databaseSyncOptionsFromWatermarks({
      property: propertyWatermark,
      member: memberWatermark,
      office: officeWatermark,
      openHouse: openHouseWatermark,
    }, options);

    const property = yield* dependencies.syncProperties({
      ...syncOptions.property,
      sink,
    });
    yield* saveIfAdvanced(
      dependencies.saveWatermark,
      "Property",
      property.nextWatermark,
    );

    const member = yield* dependencies.syncMembers({
      ...syncOptions.member,
      sink,
    });
    yield* saveIfAdvanced(dependencies.saveWatermark, "Member", member.nextWatermark);

    const office = yield* dependencies.syncOffices({
      ...syncOptions.office,
      sink,
    });
    yield* saveIfAdvanced(dependencies.saveWatermark, "Office", office.nextWatermark);

    const openHouse = yield* dependencies.syncOpenHouses({
      ...syncOptions.openHouse,
      sink,
    });
    yield* saveIfAdvanced(
      dependencies.saveWatermark,
      "OpenHouse",
      openHouse.nextWatermark,
    );

    yield* Effect.forEach(
      [...property.errors, ...member.errors, ...office.errors, ...openHouse.errors],
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

    yield* dependencies.recordRun(summary, options?.destinationId);
    return summary;
  },
);
