# SDK Wrap Map

This is the method surface Codex should build. Prefer a complete generic OData core with resource-specific methods on top, using the Effect schemas already started under `src/schema`.

Do not half-bake the method surface. If the local docs/OpenAPI expose a resource or method, implement it unless live API behavior proves it is unavailable or the task explicitly excludes it.

## Client Core

Implement these before resource wrappers:

- `createDdfClient(config)` - accepts `clientId`, `clientSecret`, optional `baseUrl`, optional `identityUrl`, logging, retry policy, and clock.
- `getAccessToken()` - POST client-credentials form data to `https://identity.crea.ca/connect/token`.
- `withBearerToken(request)` - attaches `Authorization: Bearer <access_token>`.
- `requestJson<T>(path, options)` - handles JSON parsing, API errors, and schema decoding.
- `listOData<T>(resourcePath, query)` - one-page list request.
- `paginateOData<T>(firstPathOrQuery)` - follows `@odata.nextLink`.
- `getOData<T>(resourcePath, key, query)` - single record lookup.
- `replicateIdentifiers<T>(replicationPath, query)` - reads identifier/watermark rows.

## SDK Boundary

This package should be a helper library, not an app, database schema owner, or scheduler.

The SDK should own:

- Auth token acquisition, caching, and proactive renewal.
- HTTP request construction and retry behavior.
- OData query encoding.
- Pagination through `@odata.nextLink`.
- Replication identifier reads.
- Hydrating changed records by key.
- Effect Schema validation.
- Normalizing embedded records like `Rooms` and `Media`.
- Returning structured sync results.
- Providing an optional persistence sink interface that app code can implement.

The caller should own:

- When sync runs, such as cron, queue, worker, or manual trigger.
- The final database schema and migrations.
- How records are queried, indexed, and joined later.
- Watermark persistence location.
- Delete/prune policy, unless it passes explicit hooks into the SDK.

Persistence direction:

- Keep read/list/get methods database-free.
- Make Drizzle ORM the intended persistence adapter target.
- Use Effect SQL integration/driver support where it fits the Drizzle adapter cleanly.
- Do not vendor or commit large reference repositories into this SDK. Local references can be inspected during implementation, but this package should stay focused.

## Shared Query Types

Use one shared query model for list endpoints:

```ts
type ODataListQuery<Field extends string = string> = {
  select?: Field[];
  count?: boolean;
  filter?: string;
  top?: number;
  skip?: number;
  orderby?: string | string[];
};
```

Use a narrower query for single record lookups:

```ts
type ODataGetQuery<Field extends string = string> = {
  select?: Field[];
};
```

Replication supports no `$top` or `$skip` in the published OpenAPI parameters, so keep it separate:

```ts
type ReplicationQuery<Field extends string = string> = {
  destinationId?: number;
  select?: Field[];
  count?: boolean;
  filter?: string;
  orderby?: string | string[];
};
```

Avoid replacing the generic OData surface with hundreds of brittle one-off search methods. Build the generic query surface thoroughly, then add helpers for common predicates.

## Completeness Target

Implement broad SDK coverage for the exposed DDF API:

- Auth and token lifecycle.
- Generic OData list/get/pagination/query helpers.
- Property list/get/replication/sync.
- Member list/get/replication/sync.
- Office list/get/replication/sync.
- Destination list/get.
- OpenHouse list/get/sync-by-query.
- Lead creation as a separate non-replication module.
- Embedded `Rooms` and `Media` normalization.
- Analytics/log-event helper if the docs and env config are clear enough.

Prefer a complete, well-factored implementation over a tiny MVP. If something is blocked by unclear docs or live API behavior, leave a typed placeholder or explicit TODO with the reason.

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
- `getDestination(destinationId: number, query?: ODataGetQuery<DestinationField>)`

Use this for technology-provider accounts and destination-specific replication.

## Office

Office is fully exposed in OpenAPI. Despite this heading/filename saying "later", implement the wrapper for thorough coverage once Property, Rooms, Media, Members, OpenHouse, and Destination are in place:

- `listOffices(query?: ODataListQuery<OfficeField>)`
- `getOffice(officeKey: string, query?: ODataGetQuery<OfficeField>)`
- `replicateOffices(query?: ReplicationQuery<OfficeIdentifierField>)`
- `replicateOfficesForDestination(destinationId: number, query?: ReplicationQuery<OfficeIdentifierField>)`

Do not omit Office from the SDK if time is available; it has list/get and replication methods.

## Lead

Lead exists but is not a replication resource:

- `createLead(input: LeadModel, options?: { suppressEmail?: boolean })`

Keep it separate from sync modules, but implement it for method coverage.
