# CREA DDF API SDK Guide

Source researched on 2026-05-04 from the official DDF API documentation at https://ddfapi-docs.realtor.ca/.

This directory is a handoff pack for building the Effect TypeScript SDK in this repo. The SDK should wrap the official DDF Web API without inventing resources that the OpenAPI definition does not expose.

## Start Here

Core resources, in the order requested:

1. Property listings - primary listing records at `/odata/v1/Property`.
2. Rooms - embedded child objects on `Property.Rooms`; no standalone room endpoint was exposed in the OpenAPI paths.
3. Media - embedded child objects on `Property.Media`, `Member.Media`, and `Office.Media`; no standalone media endpoint was exposed in the OpenAPI paths.
4. Members - agent/broker records at `/odata/v1/Member`.
5. Open houses - event records at `/odata/v1/OpenHouse`.
6. Destination - exists in the API at `/odata/v1/Destination`; use it for data feed context, especially technology-provider flows.
7. Office - exposed by metadata/OpenAPI and replication endpoints, but keep it later unless product needs it.

## Files

- `00-sdk-wrap-map.md` - the SDK method surface Codex should implement.
- `01-auth-and-client.md` - token, hosts, headers, client behavior.
- `02-odata-querying.md` - supported OData query options and pagination rules.
- `03-replication-sync.md` - how to do initial load, incremental sync, delete pruning, and the persistence boundary.
- `ddfapi-openapi.json` - raw embedded OpenAPI 3.0.4 spec from the docs page, included as an offline fallback if web fetch fails.
- `openapi-path-inventory.md` - generated list of every path from the embedded OpenAPI model.
- `model-field-inventory.md` - generated field checklist for core models.
- `resources/01-property-listings.md` - Property endpoint guide.
- `resources/02-rooms.md` - embedded room model guide.
- `resources/03-media.md` - embedded media model guide.
- `resources/04-members.md` - Member endpoint guide.
- `resources/05-open-houses.md` - OpenHouse endpoint guide.
- `resources/06-destination.md` - Destination endpoint guide.
- `resources/07-office-later.md` - Office endpoint notes for later.
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
- Office exists in OpenAPI and metadata, but keep it as a later wrapper unless needed.
- Lead creation exists at `/v1/Lead/CreateLead`, but it is not part of data replication.
- This SDK should not choose a database or ORM. Expose sync results and optional persistence hooks/sinks so the caller can save data with Drizzle, Prisma, raw SQL, Effect SQL, or any other app-owned storage layer.
- Use a small OData encoder plus raw `filter` strings and lightweight helpers. Do not build a huge typed method for every possible DDF search.
