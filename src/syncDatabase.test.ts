import { assert, describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import {
  databaseSyncOptionsFromWatermarks,
  parseChosenAorKeys,
} from "./syncDatabase";

const exitForParse = (value: string) => Effect.runSyncExit(parseChosenAorKeys(value));

describe("chosen AOR key config", () => {
  it("normalizes empty, comma-separated, and JSON-ish env values", () => {
    assert.deepEqual(Effect.runSync(parseChosenAorKeys("")), []);
    assert.deepEqual(Effect.runSync(parseChosenAorKeys("76,77,93")), ["76", "77", "93"]);
    assert.deepEqual(Effect.runSync(parseChosenAorKeys("[76,77,93]")), ["76", "77", "93"]);
    assert.deepEqual(Effect.runSync(parseChosenAorKeys('["76","77","93"]')), ["76", "77", "93"]);
  });

  it("fails clearly on malformed chosen AOR env values", () => {
    const exit = exitForParse('["76",]');

    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("DdfChosenAorKeysConfigError");
      expect(String(exit.cause)).toContain("Malformed CREA_CHOSEN_AOR_KEYS");
    }
  });
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

  it("adds chosen AOR filters before caller filters for replication resources", () => {
    const options = databaseSyncOptionsFromWatermarks(
      {
        property: "2024-01-01T00:00:00.000Z",
        member: "2024-01-02T00:00:00.000Z",
        office: "2024-01-03T00:00:00.000Z",
        openHouse: null,
      },
      {
        chosenAorKeys: ["76", "77", "9'3"],
        propertyQuery: { filter: "StandardStatus eq 'Active'" },
        memberQuery: { filter: "MemberStatus eq 'Active'" },
        officeQuery: { filter: "OfficeStatus eq 'Active'" },
        openHouseQuery: { filter: "OpenHouseStatus eq 'Active'" },
      },
    );

    assert.equal(
      options.property.query?.filter,
      "(ListAORKey in ('76','77','9''3')) and (StandardStatus eq 'Active')",
    );
    assert.equal(
      options.member.query?.filter,
      "(MemberAORKey in ('76','77','9''3')) and (MemberStatus eq 'Active')",
    );
    assert.equal(
      options.office.query?.filter,
      "(OfficeAORKey in ('76','77','9''3')) and (OfficeStatus eq 'Active')",
    );
    assert.equal(options.openHouse.query?.filter, "OpenHouseStatus eq 'Active'");
  });

  it("leaves replication filters untouched when no chosen AOR keys are configured", () => {
    const options = databaseSyncOptionsFromWatermarks(
      { property: null, member: null, office: null, openHouse: null },
      {
        chosenAorKeys: [],
        propertyQuery: { filter: "StandardStatus eq 'Active'" },
      },
    );

    assert.equal(options.property.query?.filter, "StandardStatus eq 'Active'");
    assert.equal(options.member.query, undefined);
    assert.equal(options.office.query, undefined);
  });
});
