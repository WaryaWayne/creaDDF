# CREA DDF API SDK Guide

Source researched on 2026-05-04 from the official DDF API documentation at https://ddfapi-docs.realtor.ca/.

This directory is a handoff pack for building the Effect TypeScript SDK in this repo. The SDK should wrap the official DDF Web API without inventing resources that the OpenAPI definition does not expose.

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
- `resources/07-office-later.md` - Office endpoint notes; despite the filename, Office is exposed and should be wrapped for thorough coverage.
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
} from "crea-ddf-effect-sdk";

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
