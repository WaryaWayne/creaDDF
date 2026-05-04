# SDK Wrap Map

This is the method surface Codex should build first. Prefer a small generic OData core with resource-specific methods on top, using the Effect schemas already started under `src/schema`.

## Client Core

Implement these before resource wrappers:

- `createDdfClient(config)` - accepts `clientId`, `clientSecret`, optional `baseUrl`, optional `identityUrl`, fetch implementation, logging, retry policy, and clock.
- `getAccessToken()` - POST client-credentials form data to `https://identity.crea.ca/connect/token`.
- `withBearerToken(request)` - attaches `Authorization: Bearer <access_token>`.
- `requestJson<T>(path, options)` - handles JSON parsing, API errors, and schema decoding.
- `listOData<T>(resourcePath, query)` - one-page list request.
- `paginateOData<T>(firstPathOrQuery)` - follows `@odata.nextLink`.
- `getOData<T>(resourcePath, key, query)` - single record lookup.
- `replicateIdentifiers<T>(replicationPath, query)` - reads identifier/watermark rows.

## SDK Boundary

This package should be a helper library, not an app, ORM, database schema owner, or scheduler.

The SDK should own:

- Auth token fetching, caching, and proactive renewal.
- HTTP request construction and retry behavior.
- OData query encoding.
- Pagination through `@odata.nextLink`.
- Replication identifier reads.
- Hydrating changed records by key.
- Effect Schema validation.
- Normalizing embedded records like `Rooms` and `Media`.
- Returning structured sync results.

The caller should own:

- When sync runs, such as cron, queue, worker, or manual trigger.
- Which database is used.
- How records are stored, queried, indexed, and joined later.
- Watermark persistence location.
- Delete/prune policy, unless it passes explicit hooks into the SDK.

## Shared Query Types

Use one shared query model for list endpoints:

```ts
type ODataListQuery<Field extends string = string> = {
  select?: Field[]
  count?: boolean
  filter?: string
  top?: number
  skip?: number
  orderby?: string | string[]
}
```

Use a narrower query for single record lookups:

```ts
type ODataGetQuery<Field extends string = string> = {
  select?: Field[]
}
```

Replication supports no `$top` or `$skip` in the published OpenAPI parameters, so keep it separate:

```ts
type ReplicationQuery<Field extends string = string> = {
  destinationId?: number
  select?: Field[]
  count?: boolean
  filter?: string
  orderby?: string | string[]
}
```

Avoid building a method for every possible DDF search. Keep the core query surface generic and safe, then add small helpers for common predicates.

## Property Listings

Wrap first:

- `listProperties(query?: ODataListQuery<PropertyField>)`
- `getProperty(propertyKey: string, query?: ODataGetQuery<PropertyField>)`
- `replicateProperties(query?: ReplicationQuery<PropertyIdentifierField>)`
- `replicatePropertiesForDestination(destinationId: number, query?: ReplicationQuery<PropertyIdentifierField>)`
- `syncProperties(options)` - orchestration helper that uses replication identifiers, hydrates changed listings by `ListingKey`, validates/normalizes records, calls optional persistence hooks, and returns sync results.

Notes:

- The single route path parameter is called `PropertyKey` in OpenAPI, but the model primary key field is `ListingKey`.
- Use `ListingKey` as the local database identity unless live payloads prove otherwise.
- Properties embed `Rooms` and `Media`; the SDK should expose helpers to normalize those children.
- Do not require a database adapter for read/list/get methods.
- `syncProperties` may accept optional hooks such as `onProperty`, `onRoom`, `onMedia`, and `onWatermark`, but it should also work in a pure mode that only returns records/results.

## Rooms

No standalone API path was exposed. Wrap as embedded helpers:

- `getPropertyRooms(property: Property): PropertyRoom[]`
- `normalizePropertyRooms(property: Property)` - emits rows keyed by `RoomKey`, plus `ListingKey`.
- `upsertRoomsForProperty(property)` - optional persistence adapter hook only if the caller provides one.

## Media

No standalone `/Media` path was exposed in the official OpenAPI path list. Wrap as embedded helpers:

- `getPropertyMedia(property: Property): Media[]`
- `getMemberMedia(member: Member): Media[]`
- `getOfficeMedia(office: Office): Media[]` later
- `normalizeMedia(parentResource, parentKey, media)` - emit rows keyed by `MediaKey`.

## Members

Wrap with the same list/get/replicate pattern:

- `listMembers(query?: ODataListQuery<MemberField>)`
- `getMember(memberKey: string, query?: ODataGetQuery<MemberField>)`
- `replicateMembers(query?: ReplicationQuery<MemberIdentifierField>)`
- `replicateMembersForDestination(destinationId: number, query?: ReplicationQuery<MemberIdentifierField>)`
- `syncMembers(options)`

Members embed `Media`, so reuse media normalization.

## Open Houses

OpenHouse has list/get endpoints but no replication endpoint in the published OpenAPI paths:

- `listOpenHouses(query?: ODataListQuery<OpenHouseField>)`
- `getOpenHouse(openHouseKey: string, query?: ODataGetQuery<OpenHouseField>)`
- `syncOpenHouses(options)` - use list pagination with `$filter` and `$orderby` if a scheduled refresh is needed.

## Destination

Destination exists:

- `listDestinations(query?: ODataListQuery<DestinationField>)`
- `getDestination(destinationId: number | string, query?: ODataGetQuery<DestinationField>)`

Use this for technology-provider accounts and destination-specific replication.

## Office Later

Office is fully exposed in OpenAPI:

- `listOffices(query?: ODataListQuery<OfficeField>)`
- `getOffice(officeKey: string, query?: ODataGetQuery<OfficeField>)`
- `replicateOffices(query?: ReplicationQuery<OfficeIdentifierField>)`
- `replicateOfficesForDestination(destinationId: number, query?: ReplicationQuery<OfficeIdentifierField>)`

Do not prioritize unless metadata or product needs it.

## Lead

Lead exists but is not a replication resource:

- `createLead(input: LeadModel, options?: { suppressEmail?: boolean })`

Keep it separate from sync modules.
