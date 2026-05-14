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

});
