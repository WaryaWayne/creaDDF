# Replication And Sync

Replication is the right path for local Property, Member, and Office database sync. The official docs warn that normal pagination should not be used for more than 10,000 listings; use the dedicated replication endpoints for these resources.

OpenHouse has no replication endpoint in the official path list, so OpenHouse sync is query/list based.

## Implemented Replication Endpoints

Property:

- `GET /odata/v1/Property/PropertyReplication()`
- `GET /odata/v1/Property/PropertyReplication(DestinationId={DestinationId})`

Member:

- `GET /odata/v1/Member/MemberReplication()`
- `GET /odata/v1/Member/MemberReplication(DestinationId={DestinationId})`

Office:

- `GET /odata/v1/Office/OfficeReplication()`
- `GET /odata/v1/Office/OfficeReplication(DestinationId={DestinationId})`

Replication query options:

- `$select`
- `$count`
- `$filter`
- `$orderby`

The SDK follows `@odata.nextLink` exactly when more identifier pages exist.

## Implemented Sync Functions

- `syncProperties(options?)`
- `syncMembers(options?)`
- `syncOffices(options?)`
- `syncOpenHouses(options?)`
- `syncDestinations(query?, sink?)`
- `syncDdfDatabaseOnce(options?)`

Property, Member, and Office sync use replication identifiers and hydrate full records by key. OpenHouse sync lists open houses by query/date/listing scope. Destination sync lists destinations and writes them through the optional sink.

## Sync Modes And Watermarks

Implemented modes:

- `initial` - caller can run without a prior watermark; query options still apply.
- `incremental` - uses a supplied `since` value or persisted database watermark to build `ModificationTimestamp` filters.

Implemented watermark support:

- `DdfWatermarkStore` service for generic application-provided watermarks.
- `loadDatabaseWatermark`, `saveDatabaseWatermark`, and `makeDatabaseWatermarkStore` for the built-in database adapter.
- Database watermarks are scoped by destination and optional chosen AOR keys.

## Property Sync Flow

Implemented behavior:

1. Build replication query with default order `ModificationTimestamp asc,ListingKey asc` unless the caller overrides `orderby`.
2. Read Property replication identifiers, including next pages.
3. Validate that each identifier has a usable `ListingKey`; invalid identifier rows become record errors.
4. Hydrate changed listings through `getProperty(ListingKey)`.
5. Normalize the property graph with property, rooms, and media.
6. Optionally call `PropertySyncSink.upsertPropertyGraph`.
7. Optionally save a property watermark through the sink and/or `DdfWatermarkStore`.
8. Return `SyncResult<PropertyReplicationIdentifier>` with identifiers, record errors, counts, and `nextWatermark`.

Additional maintenance helpers:

- `getPropertyMasterList(query?)`
- `diffLocalKeysAgainstMasterList(localKeys, masterKeys)`
- `pruneMissingProperties(localKeys, sink, query?)`

## Member Sync Flow

Implemented behavior:

1. Build replication query with default order `ModificationTimestamp asc,MemberKey asc` unless overridden.
2. Read Member replication identifiers, including next pages.
3. Validate `MemberKey`.
4. Hydrate members through `getMember(MemberKey)`.
5. Normalize embedded media and social media.
6. Optionally filter hydrated members through `includeMember`.
7. Optionally call member sink hooks.
8. Optionally save a member watermark through the sink and/or `DdfWatermarkStore`.
9. Return `SyncResult<MemberReplicationIdentifier>`.

Additional maintenance helpers:

- `getMemberMasterList(query?)`
- `pruneMissingMembers(localKeys, sink, query?)`

## Office Sync Flow

Implemented behavior:

1. Build replication query with default order `ModificationTimestamp asc,OfficeKey asc` unless overridden.
2. Read Office replication identifiers, including next pages.
3. Validate `OfficeKey`.
4. Hydrate offices through `getOffice(OfficeKey)`.
5. Normalize embedded media and social media.
6. Optionally filter hydrated offices through `includeOffice`.
7. Optionally call office sink hooks.
8. Optionally save an office watermark through the sink and/or `DdfWatermarkStore`.
9. Return `SyncResult<OfficeReplicationIdentifier>`.

Additional maintenance helpers:

- `getOfficeMasterList(query?)`
- `pruneMissingOffices(localKeys, sink, query?)`

## OpenHouse Sync Flow

Implemented behavior:

1. Build a list query using caller filters, optional listing scopes, and optional date windows.
2. Page through OpenHouse list results.
3. Optionally hydrate or persist open-house rows through sink hooks.
4. Optionally delete open houses for listing scopes before/around replacement, depending on sink behavior.
5. Return `SyncResult` with counts and errors.

Because OpenHouse has no replication endpoint, callers should use stable filters and order-by clauses for scheduled refresh jobs.

## Sink Interfaces

All hooks are optional. Without hooks, sync functions still return decoded records/identifiers, errors, counts, and watermarks.

Implemented sink types:

- `PropertySyncSink`
  - `upsertPropertyGraph(graph)`
  - `saveWatermark("Property", watermark)`
  - `markMissingPropertiesInactive(keys)`
  - `deleteOpenHousesForListings(listings)`
- `MemberSyncSink`
  - `upsertMemberWithMedia(member, media)`
  - `upsertSocialMedia(socialMedia, owner)`
  - `saveWatermark("Member", watermark)`
  - `markMissingMembersInactive(keys)`
- `OfficeSyncSink`
  - `upsertOfficeWithMedia(office, media)`
  - `upsertSocialMedia(socialMedia, owner)`
  - `saveWatermark("Office", watermark)`
  - `markMissingOfficesInactive(keys)`
- `OpenHouseSyncSink`
  - open-house upsert/delete hooks used by query/list sync

The built-in Drizzle/PostgreSQL implementation is created with `makeDdfDatabaseSyncSink`.

## Database Sync

`syncDdfDatabaseOnce(options?)` is the high-level database-oriented sync helper.

Implemented options include:

- `runId`
- `runMigrations`
- `destinationId`
- `concurrency`
- `destinationQuery`
- `propertyQuery`
- `memberQuery`
- `officeQuery`
- `openHouseQuery`
- `openHouseDateWindow`
- `openHouseListingChunkSize`
- `chosenAorKeys`
- dependency overrides for tests/custom orchestration

Implemented behavior:

1. Optionally run migrations.
2. Build/load a database sink.
3. Load scoped watermarks.
4. Sync destinations.
5. Sync properties, members, and offices with replication cursors.
6. Sync open houses by query/listing scope/date window.
7. Persist rows, sync runs, errors, and watermarks.
8. Return per-resource summaries, watermarks, and chosen AOR scope.

AOR scoping:

- `CREA_CHOSEN_AOR_KEYS` accepts comma-separated values or a JSON array.
- AOR filtering applies to persisted Property/Member/Office rows and OpenHouse listing scopes where the hydrated row exposes the relevant AOR key.
- Replication identifier queries themselves are not AOR-filtered because identifier rows do not expose those resource-specific AOR fields.

## Master-List Pruning

The official replication master list represents records currently active and approved for distribution. The SDK exposes explicit prune helpers instead of silently deleting data during ordinary sync:

- `pruneMissingProperties(localKeys, sink, query?)`
- `pruneMissingMembers(localKeys, sink, query?)`
- `pruneMissingOffices(localKeys, sink, query?)`

These helpers diff local keys against master-list keys and call the corresponding sink `markMissing*Inactive` hook.

## Observability

Sync updates Effect metrics for:

- hydrated records
- persisted records
- skipped records
- failed records

Sync also logs progress around identifier collection, hydration, persistence, and failures. Telemetry can be captured through `makeDdfOtlpTelemetryLayer` or `captureDdfFileTelemetry`.
