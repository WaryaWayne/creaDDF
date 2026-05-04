import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { listProperties, getProperty, replicateProperties, listMembers, listOffices, listOpenHouses, listDestinations, createLead } from "./resources"

describe("resources exports", () => {
  it("exports effect methods", () => {
    assert.equal(typeof listProperties, "function")
    assert.equal(typeof getProperty, "function")
    assert.equal(typeof replicateProperties, "function")
    assert.equal(typeof listMembers, "function")
    assert.equal(typeof listOffices, "function")
    assert.equal(typeof listOpenHouses, "function")
    assert.equal(typeof listDestinations, "function")
    assert.equal(typeof createLead, "function")
  })
})
