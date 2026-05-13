import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";
import { OpenHouseSchema } from "./openHouse";

const decodeOpenHouse = Schema.decodeUnknownEffect(OpenHouseSchema);

const baseOpenHouse = {
  OpenHouseKey: "open-house-1",
  ListingKey: null,
  ListingId: null,
  OpenHouseStartTime: null,
  OpenHouseEndTime: null,
  OpenHouseRemarks: null,
  OpenHouseType: null,
  OpenHouseStatus: null,
  LivestreamOpenHouseURL: null,
};

describe("OpenHouseSchema", () => {
  it.effect("accepts strict calendar dates and RFC3339 date-times", () =>
    Effect.gen(function* () {
      const date = yield* decodeOpenHouse({
        ...baseOpenHouse,
        OpenHouseDate: "2024-02-29",
      });
      const dateTime = yield* decodeOpenHouse({
        ...baseOpenHouse,
        OpenHouseDate: "2024-02-29T12:30:45.000Z",
      });

      assert.equal(date.OpenHouseDate, "2024-02-29");
      assert.equal(dateTime.OpenHouseDate, "2024-02-29T12:30:45.000Z");
    }),
  );

  it.effect("rejects invalid calendar dates and loose date-times", () =>
    Effect.gen(function* () {
      const invalidDate = yield* Effect.exit(
        decodeOpenHouse({ ...baseOpenHouse, OpenHouseDate: "2024-02-30" }),
      );
      const invalidDateTime = yield* Effect.exit(
        decodeOpenHouse({
          ...baseOpenHouse,
          OpenHouseDate: "2024-02-30T00:00:00.000Z",
        }),
      );
      const looseDateTime = yield* Effect.exit(
        decodeOpenHouse({
          ...baseOpenHouse,
          OpenHouseDate: "2024-02-29T12:30:45",
        }),
      );

      assert.equal(Exit.isFailure(invalidDate), true);
      assert.equal(Exit.isFailure(invalidDateTime), true);
      assert.equal(Exit.isFailure(looseDateTime), true);
    }),
  );
});
