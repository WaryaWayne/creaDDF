import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import {
  DdfDbClientValidationError,
  coListAgentKeysFromRow,
  coListOfficeKeysFromRow,
  embeddedMediaRows,
  embeddedRoomRows,
  groupRowsBy,
  projectionPlan,
  propertyFieldPresets,
  validateListOptions,
} from "./client";

describe("database read client helpers", () => {
  it("keeps website field presets free of raw payloads by default", () => {
    assert.deepEqual(propertyFieldPresets.card, [
      "listingKey",
      "primaryMediaUrl",
      "listPrice",
      "city",
      "province",
      "propertySubType",
      "bedroomsTotal",
      "bathroomsTotalInteger",
      "modificationTimestamp",
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

  it("builds property, member, and office media includes from embedded JSONB columns", () => {
    const propertyRows = [{
      listingKey: "listing-1",
      media: [{ MediaKey: "property-media-1", MediaURL: "https://example.test/property.jpg", Order: 2 }],
    }];
    const memberRows = [{
      memberKey: "member-1",
      media: [{ MediaKey: "member-media-1", MediaURL: "https://example.test/member.jpg", Order: 1 }],
    }];
    const officeRows = [{
      officeKey: "office-1",
      media: [{ MediaKey: "office-media-1", MediaURL: "https://example.test/office.jpg", Order: 3 }],
    }];

    assert.deepEqual(embeddedMediaRows(propertyRows, "listingKey", "Property").get("listing-1"), [
      { mediaKey: "property-media-1", mediaUrl: "https://example.test/property.jpg", sortOrder: 2 },
    ]);
    assert.deepEqual(embeddedMediaRows(memberRows, "memberKey", "Member").get("member-1"), [
      { mediaKey: "member-media-1", mediaUrl: "https://example.test/member.jpg", sortOrder: 1 },
    ]);
    assert.deepEqual(embeddedMediaRows(officeRows, "officeKey", "Office").get("office-1"), [
      { mediaKey: "office-media-1", mediaUrl: "https://example.test/office.jpg", sortOrder: 3 },
    ]);
  });

  it("builds property room includes from embedded JSONB columns", () => {
    const propertyRows = [{
      listingKey: "listing-1",
      listingId: "L1",
      rooms: [{ RoomKey: "room-1", RoomType: "Kitchen", RoomLevel: "Main" }],
    }];

    assert.deepEqual(embeddedRoomRows(propertyRows).get("listing-1"), [
      { roomKey: "room-1", roomType: "Kitchen", roomLevel: "Main" },
    ]);
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
