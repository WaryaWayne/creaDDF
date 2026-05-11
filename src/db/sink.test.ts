import { assert, describe, it } from "@effect/vitest";
import { Cause } from "effect";
import {
  mediaRowFromRecord,
  propertyRowFromRecord,
  roomRowFromRecord,
  serializeSyncRecordError,
} from "./sink";

describe("database sync sink row mapping", () => {
  it("preserves raw property payloads and stable keys", () => {
    const property = {
      ListingKey: "listing-1",
      ModificationTimestamp: "2024-01-01T00:00:00.000Z",
      ListOfficeKey: "office-1",
      ListAgentKey: "member-1",
      StandardStatus: "Active",
      City: "Ottawa",
      StateOrProvince: "ON",
      Latitude: 45.42,
      Longitude: -75.69,
    };

    const row = propertyRowFromRecord(property);

    assert.equal(row.listingKey, "listing-1");
    assert.equal(row.listOfficeKey, "office-1");
    assert.equal(row.listAgentKey, "member-1");
    assert.equal(row.latitude, "45.42");
    assert.equal(row.longitude, "-75.69");
    assert.equal(row.raw, property);
  });

  it("derives stable room and media ownership keys", () => {
    const property = { ListingKey: "listing-1" };
    const room = { RoomKey: "room-1", RoomType: "Kitchen", RoomLevel: "Main" };
    const media = { MediaKey: "media-1", MediaURL: "https://example.test/a.jpg", Order: 2 };

    assert.deepEqual(roomRowFromRecord(room, property), {
      listingKey: "listing-1",
      roomKey: "room-1",
      roomType: "Kitchen",
      roomLevel: "Main",
      raw: room,
    });
    assert.deepEqual(mediaRowFromRecord(media, { resource: "Property", key: "listing-1" }), {
      mediaKey: "media-1",
      resource: "Property",
      resourceKey: "listing-1",
      modificationTimestamp: null,
      mediaUrl: "https://example.test/a.jpg",
      mediaCategory: null,
      preferredPhoto: null,
      sortOrder: 2,
      raw: media,
    });
  });

  it("serializes sync error causes into stable JSON DTOs", () => {
    const error = serializeSyncRecordError({
      resource: "Property",
      key: "listing-1",
      stage: "persist",
      message: "persist failed",
      cause: Cause.fail(new Error("database unavailable")),
    });

    assert.equal(error.resource, "Property");
    assert.equal(error.key, "listing-1");
    assert.equal(error.cause.type, "EffectCause");
    assert.equal(error.cause.message, "database unavailable");
    assert.match(error.cause.pretty ?? "", /database unavailable/);
  });
});
