import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import {
  DdfDbClientValidationError,
  coListAgentKeysFromRow,
  coListOfficeKeysFromRow,
  groupRowsBy,
  projectionPlan,
  embeddedMediaRowsFromColumn,
  embeddedRoomRowsFromColumn,
  propertyFieldPresets,
  validateListOptions,
} from "./client";

describe("database read client helpers", () => {
  it("keeps website field presets free of raw payloads by default", () => {
    assert.deepEqual(propertyFieldPresets.card, [
      "listingKey",
      "listPrice",
      "city",
      "province",
      "propertySubType",
      "bedroomsTotal",
      "bathroomsTotalInteger",
      "primaryMediaUrl",
      "modificationTimestamp",
    ]);
    assert.equal(propertyFieldPresets.card.join(",").includes("raw"), false);
  });


  it("projects embedded JSONB property/member/office media and property rooms for includes", () => {
    const media = [
      { MediaKey: "media-2", MediaURL: "https://example.test/second.jpg", Order: 2 },
      { MediaKey: "media-1", MediaURL: "https://example.test/first.jpg", Order: 1 },
    ];

    assert.deepEqual(embeddedMediaRowsFromColumn(media, "Property", "listing-1"), [
      {
        mediaKey: "media-1",
        resource: "Property",
        resourceKey: "listing-1",
        resourceRecordId: null,
        resourceRecordKey: null,
        resourceName: null,
        modificationTimestamp: null,
        mediaUrl: "https://example.test/first.jpg",
        mediaCategory: null,
        longDescription: null,
        preferredPhoto: null,
        sortOrder: 1,
        raw: media[1],
      },
      {
        mediaKey: "media-2",
        resource: "Property",
        resourceKey: "listing-1",
        resourceRecordId: null,
        resourceRecordKey: null,
        resourceName: null,
        modificationTimestamp: null,
        mediaUrl: "https://example.test/second.jpg",
        mediaCategory: null,
        longDescription: null,
        preferredPhoto: null,
        sortOrder: 2,
        raw: media[0],
      },
    ]);
    assert.equal(embeddedMediaRowsFromColumn(media, "Member", "member-1")[0]?.resourceKey, "member-1");
    assert.equal(embeddedMediaRowsFromColumn(media, "Office", "office-1")[0]?.resourceKey, "office-1");
    assert.deepEqual(
      embeddedRoomRowsFromColumn([{ RoomKey: "room-1", RoomType: "Kitchen", RoomLevel: "Main" }], {
        listingKey: "listing-1",
        listingId: "L123",
      }),
      [{
        roomKey: "room-1",
        listingKey: "listing-1",
        listingId: "L123",
        modificationTimestamp: null,
        roomDescription: null,
        roomDimensions: null,
        roomLength: null,
        roomLevel: "Main",
        roomWidth: null,
        roomLengthWidthUnits: null,
        roomType: "Kitchen",
        raw: { RoomKey: "room-1", RoomType: "Kitchen", RoomLevel: "Main" },
      }],
    );
  });

  it("only includes raw when explicitly requested", () => {
    const defaultPlan = projectionPlan<"listingKey" | "raw">(["listingKey", "raw"], {
      select: ["listingKey", "raw"],
    });
    const rawPlan = projectionPlan<"listingKey" | "raw">(["listingKey"], {
      includeRaw: true,
    });

    assert.deepEqual(defaultPlan.fields, ["listingKey"]);
    assert.equal(defaultPlan.includesRaw, false);
    assert.deepEqual(rawPlan.fields, ["listingKey", "raw"]);
    assert.equal(rawPlan.includesRaw, true);
  });

  it("groups related rows by parent key for batched include assembly", () => {
    const grouped = groupRowsBy(
      [
        { listingKey: "listing-1", mediaKey: "media-1" },
        { listingKey: "listing-1", mediaKey: "media-2" },
        { listingKey: "listing-2", mediaKey: "media-3" },
        { listingKey: null, mediaKey: "ignored" },
      ],
      "listingKey",
    );

    assert.deepEqual(grouped.get("listing-1"), [
      { listingKey: "listing-1", mediaKey: "media-1" },
      { listingKey: "listing-1", mediaKey: "media-2" },
    ]);
    assert.deepEqual(grouped.get("listing-2"), [
      { listingKey: "listing-2", mediaKey: "media-3" },
    ]);
    assert.equal(grouped.has("ignored"), false);
  });

  it("reads property co-list keys from typed row columns", () => {
    const propertyRow = {
      coListAgentKey: "agent-2",
      coListAgentKey2: "agent-3",
      coListAgentKey3: "agent-2",
      coListOfficeKey: "office-2",
      coListOfficeKey2: "office-3",
      coListOfficeKey3: null,
    };

    assert.deepEqual(coListAgentKeysFromRow(propertyRow), ["agent-2", "agent-3"]);
    assert.deepEqual(coListOfficeKeysFromRow(propertyRow), ["office-2", "office-3"]);
  });

  it.effect("validates pagination options as typed Effect failures", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        validateListOptions("properties.list", { limit: 0 }),
      );
      const failure = Exit.findErrorOption(exit);

      assert.equal(Exit.isFailure(exit), true);
      assert.equal(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.equal(failure.value instanceof DdfDbClientValidationError, true);
        assert.equal(failure.value.message, "limit must be an integer from 1 to 500");
      }
    }),
  );
});
