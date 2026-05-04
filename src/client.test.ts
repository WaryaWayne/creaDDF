import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { encodeODataQuery } from "./client"

describe("client", () => {
  it("encodes odata", () => {
    const q = encodeODataQuery({ select: ["ListingKey"], count: true, filter: "x eq 1", top: 10, skip: 5, orderby: ["ModificationTimestamp desc"] })
    assert.equal(q.includes("%24select=ListingKey"), true)
    assert.equal(q.includes("%24count=true"), true)
  })
})
