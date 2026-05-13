import { assert, describe, it } from "@effect/vitest";
import { Cause, DateTime } from "effect";
import type { MediaRecord, MemberRecord, OfficeRecord, OpenHouseRecord, PropertyRecord, RoomRecord } from "../sync";
import type { Destination } from "../schema/destinationSchema";
import {
  destinationRowFromRecord,
  mediaRowFromRecord,
  memberRowFromRecord,
  officeRowFromRecord,
  openHouseRowFromRecord,
  propertyRowFromRecord,
  roomRowFromRecord,
  serializeSyncRecordError,
} from "./sink";

const asPropertyRecord = (record: object): PropertyRecord => record as PropertyRecord;
const asRoomRecord = (record: object): RoomRecord => record as RoomRecord;
const asMediaRecord = (record: object): MediaRecord => record as MediaRecord;
const asMemberRecord = (record: object): MemberRecord => record as MemberRecord;
const asOfficeRecord = (record: object): OfficeRecord => record as OfficeRecord;
const asOpenHouseRecord = (record: object): OpenHouseRecord => record as OpenHouseRecord;
const asDestination = (record: object): Destination => record as Destination;

describe("database sync sink row mapping", () => {
  it("preserves raw property payloads and stable keys", () => {
    const property = asPropertyRecord({
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
      PricePerUnit: "square feet",
      ListAgentNationalAssociationId: "LANA-1",
      CoListAgentNationalAssociationId: "CLANA-1",
      CoListAgentNationalAssociationId2: "CLANA-2",
      CoListAgentNationalAssociationId3: "CLANA-3",
      ListOfficeNationalAssociationId: "LONA-1",
      CoListOfficeNationalAssociationId: "CLONA-1",
      CoListOfficeNationalAssociationId2: "CLONA-2",
      CoListOfficeNationalAssociationId3: "CLONA-3",
    });

    const row = propertyRowFromRecord(property);

    assert.equal(row.listingKey, "listing-1");
    assert.equal(row.listOfficeKey, "office-1");
    assert.equal(row.listAgentKey, "member-1");
    assert.equal(row.propertySubType, "Single Family");
    assert.equal(row.propertyType, null);
    assert.equal(row.latitude, 45.42);
    assert.equal(row.longitude, -75.69);
    assert.equal(row.pricePerUnit, "square feet");
    assert.equal(row.listAgentNationalAssociationId, "LANA-1");
    assert.equal(row.coListAgentNationalAssociationId3, "CLANA-3");
    assert.equal(row.listOfficeNationalAssociationId, "LONA-1");
    assert.equal(row.coListOfficeNationalAssociationId3, "CLONA-3");
    assert.equal(row.raw, property);
  });

  it("derives stable room and media ownership keys", () => {
    const property = asPropertyRecord({ ListingKey: "listing-1" });
    const room = asRoomRecord({ RoomKey: "room-1", RoomType: "Kitchen", RoomLevel: "Main level" });
    const media = asMediaRecord({ MediaKey: "media-1", MediaURL: "https://example.test/a.jpg", Order: 2 });

    assert.deepEqual(roomRowFromRecord(room, property), {
      listingKey: "listing-1",
      listingId: null,
      roomKey: "room-1",
      modificationTimestamp: null,
      roomDescription: null,
      roomDimensions: null,
      roomLength: null,
      roomType: "Kitchen",
      roomLevel: "Main level",
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
    const property = asPropertyRecord({ ListingKey: "listing-1" });
    const room = asRoomRecord({ RoomKey: null, RoomType: "Kitchen", RoomLevel: "Main level" });
    const media = asMediaRecord({ MediaKey: null, MediaURL: "https://example.test/a.jpg", Order: 2 });

    assert.equal(
      roomRowFromRecord(room, property).roomKey,
      "listing-1:Kitchen:Main level",
    );
    assert.equal(
      mediaRowFromRecord(media, { resource: "Property", key: "listing-1" }).mediaKey,
      "Property:listing-1:https://example.test/a.jpg:2",
    );
  });

  it("treats empty stable keys as missing", () => {
    const property = asPropertyRecord({ ListingKey: "" });
    const room = asRoomRecord({ RoomKey: "", RoomType: "Kitchen", RoomLevel: "Main level" });
    const media = asMediaRecord({ MediaKey: "", MediaURL: "https://example.test/a.jpg", Order: 2 });
    const member = asMemberRecord({ MemberKey: "" });
    const office = asOfficeRecord({ OfficeKey: "" });
    const openHouse = asOpenHouseRecord({ OpenHouseKey: "" });

    assert.equal(propertyRowFromRecord(property).listingKey, null);
    assert.equal(memberRowFromRecord(member).memberKey, null);
    assert.equal(officeRowFromRecord(office).officeKey, null);
    assert.equal(openHouseRowFromRecord(openHouse).openHouseKey, null);
    assert.equal(
      roomRowFromRecord(room, asPropertyRecord({ ListingKey: "listing-1" })).roomKey,
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
      propertyRowFromRecord(asPropertyRecord({
        ListingKey: "listing-1",
        ModificationTimestamp: timestamp,
      })).modificationTimestamp?.toISOString(),
      "2024-01-02T03:04:05.000Z",
    );

    assert.equal(
      mediaRowFromRecord(
        asMediaRecord({ MediaKey: "media-1", ModificationTimestamp: timestamp }),
        { resource: "Property", key: "listing-1" },
      ).modificationTimestamp?.toISOString(),
      "2024-01-02T03:04:05.000Z",
    );

    assert.equal(
      memberRowFromRecord(asMemberRecord({
        MemberKey: "member-1",
        ModificationTimestamp: timestamp,
      })).modificationTimestamp?.toISOString(),
      "2024-01-02T03:04:05.000Z",
    );

    assert.equal(
      officeRowFromRecord(asOfficeRecord({
        OfficeKey: "office-1",
        ModificationTimestamp: timestamp,
      })).modificationTimestamp?.toISOString(),
      "2024-01-02T03:04:05.000Z",
    );

    assert.equal(
      openHouseRowFromRecord(asOpenHouseRecord({
        OpenHouseKey: "open-house-1",
        OpenHouseDate: timestamp,
      })).openHouseDate,
      "2024-01-02",
    );
  });

  it("maps member and open house typed columns instead of relying on raw only", () => {
    const member = asMemberRecord({
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
    });
    const openHouse = asOpenHouseRecord({
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
    });

    assert.equal(memberRowFromRecord(member).memberMlsId, "M123");
    assert.equal(memberRowFromRecord(member).jobTitle, "Broker");
    assert.equal(memberRowFromRecord(member).nationalAssociationId, "NAT-1");
    const memberRow = memberRowFromRecord(member);
    assert.equal(memberRow.emailYn, true);
    assert.equal("email" in memberRow, false);
    assert.equal(openHouseRowFromRecord(openHouse).listingId, "X123");
    assert.equal(openHouseRowFromRecord(openHouse).openHouseDate, "2027-06-07");
    assert.equal(openHouseRowFromRecord(openHouse).openHouseStartTime, "12:00:00");
    assert.equal(openHouseRowFromRecord(openHouse).openHouseEndTime, "15:30:00");
    assert.equal(openHouseRowFromRecord(openHouse).livestreamOpenHouseUrl, "https://example.test/live");
  });

  it("maps destination rows for the DB query surface", () => {
    const destination = asDestination({
      DestinationId: 123,
      DestinationName: "Website Feed",
      DestinationUrl: "https://example.test",
      DestinationType: 9,
      DestinationStatus: 1,
    });

    assert.deepEqual(destinationRowFromRecord(destination), {
      destinationId: 123,
      destinationName: "Website Feed",
      destinationUrl: "https://example.test",
      destinationType: "9",
      destinationStatus: "1",
      raw: destination,
    });
  });

  it("preserves omitted destination enum values as null", () => {
    const destination = asDestination({
      DestinationId: 456,
      DestinationName: "Selected Website Feed",
    });

    assert.deepEqual(destinationRowFromRecord(destination), {
      destinationId: 456,
      destinationName: "Selected Website Feed",
      destinationUrl: null,
      destinationType: null,
      destinationStatus: null,
      raw: destination,
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
