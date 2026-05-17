# CREA DDF API SDK Guide

Source researched on 2026-05-04 from the official DDF API documentation at https://ddfapi-docs.realtor.ca/. Implementation status updated against this repository on 2026-05-16.

This directory documents the implemented Effect TypeScript SDK in this repo and the official DDF Web API surface it wraps. It is no longer only a build handoff pack: use `09-current-implementation.md` for the current package/runtime/database status and the other documents for API-specific notes.

## Start Here

Core implemented resources:

1. Property listings - list/get, replication, destination replication, sync, master-list diff/prune, rooms/media normalization, and database persistence hooks.
2. Rooms - embedded child objects on `Property.Rooms`; implemented as normalization helpers and database rows, not standalone HTTP endpoints.
3. Media - embedded child objects on `Property.Media`, `Member.Media`, and `Office.Media`; implemented as normalization helpers and database rows, not standalone HTTP endpoints.
4. Members - list/get, replication, destination replication, sync, master-list prune, media/social normalization, and database persistence hooks.
5. Open houses - list/get and query-based sync, including listing/date scoping for database sync.
6. Destination - list/get and database sync for feed context.
7. Office - list/get, replication, destination replication, sync, master-list prune, media/social normalization, and database persistence hooks.
8. Lead - implemented as non-replication contact form submission via `/v1/Lead/CreateLead`.

## Files

- `00-sdk-wrap-map.md` - the implemented SDK method surface and remaining boundaries.
- `01-auth-and-client.md` - token, hosts, headers, client behavior.
- `02-odata-querying.md` - supported OData query options and pagination rules.
- `03-replication-sync.md` - how to do initial load, incremental sync, delete pruning, and the persistence boundary.
- `04-implementation-standards.md` - required Effect implementation style and colocated test rules.
- `09-current-implementation.md` - current implemented package, runtime, sync, database, telemetry, and test status.
- `ddfapi-openapi.json` - raw embedded OpenAPI 3.0.4 spec from the docs page, included as an offline fallback if live documentation retrieval fails.
- `openapi-path-inventory.md` - generated list of every path from the embedded OpenAPI model.
- `model-field-inventory.md` - generated field checklist for core models.
- `resources/01-property-listings.md` - Property endpoint guide.
- `resources/02-rooms.md` - embedded room model guide.
- `resources/03-media.md` - embedded media model guide.
- `resources/04-members.md` - Member endpoint guide.
- `resources/05-open-houses.md` - OpenHouse endpoint guide.
- `resources/06-destination.md` - Destination endpoint guide.
- `resources/07-office-later.md` - Office endpoint notes; filename is historical, and Office is now implemented.
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
- Office exists in OpenAPI and metadata and is implemented with list/get/replication/sync/database support.
- Lead creation exists at `/v1/Lead/CreateLead`, is implemented, and is intentionally not part of data replication.
- The core SDK does not require a database for read/list/get methods. A Drizzle/PostgreSQL adapter is implemented separately and exported through `./db`.
- Runtime support starts at Node `24.14.0` because the published ESM output uses package-internal `#/` imports. Bun `1.3.0` or newer is required for Bun-oriented scripts.
- Sync results and persistence hooks/sinks are implemented so callers can use the built-in Drizzle adapter or manage storage themselves.
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
} from "crea-ddf";

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

Persistence remains optional for the core client: replication/sync helpers expose records, errors, watermarks, and sink hooks. The package also includes an opt-in Drizzle/PostgreSQL adapter for applications that want a ready-made persistence boundary.
