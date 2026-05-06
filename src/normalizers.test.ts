import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { DateTime, Schema } from "effect"
import { normalizeMedia, normalizePropertyGraph, normalizePropertyRooms } from "./normalizers"
import { MediaSchema } from "./schema/mediaSchema"

describe("normalizers", () => {
  it("normalizes room listing keys without overwriting existing values", () => {
    const rows = normalizePropertyRooms({
      ListingKey: "parent-listing",
      Rooms: [
        { RoomKey: "room-1", ListingKey: null },
        { RoomKey: "room-2", ListingKey: "room-listing" },
      ],
    })

    assert.deepEqual(rows.map((row) => row.ListingKey), ["parent-listing", "room-listing"])
  })


  it("normalizes property graphs into property, room, and media groups", () => {
    const graph = normalizePropertyGraph({
      ListingKey: "listing-graph",
      Rooms: [{ RoomKey: "room-1", ListingKey: null }],
      Media: [
        {
          MediaKey: "media-1",
          ResourceName: null,
          ResourceRecordKey: null,
        },
      ],
    })

    assert.equal(graph.property.ListingKey, "listing-graph")
    assert.equal(graph.rooms[0].ListingKey, "listing-graph")
    assert.equal(graph.media[0].ResourceName, "Property")
    assert.equal(graph.media[0].ResourceRecordKey, "listing-graph")
  })

  it("normalizes media parent values without overwriting existing values", () => {
    const missingParent = normalizeMedia("Property", "listing-1", {
      MediaKey: "media-1",
      ResourceName: null,
      ResourceRecordKey: null,
    } as any)
    const existingParent = normalizeMedia("Office", "office-1", {
      MediaKey: "media-2",
      ResourceName: "Member",
      ResourceRecordKey: "member-1",
    } as any)

    assert.equal(missingParent.ResourceName, "Property")
    assert.equal(missingParent.ResourceRecordKey, "listing-1")
    assert.equal(existingParent.ResourceName, "Member")
    assert.equal(existingParent.ResourceRecordKey, "member-1")
  })

  it("decodes media records and reports invalid enum values", () => {
    const decodeMedia = Schema.decodeUnknownSync(MediaSchema)

    const mediaRecord = {
      MediaKey: "media-1",
      LongDescription: null,
      MediaURL: "https://example.test/photo.jpg",
      ModificationTimestamp: "2026-05-04T12:34:56.000Z",
      Order: 1,
      PreferredPhotoYN: true,
      ResourceRecordId: "A1",
      ResourceRecordKey: "listing-1",
      ResourceName: "Property",
      MediaCategory: "Property Photo",
    }

    const decoded = decodeMedia([mediaRecord])
    const timestamp = decoded[0].ModificationTimestamp

    assert.equal(
      DateTime.isDateTime(timestamp) && DateTime.isUtc(timestamp),
      true,
    )
    assert.throws(
      () => decodeMedia([{ ...mediaRecord, ResourceName: "Listing" }]),
      /ResourceName/,
    )
  })
})
