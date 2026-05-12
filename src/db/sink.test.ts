import { assert, describe, it } from "@effect/vitest";
import { Cause, DateTime } from "effect";
import {
  mediaRowFromRecord,
  memberRowFromRecord,
  officeRowFromRecord,
  openHouseRowFromRecord,
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
      PropertySubType: "Single Family",
      PropertyType: "legacy-property-type",
      City: "Ottawa",
      StateOrProvince: "ON",
      Latitude: 45.42,
      Longitude: -75.69,
    };

    const row = propertyRowFromRecord(property);

    assert.equal(row.listingKey, "listing-1");
    assert.equal(row.listOfficeKey, "office-1");
    assert.equal(row.listAgentKey, "member-1");
    assert.equal(row.propertySubType, "Single Family");
    assert.equal(row.propertyType, "legacy-property-type");
    assert.equal(row.latitude, 45.42);
    assert.equal(row.longitude, -75.69);
    assert.equal(row.raw, property);
  });

  it("derives stable room and media ownership keys", () => {
    const property = { ListingKey: "listing-1" };
    const room = { RoomKey: "room-1", RoomType: "Kitchen", RoomLevel: "Main" };
    const media = { MediaKey: "media-1", MediaURL: "https://example.test/a.jpg", Order: 2 };

    assert.deepEqual(roomRowFromRecord(room, property), {
      listingKey: "listing-1",
      listingId: null,
      roomKey: "room-1",
      modificationTimestamp: null,
      roomDescription: null,
      roomDimensions: null,
      roomLength: null,
      roomType: "Kitchen",
      roomLevel: "Main",
      roomWidth: null,
      roomLengthWidthUnits: null,
      raw: room,
    });
    assert.deepEqual(mediaRowFromRecord(media, { resource: "Property", key: "listing-1" }), {
      mediaKey: "media-1",
      resource: "Property",
      resourceKey: "listing-1",
      resourceRecordId: null,
      resourceRecordKey: null,
      resourceName: null,
      modificationTimestamp: null,
      mediaUrl: "https://example.test/a.jpg",
      mediaCategory: null,
      longDescription: null,
      preferredPhoto: null,
      sortOrder: 2,
      raw: media,
    });
  });

  it("derives fallback room and media keys when DDF omits child keys", () => {
    const property = { ListingKey: "listing-1" };
    const room = { RoomKey: null, RoomType: "Kitchen", RoomLevel: "Main level" };
    const media = { MediaKey: null, MediaURL: "https://example.test/a.jpg", Order: 2 };

    assert.equal(
      roomRowFromRecord(room, property).roomKey,
      "listing-1:Kitchen:Main level",
    );
    assert.equal(
      mediaRowFromRecord(media, { resource: "Property", key: "listing-1" }).mediaKey,
      "Property:listing-1:https://example.test/a.jpg:2",
    );
  });

  it("persists Effect DateTime timestamp values", () => {
    const timestamp = DateTime.makeUnsafe("2024-01-02T03:04:05.000Z");

    assert.equal(
      propertyRowFromRecord({
        ListingKey: "listing-1",
        ModificationTimestamp: timestamp,
      }).modificationTimestamp?.toISOString(),
      "2024-01-02T03:04:05.000Z",
    );

    assert.equal(
      mediaRowFromRecord(
        { MediaKey: "media-1", ModificationTimestamp: timestamp },
        { resource: "Property", key: "listing-1" },
      ).modificationTimestamp?.toISOString(),
      "2024-01-02T03:04:05.000Z",
    );

    assert.equal(
      memberRowFromRecord({
        MemberKey: "member-1",
        ModificationTimestamp: timestamp,
      }).modificationTimestamp?.toISOString(),
      "2024-01-02T03:04:05.000Z",
    );

    assert.equal(
      officeRowFromRecord({
        OfficeKey: "office-1",
        ModificationTimestamp: timestamp,
      }).modificationTimestamp?.toISOString(),
      "2024-01-02T03:04:05.000Z",
    );

    assert.equal(
      openHouseRowFromRecord({
        OpenHouseKey: "open-house-1",
        OpenHouseDate: timestamp,
      }).openHouseDate,
      "2024-01-02",
    );
  });

  it("maps member and open house typed columns instead of relying on raw only", () => {
    const member = {
      MemberKey: "member-1",
      MemberMlsId: "M123",
      OfficeKey: "office-1",
      JobTitle: "Broker",
      MemberNationalAssociationId: "NAT-1",
      MemberStateOrProvince: "Ontario",
      MemberCountry: "Canada",
      MemberStatus: "Active",
      MemberType: "Salesperson",
      MemberEmail: "agent@example.test",
      MemberEmailYN: true,
    };
    const openHouse = {
      OpenHouseKey: "open-house-1",
      ListingKey: "listing-1",
      ListingId: "X123",
      OpenHouseDate: "2027-06-07",
      OpenHouseStartTime: "12:00:00.00",
      OpenHouseEndTime: "15:30:00.00",
      OpenHouseType: "Open House",
      OpenHouseStatus: "Active",
      OpenHouseRemarks: "Come visit",
      LivestreamOpenHouseURL: "https://example.test/live",
    };

    assert.equal(memberRowFromRecord(member).memberMlsId, "M123");
    assert.equal(memberRowFromRecord(member).jobTitle, "Broker");
    assert.equal(memberRowFromRecord(member).nationalAssociationId, "NAT-1");
    assert.equal(memberRowFromRecord(member).emailYn, true);
    assert.equal(openHouseRowFromRecord(openHouse).listingId, "X123");
    assert.equal(openHouseRowFromRecord(openHouse).openHouseDate, "2027-06-07");
    assert.equal(openHouseRowFromRecord(openHouse).openHouseStartTime, "12:00:00");
    assert.equal(openHouseRowFromRecord(openHouse).openHouseEndTime, "15:30:00");
    assert.equal(openHouseRowFromRecord(openHouse).livestreamOpenHouseUrl, "https://example.test/live");
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
