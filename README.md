# CREA DDF

CREA DDF is a TypeScript package for working with the CREA DDF API, syncing the feed into Postgres, and reading that synced data from frontend applications.

The core flow is:

```text
CREA DDF API -> syncDdfDatabaseOnce -> Postgres/Drizzle tables -> DdfDbClient -> frontend
```

You can still use the API client directly for live DDF reads, but the normal application path is now database-first: run the sync job, store the normalized listing/member/office/open-house data, then let the frontend query the local database through the exported DB client.

## Requirements

- Bun `1.3.0` or newer
- Node.js `24.14.0` or newer
- PostgreSQL
- CREA DDF API credentials

## Install

```sh
bun install
```

The install runs the Effect TypeScript patch through the package `prepare` script. Keep that in place; the Effect LSP warnings are useful and catch real SDK mistakes.

## Environment

Create a local `.env` file or export these variables in your shell:

```sh
DATABASE_URL="postgres://user:password@localhost:5432/crea_ddf"
CREA_DDF_CLIENT_ID="your-client-id"
CREA_DDF_CLIENT_SECRET="your-client-secret"

# Optional defaults
CREA_DDF_BASE_URL="https://ddfapi.realtor.ca"
CREA_DDF_AUTH_URL="https://identity.crea.ca/connect/token"
CREA_ANALYTICS_URL=""

# Optional database-sync scope. Accepts comma-separated values or a JSON array.
CREA_CHOSEN_AOR_KEYS="76,77,93"
```

`CREA_DDF_BASE_URL` should be the API host only, not `/odata/v1`.

## Database Setup

Run migrations before the first sync:

```sh
bun run db:migrate
```

Useful database commands:

```sh
bun run db:generate
bun run db:push
bun run db:studio
```

`db:generate` creates migrations after schema changes. `db:migrate` applies the checked-in migrations. `db:studio` opens Drizzle Studio against `DATABASE_URL`.

## Sync DDF To Postgres

Run a full database sync with file telemetry:

```sh
bun run sync:otel
```

That command:

- authenticates with CREA DDF
- runs database migrations
- syncs destinations, properties, members, offices, and open houses
- saves database watermarks for incremental property/member/office sync
- records sync runs and sync errors
- writes logs, spans, and Prometheus-style metrics under `.otel/`

Open houses do not have a DDF replication endpoint, so they are synced from the listings already stored in the database and default to a 30-day date window.

## Read Synced Data In A Frontend

Use the `./db` export in server loaders, API routes, or other backend code that feeds the frontend. The frontend should query your app server; it should not receive CREA credentials.

```ts
import { Effect, Layer } from "effect";
import { DdfDatabase, DdfDbClient } from "crea-ddf/db";

const dbReadLayer = DdfDbClient.layer.pipe(
  Layer.provide(DdfDatabase.layerConfig),
);

const listingsForSearchPage = Effect.gen(function* () {
  const ddf = yield* DdfDbClient;

  return yield* ddf.properties.list({
    filters: {
      active: true,
      city: "Toronto",
      province: "Ontario",
      minBedrooms: 2,
    },
    include: {
      media: { select: ["mediaUrl", "preferredPhoto"] },
      listOffice: { select: ["officeName", "phone"] },
    },
    limit: 24,
    orderBy: [{ field: "modificationTimestamp", direction: "desc" }],
  });
}).pipe(Effect.provide(dbReadLayer));
```

The database client also exposes `members`, `offices`, `openHouses`, and `destinations`, with typed filters, field projections, pagination, and includes.

## Use The Live API Client

For direct DDF API reads, provide the DDF layer and call the resource helpers:

```ts
import { Effect } from "effect";
import { listProperties, makeDdfLayerFromEnv } from "crea-ddf";

const program = Effect.gen(function* () {
  return yield* listProperties({
    top: 10,
    orderby: ["ModificationTimestamp desc", "ListingKey asc"],
  });
}).pipe(Effect.provide(makeDdfLayerFromEnv));
```

Prefer the database path for frontend search and detail pages once sync is enabled.

## Development

```sh
bun run typecheck
bun run test
bun run build
bun run check:metadata
```

Live CREA checks are opt-in and require credentials:

```sh
bun run test:live
```

Generated build output goes to `dist/`. Database migrations are copied to `dist/db/migrations` during `bun run build` so the published package can run migrations at runtime.

## Docs

Start with [`@docs/README.md`](@docs/README.md) for the full SDK/API guide and [`@docs/09-current-implementation.md`](@docs/09-current-implementation.md) for the current package, runtime, database, sync, telemetry, and test status.
