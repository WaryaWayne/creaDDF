import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit } from "effect";
import { DdfHttp } from "./client";
import { syncProperties } from "./sync";
import {
  chosenAorKeysFromEnv,
  databaseSyncOptionsFromWatermarks,
  parseChosenAorKeys,
} from "./syncDatabase";

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

  it("adds chosen AOR filters before caller filters for replication resources", () => {
    const options = databaseSyncOptionsFromWatermarks(
      {
        property: "2024-01-01T00:00:00.000Z",
        member: "2024-01-02T00:00:00.000Z",
        office: "2024-01-03T00:00:00.000Z",
        openHouse: null,
      },
      {
        chosenAorKeys: ["76", "77", "93"],
        propertyQuery: { filter: "StandardStatus eq 'Active'", count: true },
        memberQuery: { filter: "MemberStatus eq 'Active'" },
        officeQuery: { filter: "OfficeStatus eq 'Active'" },
        openHouseQuery: { filter: "ListingKey ne null" },
      },
    );

    assert.equal(
      options.property.query?.filter,
      "(ListAORKey in ('76','77','93')) and (StandardStatus eq 'Active')",
    );
    assert.equal(options.property.query?.count, true);
    assert.equal(
      options.member.query?.filter,
      "(MemberAORKey in ('76','77','93')) and (MemberStatus eq 'Active')",
    );
    assert.equal(
      options.office.query?.filter,
      "(OfficeAORKey in ('76','77','93')) and (OfficeStatus eq 'Active')",
    );
    assert.equal(options.openHouse.query?.filter, "ListingKey ne null");
  });

  it.effect("lets property AOR, caller, and incremental watermark filters compose in the sync request", () =>
    Effect.gen(function* () {
      const paths: Array<string> = [];
      const syncOptions = databaseSyncOptionsFromWatermarks(
        {
          property: "2024-01-01T00:00:00.000Z",
          member: null,
          office: null,
          openHouse: null,
        },
        {
          chosenAorKeys: ["76", "77"],
          propertyQuery: { filter: "StandardStatus eq 'Active'" },
        },
      );

      yield* syncProperties(syncOptions.property).pipe(
        Effect.provideService(DdfHttp, {
          requestJson: <T = unknown>(path: string) =>
            Effect.sync(() => {
              paths.push(path);
              return { value: [] } as T;
            }),
          listOData: <T = unknown>() => Effect.succeed({ value: [] } as T),
          getOData: <T = unknown>() => Effect.succeed({} as T),
          replicateIdentifiers: <T = unknown>() => Effect.succeed({ value: [] } as T),
          paginateOData: () => Effect.succeed([]),
        }),
      );

      assert.equal(decodeURIComponent(paths[0] ?? ""),
        "/odata/v1/Property/PropertyReplication?$filter=((ListAORKey in ('76','77')) and (StandardStatus eq 'Active')) and ModificationTimestamp gt 2024-01-01T00:00:00.000Z&$orderby=ModificationTimestamp asc,ListingKey asc",
      );
    }),
  );

  it.effect("parses chosen AOR env values as normalized string keys", () =>
    Effect.gen(function* () {
      assert.deepEqual(yield* parseChosenAorKeys("76, 77,93"), ["76", "77", "93"]);
      assert.deepEqual(yield* parseChosenAorKeys("[76,77,93]"), ["76", "77", "93"]);
      assert.deepEqual(yield* parseChosenAorKeys('["76","77","93"]'), ["76", "77", "93"]);
      assert.deepEqual(yield* parseChosenAorKeys(""), []);
    }),
  );

  it.effect("loads chosen AOR keys through Effect Config", () =>
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

  it.effect("fails clearly when chosen AOR keys are malformed", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(parseChosenAorKeys("[76,"));

      assert.equal(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        assert.include(String(exit.cause), "Invalid CREA_CHOSEN_AOR_KEYS");
      }
    }),
  );
});
