# CREA DDF API SDK Guide

Source re-checked on 2026-05-14 from the official DDF API documentation and release notes at https://ddfapi-docs.realtor.ca/.

This directory is a handoff pack and maintenance reference for the Effect TypeScript SDK in this repo. The SDK wraps the official DDF Web API without inventing resources that the OpenAPI definition does not expose.

## Current SDK Status

The implementation has moved past the original planning-only state. Keep these docs aligned with the exported package surface before using them as implementation instructions:

- Package import name: `@warya/crea-ddf`.
- Layer constructors: `makeDdfLayer(config)` and `makeDdfLayerFromEnv`.
- Resource helpers are exported for Property, Member, Office, OpenHouse, Destination, Lead, replication, normalization, sync, telemetry, metrics, watermarks, and the optional Drizzle persistence adapter.
- Read/list/get methods are still database-free. The Drizzle/Effect SQL pieces are optional sync/persistence helpers, not a requirement for direct API reads.
- The local offline OpenAPI snapshot still matches the live embedded OpenAPI path and schema inventory as of 2026-05-14: 17 paths and 157 schemas.

## Current Upstream Release Notes To Watch

The official release notes now include several post-May-2025 updates that affect schemas and persistence assumptions:

- 2026-05-07: `Media.MediaKey` is changing from numeric/bigint semantics to a stable string format of `<ObjectID>_<MediaCategoryId>_<MediaPosition>`. Consumers should watch each media row's own `ModificationTimestamp`; unrelated parent payload changes should no longer churn every media key after CREA's rollout. A one-time Member media reseed is expected.
- 2026-02-05: Property responses include National Association ID fields for listing agents and offices, and Lead matching supports `CoListAgentKey2` / `CoListAgentKey3`.
- 2025-11-26: `MapCoordinateVerifiedYN` is deprecated. Prefer `GeoCodeManualYN` when present in live payloads/metadata. The embedded OpenAPI snapshot currently documents the deprecation text but does not expose a `GeoCodeManualYN` property.
- 2025-08-01: `$filter=contains(...)` substring filtering is supported on string fields for Property, Office, and Member endpoints. Lookup fields should still use metadata lookup values rather than free-text substring filters.
- 2025-06-26: Property responses include additional co-listing agent and office key fields (`CoListAgentKey2`, `CoListAgentKey3`, `CoListOfficeKey2`, and `CoListOfficeKey3`).

## Start Here

Core resources, in the order requested. Build broad coverage for the exposed API; do not half-build the SDK surface if the docs/OpenAPI clearly expose a method.

1. Property listings - primary listing records at `/odata/v1/Property`.
2. Rooms - embedded child objects on `Property.Rooms`; no standalone room endpoint was exposed in the OpenAPI paths.
3. Media - embedded child objects on `Property.Media`, `Member.Media`, and `Office.Media`; no standalone media endpoint was exposed in the OpenAPI paths.
4. Members - agent/broker records at `/odata/v1/Member`.
5. Open houses - event records at `/odata/v1/OpenHouse`.
6. Destination - exists in the API at `/odata/v1/Destination`; use it for data feed context, especially technology-provider flows.
7. Office - exposed by metadata/OpenAPI and replication endpoints; include after the requested core resources rather than omitting it.
8. Lead - exposed by the API for contact form submission; keep separate from replication, but implement when method coverage is being completed.

## Files

- `00-sdk-wrap-map.md` - the SDK method surface Codex should implement.
- `01-auth-and-client.md` - token, hosts, headers, client behavior.
- `02-odata-querying.md` - supported OData query options and pagination rules.
- `03-replication-sync.md` - how to do initial load, incremental sync, delete pruning, and the persistence boundary.
- `04-implementation-standards.md` - required Effect implementation style and colocated test rules.
- `ddfapi-openapi.json` - raw embedded OpenAPI 3.0.4 spec from the docs page, included as an offline fallback if live documentation retrieval fails.
- `openapi-path-inventory.md` - generated list of every path from the embedded OpenAPI model.
- `model-field-inventory.md` - generated field checklist for core models.
- `resources/01-property-listings.md` - Property endpoint guide.
- `resources/02-rooms.md` - embedded room model guide.
- `resources/03-media.md` - embedded media model guide.
- `resources/04-members.md` - Member endpoint guide.
- `resources/05-open-houses.md` - OpenHouse endpoint guide.
- `resources/06-destination.md` - Destination endpoint guide.
- `resources/07-office-later.md` - Office endpoint notes; despite the filename, Office is exposed and wrapped for thorough coverage.
- `resources/08-leads.md` - Lead endpoint, which exists but is not part of replication.

## Important Findings

- The public API host is `https://ddfapi.realtor.ca`.
- OData routes live under `/odata/v1`.
- Authentication is OAuth2 client credentials against `https://identity.crea.ca/connect/token`.
- Tokens last 3600 seconds and are not sliding tokens, so the SDK should renew proactively.
- List endpoints support `$select`, `$count`, `$filter`, `$top`, `$skip`, and `$orderby`.
- Single-record endpoints support key lookup plus `$select`.
- Page size defaults to 20 and `$top` can increase it up to 100 records.
- The docs warn that paginated results have no guaranteed order; always use `$orderby`.
- For more than 10,000 listings, use replication endpoints instead of list pagination.
- Replication endpoints exist for Property, Member, and Office only.
- Replication responses return identifiers plus `ModificationTimestamp`, not full records. Hydrate details by key from the main resource endpoint.
- Destination exists and has list/get endpoints.
- Office exists in OpenAPI and metadata and should be included for thorough SDK coverage after Property, Rooms, Media, Members, OpenHouse, and Destination.
- Lead creation exists at `/v1/Lead/CreateLead`, but it is not part of data replication.
- The core SDK should not require a database for read/list/get methods. For persistence examples/adapters, the intended app-side target is Drizzle ORM, with Effect SQL integration where it fits cleanly.
- Expose sync results and persistence hooks/sinks so the caller can save data with the Drizzle/Effect SQL adapter, or ignore persistence and manage storage itself.
- Use a complete OData encoder plus raw `filter` strings and lightweight helpers. Do not replace the generic filter surface with hundreds of brittle one-off search methods.
- Local reference repos may exist for Codex to inspect, but do not copy or commit reference repos into this package.

## Effect-native usage example

This SDK is intentionally service/layer based. Create an Effect program that yields SDK effects and provide `makeDdfLayer` at the edge of your application; do not construct a standalone imperative client inside business logic.

```ts
import { Config, Effect, Redacted } from "effect";
import {
  filters,
  listDestinations,
  listProperties,
  makeDdfLayer,
} from "@warya/crea-ddf";

const appConfig = Config.all({
  clientId: Config.redacted("CREA_DDF_CLIENT_ID"),
  clientSecret: Config.redacted("CREA_DDF_CLIENT_SECRET"),
});

const program = Effect.gen(function* () {
  const config = yield* appConfig;
  const ddfLayer = makeDdfLayer({
    clientId: Redacted.value(config.clientId),
    clientSecret: Redacted.value(config.clientSecret),
  });

  return yield* Effect.gen(function* () {
    const destinations = yield* listDestinations({ top: 1 });
    const properties = yield* listProperties({
      top: 1,
      filter: filters.modifiedAfter(
        "ModificationTimestamp",
        "2024-01-01T00:00:00.000Z",
      ),
    });

    return { destinations, properties };
  }).pipe(Effect.provide(ddfLayer));
});

await Effect.runPromise(program);
```

Persistence remains an application boundary: replication/sync helpers expose records, errors, watermarks, and optional sink hooks, but the SDK does not own a database.
