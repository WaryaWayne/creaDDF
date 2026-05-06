import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { DateTime, Effect, Layer } from "effect"
import { DdfHttp, encodeODataQuery, makeDdfLayer } from "./client"
import type { DdfHttpApi } from "./client"
import {
  createLead,
  getDestination,
  getMember,
  getOffice,
  getOpenHouse,
  getProperty,
  listDestinations,
  listMembers,
  listOffices,
  listOpenHouses,
  listProperties,
  replicateMembers,
  replicateMembersForDestination,
  replicateOffices,
  replicateOfficesForDestination,
  replicateProperties,
  replicatePropertiesForDestination,
} from "./resources"
import type { LeadInput, ODataGetQuery, ODataListQuery, ReplicationQuery } from "./types"

const keyLiteral = (key: string | number) => typeof key === "number" ? String(key) : `'${key.replaceAll("'", "''")}'`
const tokenResponse = Response.json({ access_token: "token-123", expires_in: 3600 })
const configFor = (fetchMock: typeof fetch) => ({
  clientId: "client-id",
  clientSecret: "client-secret",
  identityUrl: "https://identity.test/connect/token",
  baseUrl: "https://ddf.test",
  fetch: fetchMock,
})

const requestedUrlFor = async (effect: Effect.Effect<unknown, unknown, DdfHttpApi>) => {
  const requestedUrls: Array<string> = []
  const response = <T>(value: unknown) => Effect.succeed(value as T)
  const http: DdfHttpApi = {
    requestJson: <T = unknown>(url: string) => {
      requestedUrls.push(url)
      return response<T>({ value: [] })
    },
    listOData: <T = unknown>(url: string, query?: ODataListQuery) => {
      requestedUrls.push(`${url}${encodeODataQuery(query)}`)
      return response<T>({ value: [] })
    },
    getOData: <T = unknown>(url: string, key: string | number, query?: ODataGetQuery) => {
      requestedUrls.push(`${url}(${keyLiteral(key)})${encodeODataQuery(query)}`)
      return response<T>({ value: [] })
    },
    replicateIdentifiers: <T = unknown>(url: string, query?: ReplicationQuery) => {
      requestedUrls.push(`${url}${encodeODataQuery(query)}`)
      return response<T>({ value: [] })
    },
    paginateOData: (url: string) => {
      requestedUrls.push(url)
      return Effect.succeed([])
    },
  }

  const provided = Effect.provide(effect, Layer.succeed(DdfHttp)(http)) as Effect.Effect<unknown, unknown, never>
  await Effect.runPromise(provided)
  assert.equal(requestedUrls.length, 1)
  return requestedUrls[0]
}

const leadInput: LeadInput = {
  Culture: "en-CA",
  MemberKey: "member-1",
  ListingKey: "listing-1",
  SenderName: "Jane Buyer",
  SenderEmailAddress: "jane@example.com",
  SenderPhoneNumber: 4165551234,
  PreferredMethodContact: "Email",
  SenderPhoneExtension: null,
  Message: "I would like to know more about this listing.",
}

const leadBody = '{"Culture":"en-CA","MemberKey":"member-1","ListingKey":"listing-1","SenderName":"Jane Buyer","SenderEmailAddress":"jane@example.com","SenderPhoneNumber":4165551234,"PreferredMethodContact":"Email","SenderPhoneExtension":null,"Message":"I would like to know more about this listing."}'

describe("odata resource paths", () => {
  it("requests list endpoints with encoded query options", async () => {
    assert.equal(
      await requestedUrlFor(listProperties({ select: ["ListingKey"], top: 2 })),
      "/odata/v1/Property?%24select=ListingKey&%24top=2",
    )
    assert.equal(await requestedUrlFor(listMembers()), "/odata/v1/Member")
    assert.equal(await requestedUrlFor(listOffices()), "/odata/v1/Office")
    assert.equal(await requestedUrlFor(listOpenHouses()), "/odata/v1/OpenHouse")
    assert.equal(await requestedUrlFor(listDestinations()), "/odata/v1/Destination")
  })

  it("requests keyed endpoints and escapes string keys", async () => {
    assert.equal(
      await requestedUrlFor(getProperty("abc'123", { select: ["ListingKey"] })),
      "/odata/v1/Property('abc''123')?%24select=ListingKey",
    )
    assert.equal(await requestedUrlFor(getMember("member-1")), "/odata/v1/Member('member-1')")
    assert.equal(await requestedUrlFor(getOffice("office-1")), "/odata/v1/Office('office-1')")
    assert.equal(await requestedUrlFor(getOpenHouse("open-house-1")), "/odata/v1/OpenHouse('open-house-1')")
    assert.equal(await requestedUrlFor(getDestination(123)), "/odata/v1/Destination(123)")
  })
})

describe("selected resource decoding", () => {
  it("decodes selected property list rows as partial resources", async () => {
    const fetchMock = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "https://identity.test/connect/token") return tokenResponse.clone()

      assert.equal(url, "https://ddf.test/odata/v1/Property?%24select=ListingKey%2CModificationTimestamp&%24top=1")
      return Response.json({
        value: [{ ListingKey: "listing-1", ModificationTimestamp: "2024-01-25T00:00:00.000Z" }],
      })
    }) as typeof fetch

    const result = await Effect.runPromise(
      listProperties({ select: ["ListingKey", "ModificationTimestamp"], top: 1 }).pipe(
        Effect.provide(makeDdfLayer(configFor(fetchMock))),
      ),
    )

    assert.equal(result.value[0]?.ListingKey, "listing-1")
    const timestamp = result.value[0]?.ModificationTimestamp
    assert.equal(
      DateTime.isDateTime(timestamp) && DateTime.isUtc(timestamp),
      true,
    )
  })

  it("decodes selected keyed resources without requiring non-selected fields", async () => {
    const fetchMock = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "https://identity.test/connect/token") return tokenResponse.clone()

      if (url === "https://ddf.test/odata/v1/Property('property-1')?%24select=ListingKey") {
        return Response.json({ "@odata.context": "https://ddf.test/$metadata#Property/$entity", ListingKey: "property-1" })
      }
      if (url === "https://ddf.test/odata/v1/Member('member-1')?%24select=MemberKey") {
        return Response.json({ MemberKey: "member-1" })
      }
      if (url === "https://ddf.test/odata/v1/OpenHouse('open-house-1')?%24select=OpenHouseKey") {
        return Response.json({ OpenHouseKey: "open-house-1" })
      }

      throw new Error(`Unexpected request: ${url}`)
    }) as typeof fetch

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const property = yield* getProperty("property-1", { select: ["ListingKey"] })
        const member = yield* getMember("member-1", { select: ["MemberKey"] })
        const openHouse = yield* getOpenHouse("open-house-1", { select: ["OpenHouseKey"] })
        return { property, member, openHouse }
      }).pipe(Effect.provide(makeDdfLayer(configFor(fetchMock)))),
    )

    assert.equal(result.property.ListingKey, "property-1")
    assert.equal(result.member.MemberKey, "member-1")
    assert.equal(result.openHouse.OpenHouseKey, "open-house-1")
  })
})

describe("replication resource paths", () => {
  it("requests all-destination replication functions", async () => {
    assert.equal(await requestedUrlFor(replicateProperties()), "/odata/v1/Property/PropertyReplication()")
    assert.equal(await requestedUrlFor(replicateMembers()), "/odata/v1/Member/MemberReplication()")
    assert.equal(await requestedUrlFor(replicateOffices()), "/odata/v1/Office/OfficeReplication()")
  })

  it("requests destination-specific replication functions", async () => {
    assert.equal(await requestedUrlFor(replicatePropertiesForDestination(123)), "/odata/v1/Property/PropertyReplication(DestinationId=123)")
    assert.equal(await requestedUrlFor(replicateMembersForDestination(123)), "/odata/v1/Member/MemberReplication(DestinationId=123)")
    assert.equal(await requestedUrlFor(replicateOfficesForDestination(123)), "/odata/v1/Office/OfficeReplication(DestinationId=123)")
  })

  it("appends replication query options after destination path", async () => {
    const url = await requestedUrlFor(
      replicatePropertiesForDestination(123, {
        select: ["ListingKey", "ModificationTimestamp"],
        count: true,
        filter: "ModificationTimestamp gt 2024-01-25T00:00:00.00Z",
        orderby: "ModificationTimestamp desc",
      }),
    )

    assert.equal(
      url,
      "/odata/v1/Property/PropertyReplication(DestinationId=123)?%24select=ListingKey%2CModificationTimestamp&%24count=true&%24filter=ModificationTimestamp+gt+2024-01-25T00%3A00%3A00.00Z&%24orderby=ModificationTimestamp+desc",
    )
  })
})

describe("lead resource", () => {
  it("creates a lead without suppressing email by default", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const response = <T>(value: unknown) => Effect.succeed(value as T)
    const http: DdfHttpApi = {
      requestJson: <T = unknown>(url: string, init?: RequestInit) => {
        requests.push({ url, init })
        return response<T>({ success: true })
      },
      listOData: <T = unknown>() => response<T>({ value: [] }),
      getOData: <T = unknown>() => response<T>({ value: [] }),
      replicateIdentifiers: <T = unknown>() => response<T>({ value: [] }),
      paginateOData: () => Effect.succeed([]),
    }

    const provided = Effect.provide(createLead(leadInput), Layer.succeed(DdfHttp)(http)) as Effect.Effect<unknown, unknown, never>
    const result = await Effect.runPromise(provided)

    assert.deepEqual(result, { success: true })
    assert.equal(requests[0]?.url, "/v1/Lead/CreateLead")
    assert.equal(requests[0]?.init?.method, "POST")
    assert.deepEqual(requests[0]?.init?.headers, { "content-type": "application/json" })
    assert.equal(requests[0]?.init?.body, leadBody)
  })

  it("creates a lead with email suppressed when requested", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const response = <T>(value: unknown) => Effect.succeed(value as T)
    const http: DdfHttpApi = {
      requestJson: <T = unknown>(url: string, init?: RequestInit) => {
        requests.push({ url, init })
        return response<T>({ success: true })
      },
      listOData: <T = unknown>() => response<T>({ value: [] }),
      getOData: <T = unknown>() => response<T>({ value: [] }),
      replicateIdentifiers: <T = unknown>() => response<T>({ value: [] }),
      paginateOData: () => Effect.succeed([]),
    }

    const provided = Effect.provide(createLead(leadInput, { suppressEmail: true }), Layer.succeed(DdfHttp)(http)) as Effect.Effect<unknown, unknown, never>
    const result = await Effect.runPromise(provided)

    assert.deepEqual(result, { success: true })
    assert.equal(requests[0]?.url, "/v1/Lead/CreateLead?SuppressEmail=true")
    assert.equal(requests[0]?.init?.body, leadBody)
  })
})
