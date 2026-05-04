import { Effect } from "effect"
import { DdfHttp } from "./client"
import type { ODataGetQuery, ODataListQuery, ReplicationQuery } from "./types"

export const listProperties = Effect.fn("DdfProperty.listProperties")(function*(query?: ODataListQuery) { const http = yield* DdfHttp; return yield* http.listOData("/odata/v1/Property", query) })
export const getProperty = Effect.fn("DdfProperty.getProperty")(function*(propertyKey: string, query?: ODataGetQuery) { const http = yield* DdfHttp; return yield* http.getOData("/odata/v1/Property", propertyKey, query) })
export const replicateProperties = Effect.fn("DdfProperty.replicateProperties")(function*(query?: ReplicationQuery) { const http = yield* DdfHttp; return yield* http.replicateIdentifiers("/odata/v1/Property/Replication", query) })
export const listMembers = Effect.fn("DdfMember.listMembers")(function*(query?: ODataListQuery) { const http = yield* DdfHttp; return yield* http.listOData("/odata/v1/Member", query) })
export const getMember = Effect.fn("DdfMember.getMember")(function*(memberKey: string, query?: ODataGetQuery) { const http = yield* DdfHttp; return yield* http.getOData("/odata/v1/Member", memberKey, query) })
export const replicateMembers = Effect.fn("DdfMember.replicateMembers")(function*(query?: ReplicationQuery) { const http = yield* DdfHttp; return yield* http.replicateIdentifiers("/odata/v1/Member/Replication", query) })
export const listOffices = Effect.fn("DdfOffice.listOffices")(function*(query?: ODataListQuery) { const http = yield* DdfHttp; return yield* http.listOData("/odata/v1/Office", query) })
export const getOffice = Effect.fn("DdfOffice.getOffice")(function*(officeKey: string, query?: ODataGetQuery) { const http = yield* DdfHttp; return yield* http.getOData("/odata/v1/Office", officeKey, query) })
export const replicateOffices = Effect.fn("DdfOffice.replicateOffices")(function*(query?: ReplicationQuery) { const http = yield* DdfHttp; return yield* http.replicateIdentifiers("/odata/v1/Office/Replication", query) })
export const listOpenHouses = Effect.fn("DdfOpenHouse.listOpenHouses")(function*(query?: ODataListQuery) { const http = yield* DdfHttp; return yield* http.listOData("/odata/v1/OpenHouse", query) })
export const getOpenHouse = Effect.fn("DdfOpenHouse.getOpenHouse")(function*(openHouseKey: string, query?: ODataGetQuery) { const http = yield* DdfHttp; return yield* http.getOData("/odata/v1/OpenHouse", openHouseKey, query) })
export const listDestinations = Effect.fn("DdfDestination.listDestinations")(function*(query?: ODataListQuery) { const http = yield* DdfHttp; return yield* http.listOData("/odata/v1/Destination", query) })
export const getDestination = Effect.fn("DdfDestination.getDestination")(function*(destinationId: number | string, query?: ODataGetQuery) { const http = yield* DdfHttp; return yield* http.getOData("/odata/v1/Destination", destinationId, query) })
export const createLead = Effect.fn("DdfLead.createLead")(function*(input: Record<string, unknown>) { const http = yield* DdfHttp; return yield* http.requestJson("/v1/Lead/CreateLead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }) })
