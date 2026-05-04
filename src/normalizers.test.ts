import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { normalizeMedia, normalizePropertyRooms } from "./normalizers"

describe("normalizers", () => {
  it("normalizes room listing key", () => {
    const rows = normalizePropertyRooms({ ListingKey: "l1", Rooms: [{ RoomKey: "r1", ListingKey: null }] })
    assert.equal(rows[0].ListingKey, "l1")
  })

  it("normalizes media parent", () => {
    const row = normalizeMedia("Property", "l1", { MediaKey: "m1", ResourceName: null, ResourceRecordKey: null } as any)
    assert.equal(row.ResourceName, "Property")
  })
})
