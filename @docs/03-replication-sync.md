# Replication Sync

Replication is the right path for local database sync. The docs say normal pagination should not be used for more than 10,000 listings; use the dedicated replication endpoints.

## Replication Endpoints

Property:

- `/odata/v1/Property/PropertyReplication`
- `/odata/v1/Property/PropertyReplication(DestinationId={DestinationId})`

Member:

- `/odata/v1/Member/MemberReplication`
- `/odata/v1/Member/MemberReplication(DestinationId={DestinationId})`

Office:

- `/odata/v1/Office/OfficeReplication`
- `/odata/v1/Office/OfficeReplication(DestinationId={DestinationId})`

No OpenHouse replication endpoint was exposed in the OpenAPI path list.

## Replication Response

Replication returns identifiers and modification timestamps only:

```ts
type PropertyIdentifier = {
  ListingKey?: string | null;
  ModificationTimestamp?: string | null;
};

type MemberIdentifier = {
  MemberKey?: string | null;
  ModificationTimestamp?: string | null;
};

type OfficeIdentifier = {
  OfficeKey?: string | null;
  ModificationTimestamp?: string | null;
};
```

Hydrate changed records by calling the main single-record endpoint for each key.

## Initial Load

1. Read the full active identifier set from `PropertyReplication`.
2. Batch hydrate each `ListingKey` from `/odata/v1/Property/{PropertyKey}`.
3. Decode the hydrated property with Effect Schema.
4. Normalize embedded `Rooms` and `Media` into linked records.
5. Return the property graph, or call optional persistence hooks if supplied.
6. Return the highest processed `ModificationTimestamp` as `nextWatermark`.

Repeat the same pattern for members if the app needs agent data.

## Incremental Sync

Use a timestamp filter on replication:

```txt
/odata/v1/Property/PropertyReplication?$filter=ModificationTimestamp gt 2024-01-25T00:00:00.00Z
```

Then hydrate each returned key from the main endpoint.

Suggested SDK orchestration:

- `getPropertyChangesSince(watermark)`
- `hydrateProperties(keys, concurrency)`
- `normalizePropertyGraph(property)` - property plus rooms/media
- `syncProperties(options)` - returns records/results and optionally calls caller-provided hooks
- `nextWatermark` - returned to the caller so the app can persist it wherever it wants

Example helper-library style:

```ts
syncProperties({
  mode: "incremental",
  since: lastWatermark,
  destinationId,
  concurrency: 5,
  onProperty: async (property) => {},
  onRoom: async (room, property) => {},
  onMedia: async (media, owner) => {},
  onWatermark: async (watermark) => {},
});
```

All hooks should be optional. Without hooks, the same function should still return decoded records and a summary so callers can save data themselves.

## Delete And Prune

The docs say the replication master list represents records currently active and approved for distribution. Records in the local database that are missing from the master list should be removed or marked inactive locally.

Implement this as an explicit maintenance job:

- `getPropertyMasterList()`
- `diffLocalKeysAgainstMasterList()`
- `pruneMissingProperties()`

Do not infer deletes from an empty incremental sync. Use the master list comparison.

## Scheduling

The API does not schedule for us; the SDK should expose composable sync effects that callers can run hourly, daily, or weekly.

Good surface:

```ts
syncProperties({
  mode: "incremental",
  since: lastWatermark,
  destinationId,
  concurrency: 5,
});
```

The caller owns cron/timer scheduling. The SDK owns safe request flow, token renewal, pagination, hydration, validation, and sync result reporting.

## Persistence Boundary

The core SDK should remain usable without a database, but the intended persistence adapter target is Drizzle ORM with Effect SQL integration where it fits.

The SDK should expose a persistence boundary that can be implemented by the caller's app. This can be plain callback hooks and/or a formal adapter interface:

```ts
type PropertySyncSink = {
  upsertProperty?: (property: PropertyListing) => Effect.Effect<void, unknown>;
  upsertRoom?: (
    room: PropertyRoom,
    property: PropertyListing,
  ) => Effect.Effect<void, unknown>;
  upsertMedia?: (
    media: Media,
    owner: SyncOwner,
  ) => Effect.Effect<void, unknown>;
  saveWatermark?: (
    resource: SyncResource,
    watermark: string,
  ) => Effect.Effect<void, unknown>;
  markMissingPropertiesInactive?: (
    keys: ReadonlyArray<string>,
  ) => Effect.Effect<void, unknown>;
};
```

The app using this library can implement that sink with Drizzle ORM. Once the data is in the app database, the app owns querying and cross-linking.

Effect SQL is the preferred Effect-native SQL path for the persistence adapter because it provides core SQL abstractions and database-specific adapters. Drizzle ORM should be the intended ORM/query-builder layer for app persistence, with Effect SQL integration/driver support used where it fits cleanly.

Implementation guidance:

- Build the core SDK so list/get/query methods have no required DB dependency.
- Define the sink/callback interface in core types.
- Provide an in-memory sink for tests/examples.
- Add a Drizzle persistence adapter when implementing database save examples.
- Use Effect SQL integration/driver support for that adapter when it is practical.
- Do not copy or commit large local reference repos into this package.
