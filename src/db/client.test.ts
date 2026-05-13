import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import {
  DdfDbClientValidationError,
  coListAgentKeysFromRow,
  coListOfficeKeysFromRow,
  groupRowsBy,
  projectionPlan,
  embeddedMediaIncludeRows,
  embeddedRoomIncludeRows,
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
      "modificationTimestamp",
      "primaryMediaUrl",
    ]);
    assert.equal(propertyFieldPresets.card.join(",").includes("raw"), false);
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

  it("projects property/member/office media includes from JSONB columns", () => {
    const media = [
      { MediaKey: "media-2", MediaURL: "https://example.test/second.jpg", Order: 2 },
      { MediaKey: "media-1", MediaURL: "https://example.test/first.jpg", Order: 1 },
    ];

    assert.deepEqual(embeddedMediaIncludeRows({ listingKey: "listing-1", media }, "Property", "listingKey"), [
      { mediaKey: "media-1", mediaUrl: "https://example.test/first.jpg", sortOrder: 1 },
      { mediaKey: "media-2", mediaUrl: "https://example.test/second.jpg", sortOrder: 2 },
    ]);
    assert.deepEqual(embeddedMediaIncludeRows({ memberKey: "member-1", media }, "Member", "memberKey", { select: ["mediaUrl"] }), [
      { mediaUrl: "https://example.test/first.jpg" },
      { mediaUrl: "https://example.test/second.jpg" },
    ]);
    assert.deepEqual(embeddedMediaIncludeRows({ officeKey: "office-1", media }, "Office", "officeKey", { select: ["resource", "resourceKey", "mediaKey"] }), [
      { resource: "Office", resourceKey: "office-1", mediaKey: "media-1" },
      { resource: "Office", resourceKey: "office-1", mediaKey: "media-2" },
    ]);
  });

  it("projects property room includes from JSONB columns", () => {
    assert.deepEqual(embeddedRoomIncludeRows({ listingKey: "listing-1", rooms: [{ RoomKey: "room-1", RoomType: "Kitchen", RoomLevel: "Main" }] }), [
      { roomKey: "room-1", roomType: "Kitchen", roomLevel: "Main" },
    ]);
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
