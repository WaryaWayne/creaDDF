# Current Implementation Status

This document reflects the SDK as implemented in `src/` and complements the official DDF API notes in the rest of `@docs`.

## Package Shape

- Package name: `@warya/crea-ddf`.
- Public ESM entrypoint: `.` from `dist/index.js` with types at `dist/index.d.ts`.
- Public database subpath: `./db` from `dist/db/index.js` with types at `dist/db/index.d.ts`.
- Published files include `dist`, `@docs`, and `LICENSE.md`.
- Runtime requirements are Node `>=20.19.0` and Bun `>=1.3.0` for Bun-oriented scripts.
- Default verification is `pnpm test`, which runs `pnpm run typecheck` and `vitest run`.

## Runtime Layers And Configuration

Implemented layers and services:

- `makeDdfLayer(config)` composes configuration, the native Effect fetch HTTP client, auth, and DDF HTTP services.
- `makeDdfLayerFromEnv` reads standard CREA DDF env vars and returns the same composed layer.
- `DdfConfig` stores client configuration in Effect context.
- `DdfAuth` manages OAuth token acquisition and cache refresh.
- `DdfHttp` owns authenticated JSON requests, OData list/get helpers, replication identifier requests, and next-link pagination.

Supported client configuration:

- `clientId`
- `clientSecret` as a string or `Redacted<string>`
- `baseUrl`, defaulting to `https://ddfapi.realtor.ca` when omitted at request time and defaulting to the same value in env config
- `identityUrl`, defaulting to `https://identity.crea.ca/connect/token` in env config
- `analyticsUrl`
- `retryPolicy` with `maxRetries`, `baseDelay`, deprecated `baseDelayMillis`, and `retryableStatuses`
- `tokenExpiryBuffer`
- optional debug/warn logger callbacks for token requests, API requests, retries, and unauthorized refreshes

Environment variables:

- `CREA_DDF_CLIENT_ID`
- `CREA_DDF_CLIENT_SECRET`
- `CREA_DDF_BASE_URL`
- `CREA_DDF_AUTH_URL`
- `CREA_ANALYTICS_URL`
- Database sync also reads `DATABASE_URL` through the database layer and `CREA_CHOSEN_AOR_KEYS` for optional AOR scoping.

## HTTP, OData, And Errors

The HTTP core is implemented with native Effect HTTP client APIs and typed errors. It currently provides:

- `requestJson(path, init?, schema?)`
- `listOData(path, query?, schema?)`
- `getOData(path, key, query?, schema?)`
- `replicateIdentifiers(path, query?, schema?)`
- `paginateOData(firstUrlOrPath)`

Behavior:

- Relative paths are resolved against `baseUrl`; absolute next links are used as-is.
- Requests attach bearer tokens from `DdfAuth`.
- A `401` response triggers a forced token refresh and one retry through the normal request pipeline.
- Retryable statuses default to `408`, `500`, `502`, `503`, and `504` with two retries and a 100 ms base delay.
- Successful JSON responses are optionally decoded with Effect `Schema`.
- Transport, status, JSON parse, and schema decode failures are mapped into tagged error classes.

OData support:

- List queries support `$select`, `$filter`, `$count`, `$top`, `$skip`, and `$orderby`.
- Get queries support `$select`.
- Replication queries support `$select`, `$filter`, `$count`, and `$orderby`.
- `$top` is validated as an integer between `0` and `100`.
- `$skip` is validated as a non-negative integer.
- `filters` includes helpers for `eq`, `ne`, `gt`, `lt`, `ge`, `le`, `in`, `has`, `modifiedAfter`, `not`, `any`, `and`, and `or`.
- Single-record keys are emitted in OData function style with quote escaping for string keys.

## Resource Coverage

The core resources are implemented with Effect functions and schema decoding.

### Property

- `listProperties(query?)`
- `getProperty(propertyKey, query?)`
- `replicateProperties(query?)`
- `replicatePropertiesForDestination(destinationId, query?)`
- `syncProperties(options?)`
- `getPropertyMasterList(query?)`
- `diffLocalKeysAgainstMasterList(localKeys, masterKeys)`
- `pruneMissingProperties(localKeys, sink, query?)`

Defaults:

- List ordering defaults to `ModificationTimestamp desc,ListingKey asc`.
- Sync/replication ordering defaults to `ModificationTimestamp asc,ListingKey asc`.
- `syncProperties` hydrates identifiers by `ListingKey`, normalizes rooms/media, optionally persists via a sink, optionally saves watermarks, and reports per-record errors instead of failing the whole batch for ordinary hydrate/persist failures.

### Member

- `listMembers(query?)`
- `getMember(memberKey, query?)`
- `replicateMembers(query?)`
- `replicateMembersForDestination(destinationId, query?)`
- `syncMembers(options?)`
- `getMemberMasterList(query?)`
- `pruneMissingMembers(localKeys, sink, query?)`

Defaults:

- List ordering defaults to `ModificationTimestamp desc,MemberKey asc`.
- Sync/replication ordering defaults to `ModificationTimestamp asc,MemberKey asc`.
- Member sync normalizes embedded media and social media and supports optional inclusion filtering.

### Office

- `listOffices(query?)`
- `getOffice(officeKey, query?)`
- `replicateOffices(query?)`
- `replicateOfficesForDestination(destinationId, query?)`
- `syncOffices(options?)`
- `getOfficeMasterList(query?)`
- `pruneMissingOffices(localKeys, sink, query?)`

Defaults:

- List ordering defaults to `ModificationTimestamp desc,OfficeKey asc`.
- Sync/replication ordering defaults to `ModificationTimestamp asc,OfficeKey asc`.
- Office sync normalizes embedded media and social media and supports optional inclusion filtering.

### OpenHouse

- `listOpenHouses(query?)`
- `getOpenHouse(openHouseKey, query?)`
- `syncOpenHouses(options?)`

Defaults and behavior:

- List ordering defaults to `OpenHouseDate desc,OpenHouseKey asc`.
- Open houses have no DDF replication endpoint, so `syncOpenHouses` is query/list based.
- Sync can scope open house hydration to listing chunks and/or date windows.
- Sink hooks can upsert open houses and delete open houses for listing scopes.

### Destination

- `listDestinations(query?)`
- `getDestination(destinationId, query?)`
- `syncDestinations(query?, sink?)`

Defaults:

- List ordering defaults to `DestinationId asc`.
- `syncDestinations` is part of database sync orchestration because destinations provide feed context and replication scope.

### Lead

- `createLead(input, options?)`
- `LeadResponseSchema`
- `DdfLeadInputEncodeError`

Behavior:

- Posts JSON to `/v1/Lead/CreateLead`.
- Supports `SuppressEmail` through `options.suppressEmail`.
- Validates lead input before encoding.
- Lead creation remains separate from replication and sync resources.

## Selected Field Decoding

The resource wrappers are select-aware:

- List/get overloads narrow TypeScript return shapes when a typed `select` array is supplied.
- Runtime schemas also switch to partial selected-entity/list schemas when `$select` is present.
- Full schemas are used when no `select` is supplied.

This means callers can request partial payloads without forcing the SDK to decode fields that the API intentionally omitted.

## Normalization

Implemented embedded-resource helpers:

- `getPropertyRooms(property)`
- `getPropertyMedia(property)`
- `getMemberMedia(member)`
- `getOfficeMedia(office)`
- `normalizePropertyRooms(property)`
- `normalizeMedia(parentResource, parentKey, media)`
- `normalizePropertyGraph(property)`

Current behavior:

- Rooms remain embedded under Property at the API boundary.
- Media remains embedded under Property, Member, and Office at the API boundary.
- Normalized rows carry their parent resource/key so persistence adapters can store media and rooms independently.

## Sync And Watermarks

Implemented generic sync types include:

- `SyncMode`, `SyncResource`, and `SyncStage`
- `SyncOwner`
- `PropertyGraph`
- `SyncRecordError`
- `SyncCounts`
- `SyncResult`
- `PropertySyncSink`, `MemberSyncSink`, `OfficeSyncSink`, and `OpenHouseSyncSink`
- `DdfWatermarkStore`

Sync behavior:

- Incremental sync builds `ModificationTimestamp` filters from `since`/watermark data.
- Replication identifier pages are collected through `@odata.nextLink`.
- Hydration/persistence uses bounded concurrency and batch sizing.
- Results include identifiers, errors, counts, and `nextWatermark`.
- Sync functions update Effect metrics for hydrated, persisted, skipped, and failed counts.
- Optional `DdfWatermarkStore` integration can save/load processed replication cursors outside the database adapter.

## Database Adapter

A Drizzle/PostgreSQL adapter is implemented and exported through both the root entrypoint and the `./db` subpath.

Implemented pieces:

- `DdfDatabase` Effect service and env-backed database configuration.
- Drizzle schema for properties, members, offices, destinations, open houses, rooms, media, social media, member languages, member designations, sync runs, sync errors, and watermarks.
- SQL migrations under `src/db/migrations` copied into `dist/db/migrations` during build.
- `runDdfDatabaseMigrations` for migration execution.
- `makeDdfDatabaseSyncSink` implementing sync sink hooks against the Drizzle schema.
- Row mapping helpers such as `propertyRowFromRecord`, `memberRowFromRecord`, `officeRowFromRecord`, `destinationRowFromRecord`, `openHouseRowFromRecord`, `roomRowFromRecord`, `mediaRowFromRecord`, and `socialMediaRowFromRecord`.
- Database-backed watermark helpers: `loadDatabaseWatermark`, `saveDatabaseWatermark`, and `makeDatabaseWatermarkStore`.
- `DdfDbClient`, a read/query service for local application reads.

`DdfDbClient` currently supports:

- Field presets for properties, members, offices, and open houses.
- Projection planning and validated limit/offset options.
- Property listing queries with filters and includes for rooms, media, list member, co-list members, list office, and co-list offices.
- Member queries with media, social media, languages, and designations.
- Office queries with media and social media.
- OpenHouse queries with optional property includes.
- Destination reads.

## One-Shot Database Sync

`syncDdfDatabaseOnce(options?)` orchestrates a full database-oriented sync pass.

Current behavior:

- Optionally runs migrations first.
- Loads scoped database watermarks.
- Builds resource sync options from watermarks.
- Syncs destinations, properties, members, offices, and open houses.
- Persists through `makeDdfDatabaseSyncSink`.
- Saves scoped watermarks.
- Supports destination scoping, concurrency, resource-specific query overrides, open-house date windows, open-house listing chunk size, dependency injection for tests, and optional AOR scoping with `chosenAorKeys`/`CREA_CHOSEN_AOR_KEYS`.
- Returns per-resource summaries and the chosen AOR scope.

## Analytics, Metrics, And Telemetry

Analytics:

- `buildAnalyticsLogEventUrl(input, options?)`
- `logAnalyticsEvent(input, options?)`
- `DEFAULT_CREA_ANALYTICS_URL`

Metrics:

- Token request/refresh/cache hit/cache miss counters.
- API request/retry/failure counters and request duration timer.
- Sync hydrated/persisted/skipped/failed counters.
- Watermark load/save counters.

Telemetry helpers:

- `makeDdfOtlpTelemetryLayer(options)` for OTLP logging/tracing/metrics layers.
- `captureDdfFileTelemetry(effect, options)` for capturing logs, spans, and metrics to files around an Effect program.

## Test Coverage

The suite includes unit tests for:

- Auth/client behavior and HTTP error mapping.
- OData encoding and query validation.
- Resource wrapper paths and schemas.
- Select-aware response schemas.
- Normalizers.
- Sync orchestration, watermarks, and database sync behavior.
- Database client querying, sinks, row mapping, migrations, and watermark persistence.
- Analytics, metrics, and telemetry helpers.

Live CREA API checks are isolated in `src/live.integration.ts` and are run by `pnpm run test:live`, not by the default test script.
