import { assert, describe, it } from "@effect/vitest";
import { databaseSyncOptionsFromWatermarks } from "./syncDatabase";

describe("syncDdfDatabaseOnce planning", () => {
  it("turns database watermarks into since options for each resource", () => {
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
  });
});
