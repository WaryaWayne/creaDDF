import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit } from "effect";
import { DdfHttp } from "./client";
import type { DdfHttpApi } from "./client";
import type { DdfWatermarkScope } from "./db/schema";
import type { Destination } from "./schema/destinationSchema";
import type { SyncRecordError, SyncResource, SyncResult } from "./sync";
import {
  chosenAorKeysFromEnv,
  databaseSyncOptionsFromWatermarks,
  parseChosenAorKeys,
  syncDdfDatabaseOnce,
  syncDestinations,
  type SyncDdfDatabaseDependencies,
  type SyncDdfDatabaseOnceSummary,
} from "./syncDatabase";

const response = <T>(value: unknown) => Effect.succeed(value as T);

const emptyHttp = (overrides: Partial<DdfHttpApi>): DdfHttpApi => ({
  requestJson: <T = unknown>() => response<T>({ value: [] }),
  listOData: <T = unknown>() => response<T>({ value: [] }),
  getOData: <T = unknown>() => response<T>({}),
  replicateIdentifiers: <T = unknown>() => response<T>({ value: [] }),
  paginateOData: () => Effect.succeed([]),
  ...overrides,
});

const runWithHttp = <A, E>(
  effect: Effect.Effect<A, E, DdfHttp>,
  http: DdfHttpApi,
) => effect.pipe(Effect.provideService(DdfHttp, http));

const syncResult = (
  resource: SyncResult["resource"],
  nextWatermark: string | null,
): SyncResult => ({
  resource,
  identifiers: [],
  errors: [],
  counts: {
    identifiers: 0,
    hydrated: 0,
    persisted: 0,
    failed: 0,
  },
  nextWatermark,
});

describe("syncDdfDatabaseOnce planning", () => {
  it("turns database watermarks into since options for replication resources only", () => {
    const options = databaseSyncOptionsFromWatermarks(
      {
        property: "2024-01-01T00:00:00.000Z",
        member: "2024-01-02T00:00:00.000Z",
        office: "2024-01-03T00:00:00.000Z",
        openHouse: "2024-01-04T00:00:00.000Z",
      },
      { destinationId: 7, concurrency: 2, openHouseQuery: { filter: "ListingKey ne null" } },
    );

    assert.equal(options.property.since, "2024-01-01T00:00:00.000Z");
    assert.equal(options.member.since, "2024-01-02T00:00:00.000Z");
    assert.equal(options.office.since, "2024-01-03T00:00:00.000Z");
    assert.equal(options.property.destinationId, 7);
    assert.equal(options.openHouse.query?.filter, "ListingKey ne null");
    assert.equal("since" in options.openHouse, false);
  });


  it("keeps chosen AOR keys out of replication filters and builds hydrated record predicates", () => {
    const options = databaseSyncOptionsFromWatermarks(
      {
        property: "2024-01-01T00:00:00.000Z",
        member: "2024-01-02T00:00:00.000Z",
        office: "2024-01-03T00:00:00.000Z",
        openHouse: null,
      },
      {
        chosenAorKeys: ["76", "77", "93"],
        propertyQuery: { filter: "StandardStatus eq 'Active'" },
        memberQuery: { filter: "MemberStatus eq 'Active'" },
        officeQuery: { filter: "OfficeStatus eq 'Active'" },
        openHouseQuery: { filter: "ListingKey ne null" },
      },
    );

    assert.equal(
      options.property.query?.filter,
      "StandardStatus eq 'Active'",
    );
    assert.equal(
      options.member.query?.filter,
      "MemberStatus eq 'Active'",
    );
    assert.equal(
      options.office.query?.filter,
      "OfficeStatus eq 'Active'",
    );
    const includeProperty = options.property.includeProperty;
    const includeMember = options.member.includeMember;
    const includeOffice = options.office.includeOffice;
    assert.notEqual(includeProperty, undefined);
    assert.notEqual(includeMember, undefined);
    assert.notEqual(includeOffice, undefined);
    if (includeProperty !== undefined) {
      type IncludedProperty = Parameters<typeof includeProperty>[0];
      assert.equal(includeProperty({ ListAORKey: "77" } as IncludedProperty), true);
      assert.equal(includeProperty({ ListAORKey: "999" } as IncludedProperty), false);
    }
    if (includeMember !== undefined) {
      type IncludedMember = Parameters<typeof includeMember>[0];
      assert.equal(includeMember({ MemberAORKey: "76" } as IncludedMember), true);
      assert.equal(includeMember({ MemberAORKey: "999" } as IncludedMember), false);
    }
    if (includeOffice !== undefined) {
      type IncludedOffice = Parameters<typeof includeOffice>[0];
      assert.equal(includeOffice({ OfficeAORKey: "93" } as IncludedOffice), true);
      assert.equal(includeOffice({ OfficeAORKey: null } as IncludedOffice), false);
    }
    assert.equal(options.openHouse.query?.filter, "ListingKey ne null");
  });

  it("normalizes chosen AOR env syntax to string keys", () => {
    assert.deepEqual(parseChosenAorKeys("76,77,93"), ["76", "77", "93"]);
    assert.deepEqual(parseChosenAorKeys("[76,77,93]"), ["76", "77", "93"]);
    assert.deepEqual(parseChosenAorKeys('["76","77","93"]'), ["76", "77", "93"]);
    assert.deepEqual(parseChosenAorKeys(""), []);
  });


  it("rejects malformed chosen AOR env syntax", () => {
    for (const value of [
      "{\"0\":76}",
      "76,[77]",
      "76,",
      "76,,77",
      "[76,]",
      "[76,{}]",
      "[76,null]",
      "[76,true]",
    ]) {
      assert.throws(() => parseChosenAorKeys(value), /Invalid CREA_CHOSEN_AOR_KEYS/);
    }
  });

  it.effect("loads chosen AOR keys from CREA_CHOSEN_AOR_KEYS", () =>
    Effect.gen(function* () {
      const provider = ConfigProvider.fromUnknown({
        CREA_CHOSEN_AOR_KEYS: '["76","77","93"]',
      });
      const keys = yield* chosenAorKeysFromEnv().pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
      );

      assert.deepEqual(keys, ["76", "77", "93"]);
    }),
  );

  it.effect("fails malformed chosen AOR env values clearly", () =>
    Effect.gen(function* () {
      const provider = ConfigProvider.fromUnknown({
        CREA_CHOSEN_AOR_KEYS: "[76,]",
      });
      const exit = yield* Effect.exit(
        chosenAorKeysFromEnv().pipe(
          Effect.provideService(ConfigProvider.ConfigProvider, provider),
        ),
      );

      assert.equal(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        assert.include(String(exit.cause), "Invalid CREA_CHOSEN_AOR_KEYS");
      }
    }),
  );

  it.effect("pages destinations and persists each destination before returning counts", () =>
    Effect.gen(function* () {
      const persisted: Array<number> = [];
      const http = emptyHttp({
        listOData: <T = unknown>(path: string) => {
          assert.equal(path, "/odata/v1/Destination");
          return response<T>({
            value: [
              {
                DestinationId: 1,
                DestinationName: "First",
                DestinationUrl: null,
                DestinationType: "Technology Provider",
                DestinationStatus: "Active",
                MemberFirstName: null,
                MemberLastName: null,
                MemberKey: null,
                OriginalEntryTimestamp: null,
                ModificationTimestamp: null,
                FullNSP: false,
              },
            ],
            "@odata.nextLink": "https://ddf.test/odata/v1/Destination?$skip=1",
          });
        },
        requestJson: <T = unknown>(path: string) => {
          assert.equal(path, "https://ddf.test/odata/v1/Destination?$skip=1");
          return response<T>({
            value: [
              {
                DestinationId: 2,
                DestinationName: "Second",
                DestinationUrl: null,
                DestinationType: "Technology Provider",
                DestinationStatus: "Active",
                MemberFirstName: null,
                MemberLastName: null,
                MemberKey: null,
                OriginalEntryTimestamp: null,
                ModificationTimestamp: null,
                FullNSP: false,
              },
            ],
          });
        },
      });

      const result = yield* runWithHttp(
        syncDestinations({
          upsertDestination: (destination: Destination) =>
            Effect.sync(() => persisted.push(destination.DestinationId)),
        }),
        http,
      );

      assert.deepEqual(persisted, [1, 2]);
      assert.deepEqual(result.counts, {
        identifiers: 2,
        hydrated: 2,
        persisted: 2,
        failed: 0,
      });
    }),
  );

  it.effect("continues replication and records a partial failure when destination sync fails", () =>
    Effect.gen(function* () {
      const calls: Array<string> = [];
      const recordedErrors: Array<string> = [];
      let recorded: SyncDdfDatabaseOnceSummary | undefined;
      const destinationFailure = new Error("destination unavailable");
      const dependencies = {
        syncDestinations: () =>
          Effect.fail(destinationFailure),
        syncProperties: () =>
          Effect.sync(() => {
            calls.push("properties");
            return syncResult("Property", "2024-01-01T00:00:00.000Z");
          }),
        syncMembers: () =>
          Effect.sync(() => {
            calls.push("members");
            return syncResult("Member", null);
          }),
        syncOffices: () =>
          Effect.sync(() => {
            calls.push("offices");
            return syncResult("Office", null);
          }),
        syncOpenHouses: () =>
          Effect.sync(() => {
            calls.push("openHouses");
            return syncResult("OpenHouse", null);
          }),
        loadWatermark: () => Effect.succeed(null),
        saveWatermark: () => Effect.void,
        runMigrations: () => Effect.void,
        makeSink: () =>
          Effect.succeed({
            upsertDestination: () => Effect.void,
            recordSyncError: (error: SyncRecordError) =>
              Effect.sync(() => recordedErrors.push(`${error.resource}:${error.key}`)),
          }),
        loadOpenHouseListingScopes: () => Effect.succeed([]),
        recordRun: (summary: SyncDdfDatabaseOnceSummary) =>
          Effect.sync(() => {
            recorded = summary;
          }),
      } as unknown as Partial<SyncDdfDatabaseDependencies>;

      const summary = yield* syncDdfDatabaseOnce({
        runMigrations: false,
        dependencies,
      }) as Effect.Effect<SyncDdfDatabaseOnceSummary>;

      assert.deepEqual(calls, ["properties", "members", "offices", "openHouses"]);
      assert.deepEqual(recordedErrors, ["Destination:destination-sync"]);
      assert.equal(summary.status, "partial_failure");
      assert.equal(summary.destination.counts.failed, 1);
      assert.equal(summary.destination.errors[0]?.message.includes("destination unavailable"), true);
      assert.equal(recorded?.status, "partial_failure");
    }),
  );

  it.effect("syncs destinations and saves replication watermarks with the current DB scope", () =>
    Effect.gen(function* () {
      const calls: Array<string> = [];
      const savedScopes: Array<{
        readonly resource: string;
        readonly watermark: string;
        readonly destinationId: number | null;
        readonly chosenAorKeys: ReadonlyArray<string>;
      }> = [];
      let recorded: SyncDdfDatabaseOnceSummary | undefined;
      const destination = {
        DestinationId: 7,
        DestinationName: "Website Feed",
        DestinationUrl: null,
        DestinationType: "Technology Provider",
        DestinationStatus: "Active",
        MemberFirstName: null,
        MemberLastName: null,
        MemberKey: null,
        OriginalEntryTimestamp: null,
        ModificationTimestamp: null,
        FullNSP: false,
      } as Destination;
      const destinationResult: SyncResult<Destination> = {
        resource: "Destination",
        identifiers: [destination],
        errors: [],
        counts: {
          identifiers: 1,
          hydrated: 1,
          persisted: 1,
          failed: 0,
        },
        nextWatermark: null,
      };
      const dependencies = {
        syncDestinations: (
          _sink: Parameters<typeof syncDestinations>[0],
          query: Parameters<typeof syncDestinations>[1],
        ) =>
          Effect.sync(() => {
            calls.push(`destinations:${query?.top ?? "all"}`);
            return destinationResult;
          }),
        syncProperties: () =>
          Effect.sync(() => {
            calls.push("properties");
            return syncResult("Property", "2024-01-01T00:00:00.000Z");
          }),
        syncMembers: () =>
          Effect.sync(() => {
            calls.push("members");
            return syncResult("Member", "2024-01-02T00:00:00.000Z");
          }),
        syncOffices: () =>
          Effect.sync(() => {
            calls.push("offices");
            return syncResult("Office", "2024-01-03T00:00:00.000Z");
          }),
        syncOpenHouses: () =>
          Effect.sync(() => {
            calls.push("openHouses");
            return syncResult("OpenHouse", null);
          }),
        loadWatermark: (resource: SyncResource, scope?: DdfWatermarkScope) =>
          Effect.sync(() => {
            calls.push(`load:${resource}:${scope?.destinationId ?? "global"}:${scope?.chosenAorKeys.join(",") ?? ""}`);
            return null;
          }),
        saveWatermark: (
          resource: SyncResource,
          watermark: string,
          scope?: DdfWatermarkScope,
        ) =>
          Effect.sync(() => {
            savedScopes.push({
              resource,
              watermark,
              destinationId: scope?.destinationId ?? null,
              chosenAorKeys: scope?.chosenAorKeys ?? [],
            });
          }),
        runMigrations: () => Effect.void,
        makeSink: () =>
          Effect.succeed({
            upsertDestination: () => Effect.void,
            recordSyncError: () => Effect.void,
          }),
        loadOpenHouseListingScopes: () => Effect.succeed([]),
        recordRun: (summary: SyncDdfDatabaseOnceSummary) =>
          Effect.sync(() => {
            recorded = summary;
          }),
      } as unknown as Partial<SyncDdfDatabaseDependencies>;

      const sync = syncDdfDatabaseOnce({
        runMigrations: false,
        destinationId: 7,
        destinationQuery: { top: 50 },
        chosenAorKeys: ["93", "76"],
        dependencies,
      }) as Effect.Effect<SyncDdfDatabaseOnceSummary>;
      const summary = yield* sync;

      assert.equal(calls[0], "destinations:50");
      assert.include(calls, "properties");
      assert.include(calls, "members");
      assert.include(calls, "offices");
      assert.include(calls, "openHouses");
      assert.deepEqual(savedScopes, [
        {
          resource: "Property",
          watermark: "2024-01-01T00:00:00.000Z",
          destinationId: 7,
          chosenAorKeys: ["93", "76"],
        },
        {
          resource: "Member",
          watermark: "2024-01-02T00:00:00.000Z",
          destinationId: 7,
          chosenAorKeys: ["93", "76"],
        },
        {
          resource: "Office",
          watermark: "2024-01-03T00:00:00.000Z",
          destinationId: 7,
          chosenAorKeys: ["93", "76"],
        },
      ]);
      assert.equal(summary.destination.counts.persisted, 1);
      assert.equal(recorded?.destination.counts.persisted, 1);
    }),
  );

});
