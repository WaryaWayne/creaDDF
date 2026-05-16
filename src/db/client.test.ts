import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Exit } from "effect";
import {
  DdfDbClientValidationError,
  coListAgentKeysFromRow,
  coListOfficeKeysFromRow,
  embeddedMediaRowsFromColumn,
  embeddedRoomRowsFromColumn,
  embeddedSocialMediaRowsFromColumn,
  groupRowsBy,
  projectionPlan,
  propertyFieldPresets,
  validateListOptions,
} from "./client";

describe("database read client helpers", () => {
  it("keeps website field presets free of raw payloads by default", () => {
    assert.deepEqual(propertyFieldPresets.card, [
      "listingKey",
      "listPrice",
      "leaseAmount",
      "leaseAmountFrequency",
      "totalActualRent",
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
    const timestamp = DateTime.makeUnsafe("2024-01-02T03:04:05.000Z");
    const media = [
      { MediaKey: "media-2", MediaURL: "https://example.test/second.jpg", Order: 2 },
      {
        MediaKey: "media-1",
        MediaURL: "https://example.test/first.jpg",
        ModificationTimestamp: timestamp,
        Order: 1,
      },
    ];

    const mediaRows = embeddedMediaRowsFromColumn(media, "Property", "listing-1");

    assert.equal(mediaRows[0]?.mediaKey, "media-1");
    assert.equal(mediaRows[0]?.resource, "Property");
    assert.equal(mediaRows[0]?.resourceKey, "listing-1");
    assert.equal((mediaRows[0]?.modificationTimestamp as Date | null)?.toISOString(), "2024-01-02T03:04:05.000Z");
    assert.equal(mediaRows[1]?.mediaKey, "media-2");
    assert.equal(embeddedMediaRowsFromColumn(media, "Member", "member-1")[0]?.resourceKey, "member-1");
    assert.equal(embeddedMediaRowsFromColumn(media, "Office", "office-1")[0]?.resourceKey, "office-1");
    const socialRows = embeddedSocialMediaRowsFromColumn([
      {
        SocialMediaKey: "social-1",
        SocialMediaType: "Website",
        SocialMediaUrlOrId: "https://example.test/profile",
        ModificationTimestamp: timestamp,
      },
    ], "Member", "member-1");
    assert.equal(socialRows[0]?.socialMediaKey, "social-1");
    assert.equal(socialRows[0]?.resource, "Member");
    assert.equal(socialRows[0]?.resourceKey, "member-1");
    assert.equal((socialRows[0]?.modificationTimestamp as Date | null)?.toISOString(), "2024-01-02T03:04:05.000Z");
    const roomRows = embeddedRoomRowsFromColumn([{
      RoomKey: "room-1",
      RoomType: "Kitchen",
      RoomLevel: "Main level",
      ModificationTimestamp: timestamp,
    }], {
      listingKey: "listing-1",
      listingId: "L123",
    });

    assert.equal(roomRows[0]?.roomKey, "room-1");
    assert.equal(roomRows[0]?.listingKey, "listing-1");
    assert.equal(roomRows[0]?.listingId, "L123");
    assert.equal((roomRows[0]?.modificationTimestamp as Date | null)?.toISOString(), "2024-01-02T03:04:05.000Z");
    assert.equal(roomRows[0]?.roomLevel, "Main level");
    assert.equal(roomRows[0]?.roomType, "Kitchen");
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
