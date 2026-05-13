import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit } from "effect";
import { chosenAorKeysFromEnv, databaseSyncOptionsFromWatermarks, parseChosenAorKeys } from "./syncDatabase";

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


  it("adds chosen AOR filters to replication resources without touching OpenHouse query", () => {
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
      "(ListAORKey in ('76','77','93')) and (StandardStatus eq 'Active')",
    );
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

  it("normalizes chosen AOR env syntax to string keys", () => {
    assert.deepEqual(parseChosenAorKeys("76,77,93"), ["76", "77", "93"]);
    assert.deepEqual(parseChosenAorKeys("[76,77,93]"), ["76", "77", "93"]);
    assert.deepEqual(parseChosenAorKeys('["76","77","93"]'), ["76", "77", "93"]);
    assert.deepEqual(parseChosenAorKeys(""), []);
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

});
