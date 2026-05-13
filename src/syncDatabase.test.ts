import { assert, describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit } from "effect";
import {
  chosenAorKeysFromConfig,
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

  it("adds chosen AOR filters before caller filters while preserving watermark planning", () => {
    const options = databaseSyncOptionsFromWatermarks(
      {
        property: "2024-01-01T00:00:00.000Z",
        member: "2024-01-02T00:00:00.000Z",
        office: "2024-01-03T00:00:00.000Z",
        openHouse: null,
      },
      {
        chosenAorKeys: ["76", "77"],
        propertyQuery: { filter: "StandardStatus eq 'Active'", select: ["ListingKey"] },
        memberQuery: { filter: "MemberStatus eq 'Active'" },
        officeQuery: { filter: "OfficeStatus eq 'Active'" },
      },
    );

    assert.equal(
      options.property.query?.filter,
      "(ListAORKey in ('76','77')) and (StandardStatus eq 'Active')",
    );
    assert.deepEqual(options.property.query?.select, ["ListingKey"]);
    assert.equal(
      options.member.query?.filter,
      "(MemberAORKey in ('76','77')) and (MemberStatus eq 'Active')",
    );
    assert.equal(
      options.office.query?.filter,
      "(OfficeAORKey in ('76','77')) and (OfficeStatus eq 'Active')",
    );
    assert.equal(options.property.mode, "incremental");
    assert.equal(options.property.since, "2024-01-01T00:00:00.000Z");
  });

  it("leaves replication filters unchanged when chosen AOR keys are unset", () => {
    const options = databaseSyncOptionsFromWatermarks(
      { property: null, member: null, office: null, openHouse: null },
      { propertyQuery: { filter: "City eq 'Ottawa'" } },
    );

    assert.equal(options.property.query?.filter, "City eq 'Ottawa'");
    assert.equal(options.member.query, undefined);
    assert.equal(options.office.query, undefined);
  });
});

describe("chosen AOR key config", () => {
  it.effect.each([
    [undefined, []],
    ["", []],
    ["76,77,93", ["76", "77", "93"]],
    ["[76,77,93]", ["76", "77", "93"]],
    ['["76","77","93"]', ["76", "77", "93"]],
  ] as const)("parses %o", ([raw, expected]) =>
    Effect.gen(function* () {
      const parsed = yield* parseChosenAorKeys(raw);
      assert.deepEqual(parsed, expected);
    }),
  );

  it.effect.each(["[76,]", "76,,77", "{}", "[true]"])(
    "fails malformed value %s clearly",
    (raw) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(parseChosenAorKeys(raw));
        assert.equal(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          expect(String(exit.cause)).toContain("Invalid CREA_CHOSEN_AOR_KEYS");
        }
      }),
  );

  it.effect("loads chosen AOR keys from Effect config", () =>
    Effect.gen(function* () {
      const provider = ConfigProvider.fromUnknown({
        CREA_CHOSEN_AOR_KEYS: '["76","77","93"]',
      });
      const parsed = yield* chosenAorKeysFromConfig().pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
      );
      assert.deepEqual(parsed, ["76", "77", "93"]);
    }),
  );
});
