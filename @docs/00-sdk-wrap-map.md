# SDK Wrap Map

This is the current implemented SDK surface. The package is an Effect-native helper library for the CREA DDF API, with an optional Drizzle/PostgreSQL adapter for applications that want ready-made persistence.

## Boundaries

The core SDK owns:

- Auth token acquisition, caching, forced refresh, and proactive renewal.
- HTTP request construction, bearer-token attachment, retries, status/error mapping, JSON parsing, and schema decoding.
- OData query encoding and validation.
- Pagination through `@odata.nextLink`.
- Resource list/get wrappers.
- Replication identifier reads for Property, Member, and Office.
- Hydrating changed records by key.
- Effect Schema validation, including select-aware partial decoders.
- Normalizing embedded records like `Rooms`, `Media`, and social media.
- Structured sync results, per-record errors, metrics, and optional watermarks.
- Optional persistence sink interfaces.

The optional database adapter owns:

- Drizzle/PostgreSQL schema and migrations.
- Row mapping from decoded CREA DDF records.
- Sink implementations for sync persistence.
- Database-backed watermark storage.
- Local read/query helpers through `DdfDbClient`.
- One-shot database sync orchestration.

The caller still owns:

- Scheduling sync runs.
- Choosing whether to use the built-in database adapter or custom sinks.
- App-specific indexing/search denormalization beyond the provided schema.
- Product-specific delete/prune policy, unless using the explicit prune helpers.
- UI/application handling of lead creation, analytics events, and local reads.

## Client Core

Implemented services/functions:

- `makeDdfLayer(config)` - composes config, Effect fetch HTTP, auth, and DDF HTTP services.
- `makeDdfLayerFromEnv` - reads env-backed config and returns the composed layer.
- `DdfConfig` - Effect context service for `DdfClientConfig`.
- `DdfAuth.getAccessToken(options?)` - cached OAuth client-credentials access token, with `forceRefresh` support.
- `DdfHttp.requestJson<T>(path, init?, schema?)` - authenticated JSON request with retries, 401 refresh, status errors, JSON parsing, and optional schema decoding.
- `DdfHttp.listOData<T>(path, query?, schema?)` - one-page list request.
- `DdfHttp.getOData<T>(path, key, query?, schema?)` - single record lookup using OData key syntax.
- `DdfHttp.replicateIdentifiers<T>(path, query?, schema?)` - one-page replication identifier request.
- `DdfHttp.paginateOData(first)` - follows `@odata.nextLink` and concatenates `value` arrays.

Implemented config:

```ts
interface DdfClientConfig {
  readonly clientId: string;
  readonly clientSecret: string | Redacted.Redacted<string>;
  readonly baseUrl?: string;
  readonly identityUrl?: string;
  readonly analyticsUrl?: string;
  readonly retryPolicy?: DdfRetryPolicy;
  readonly tokenExpiryBuffer?: Duration.Input;
  readonly logger?: DdfLogger;
}
```

## Shared Query Types

List endpoints use:

```ts
interface ODataListQuery<Field extends string = string> {
  readonly select?: ReadonlyArray<Field>;
  readonly filter?: string;
  readonly count?: boolean;
  readonly top?: number;
  readonly skip?: number;
  readonly orderby?: string | ReadonlyArray<string>;
}
```

Single record lookups use:

```ts
interface ODataGetQuery<Field extends string = string> {
  readonly select?: ReadonlyArray<Field>;
}
```

Replication uses:

```ts
interface ReplicationQuery<Field extends string = string> {
  readonly select?: ReadonlyArray<Field>;
  readonly count?: boolean;
  readonly filter?: string;
  readonly orderby?: string | ReadonlyArray<string>;
}
```

The OData encoder intentionally keeps a raw `filter` string escape hatch and small composable helpers instead of replacing DDF/OData with hundreds of brittle one-off searches.

## OData Helpers

Implemented:

- `encodeODataQuery(query?)`
- `keyLiteral(key)`
- `filters.eq(field, value)`
- `filters.ne(field, value)`
- `filters.gt(field, value)`
- `filters.lt(field, value)`
- `filters.ge(field, value)`
- `filters.le(field, value)`
- `filters.in(field, values)`
- `filters.has(field, value)`
- `filters.modifiedAfter(field, dateOrString)`
- `filters.not(clause)`
- `filters.any(collection, variable, clause)`
- `filters.and(...clauses)`
- `filters.or(...clauses)`

Validation:

- `$top` must be an integer from `0` through `100`.
- `$skip` must be a non-negative integer.
- Unsupported/invalid query shapes fail with tagged OData errors.

## Resource Coverage

### Property Listings

Implemented:

- `listProperties(query?)`
- `getProperty(propertyKey, query?)`
- `replicateProperties(query?)`
- `replicatePropertiesForDestination(destinationId, query?)`
- `syncProperties(options?)`
- `getPropertyMasterList(query?)`
- `diffLocalKeysAgainstMasterList(localKeys, masterKeys)`
- `pruneMissingProperties(localKeys, sink, query?)`

Notes:

- The API route parameter is `PropertyKey`; local identity is `ListingKey`.
- Properties embed `Rooms` and `Media`.
- Property sync hydrates by `ListingKey`, normalizes a `PropertyGraph`, calls optional sink hooks, records errors by stage, and returns counts plus `nextWatermark`.
- Default list order is `ModificationTimestamp desc,ListingKey asc`.
- Default sync order is `ModificationTimestamp asc,ListingKey asc`.

### Rooms

Rooms remain embedded under Property. Implemented helpers:

- `getPropertyRooms(property)`
- `normalizePropertyRooms(property)`
- `normalizePropertyGraph(property)`

The database adapter persists normalized room rows. There is intentionally no standalone HTTP room endpoint.

### Media

Media remains embedded under Property, Member, and Office. Implemented helpers:

- `getPropertyMedia(property)`
- `getMemberMedia(member)`
- `getOfficeMedia(office)`
- `normalizeMedia(parentResource, parentKey, media)`
- `normalizePropertyGraph(property)`

The database adapter persists normalized media rows. There is intentionally no standalone HTTP media endpoint.

### Members

Implemented:

- `listMembers(query?)`
- `getMember(memberKey, query?)`
- `replicateMembers(query?)`
- `replicateMembersForDestination(destinationId, query?)`
- `syncMembers(options?)`
- `getMemberMasterList(query?)`
- `pruneMissingMembers(localKeys, sink, query?)`

Notes:

- Identity is `MemberKey`.
- Member sync normalizes embedded `Media` and `MemberSocialMedia`.
- Sync supports optional include filtering and persistence hooks.
- Default list order is `ModificationTimestamp desc,MemberKey asc`.
- Default sync order is `ModificationTimestamp asc,MemberKey asc`.

### Offices

Implemented:

- `listOffices(query?)`
- `getOffice(officeKey, query?)`
- `replicateOffices(query?)`
- `replicateOfficesForDestination(destinationId, query?)`
- `syncOffices(options?)`
- `getOfficeMasterList(query?)`
- `pruneMissingOffices(localKeys, sink, query?)`

Notes:

- Identity is `OfficeKey`.
- Office sync normalizes embedded `Media` and `OfficeSocialMedia`.
- Sync supports optional include filtering and persistence hooks.
- Default list order is `ModificationTimestamp desc,OfficeKey asc`.
- Default sync order is `ModificationTimestamp asc,OfficeKey asc`.

### Open Houses

Implemented:

- `listOpenHouses(query?)`
- `getOpenHouse(openHouseKey, query?)`
- `syncOpenHouses(options?)`

Notes:

- Identity is `OpenHouseKey`.
- There is no OpenHouse replication endpoint in the official path list; sync is query/list based.
- Sync supports explicit listing scopes, date windows, concurrency, and sink hooks.
- Default list order is `OpenHouseDate desc,OpenHouseKey asc`.

### Destinations

Implemented:

- `listDestinations(query?)`
- `getDestination(destinationId, query?)`
- `syncDestinations(query?, sink?)`

Notes:

- Identity is `DestinationId`.
- Destination sync is part of the database sync flow.
- Default list order is `DestinationId asc`.

### Leads

Implemented:

- `createLead(input, options?: { suppressEmail?: boolean })`
- `LeadResponseSchema`
- `DdfLeadInputEncodeError`

Notes:

- Lead creation posts to `/v1/Lead/CreateLead`.
- Lead input is validated/encoded before posting.
- Lead creation is not part of replication or database sync.

## Select-Aware Schemas

Resource list/get wrappers are select-aware:

- With no `select`, full resource schemas decode the response.
- With `select`, the wrapper uses partial entity/list schemas so the API can omit unselected fields.
- TypeScript overloads narrow return types for literal `select` arrays.

This applies to Property, Member, Office, OpenHouse, and Destination resource wrappers.

## Sync Options And Sinks

Implemented common options:

```ts
interface BaseSyncOptions {
  readonly mode?: "initial" | "incremental";
  readonly since?: string;
  readonly destinationId?: number;
  readonly concurrency?: number;
  readonly query?: ReplicationQuery;
}
```

Implemented sink interfaces:

- `PropertySyncSink`
- `MemberSyncSink`
- `OfficeSyncSink`
- `OpenHouseSyncSink`

Implemented result shape:

```ts
interface SyncResult<Identifier = unknown> {
  readonly resource: SyncResource;
  readonly identifiers: ReadonlyArray<Identifier>;
  readonly errors: ReadonlyArray<SyncRecordError>;
  readonly counts: SyncCounts;
  readonly nextWatermark: string | null;
}
```

Sync functions can run without sinks for pure SDK usage, or with sinks for persistence. A `DdfWatermarkStore` service can be provided to persist watermarks outside the built-in database adapter.

## Database Adapter Surface

Exported from the root package and the `./db` subpath:

- `DdfDatabase`
- `DdfDatabaseConfig`
- `ddfDatabaseConfigFromEnv`
- Drizzle tables and migrations under `src/db/schema.ts` and `src/db/migrations`
- `runDdfDatabaseMigrations`
- `makeDdfDatabaseSyncSink`
- `loadDatabaseWatermark`
- `saveDatabaseWatermark`
- `makeDatabaseWatermarkStore`
- `DdfDbClient`
- Row mapping helpers for properties, rooms, media, members, social media, offices, destinations, and open houses
- `syncDdfDatabaseOnce(options?)`
- `databaseSyncOptionsFromWatermarks(watermarks, options?)`
- `parseChosenAorKeys(value)` and `chosenAorKeysFromEnv()`

The adapter currently models properties, rooms, media, members, social media, offices, destinations, open houses, sync runs, sync errors, and scoped watermarks.

## Analytics, Metrics, And Telemetry

Implemented analytics helpers:

- `buildAnalyticsLogEventUrl(input, options?)`
- `logAnalyticsEvent(input, options?)`
- `DEFAULT_CREA_ANALYTICS_URL`

Implemented metrics:

- token request, refresh, cache hit, and cache miss counters
- API request, retry, and failure counters
- request duration timer
- sync hydrated, persisted, skipped, and failed counters
- watermark load and save counters

Implemented telemetry helpers:

- `makeDdfOtlpTelemetryLayer(options)`
- `captureDdfFileTelemetry(effect, options)`

## Verification Commands

Use these from the repo root:

```sh
pnpm run typecheck
pnpm test
pnpm run build
pnpm run check:metadata
```

Live API checks remain opt-in:

```sh
pnpm run test:live
```
