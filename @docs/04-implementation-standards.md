# Implementation Standards

These rules apply to every SDK module added under `src`.

## Effect Function Shape

SDK behavior should be implemented with native Effect functions, not plain JavaScript functions that manually return `Effect.gen`.

Use named `Effect.fn` wrappers so spans, telemetry, stack traces, and failure reports identify the real SDK operation:

```ts
export const listProperties = Effect.fn("DdfProperty.listProperties")(
  function* (query?: ODataListQuery<PropertyField>) {
    const client = yield* DdfHttp;
    return yield* client.listOData(
      "/odata/v1/Property",
      query,
      PropertyListSchema,
    );
  },
);
```

Use `Effect.gen` inside the `Effect.fn` generator body through `yield*`; do not wrap the exported method as a regular function whose only job is returning `Effect.gen`.

The name passed to `Effect.fn` should be stable and specific:

- Prefix client/core methods with `DdfClient`, `DdfAuth`, `DdfHttp`, or `DdfOData`.
- Prefix resource methods with the resource service, such as `DdfProperty.listProperties`.
- Prefix sync methods with the sync service, such as `DdfPropertySync.syncProperties`.

Plain synchronous helpers are still acceptable for deterministic value transforms such as OData query encoding, key escaping, field lists, and normalization, but anything that reads context, calls a service, performs IO, decodes API responses, retries, or participates in sync orchestration should be an `Effect.fn`.

## Tests Beside Methods

Every implementation file must have a colocated test file beside it.

Examples:

```txt
src/client.ts
src/client.test.ts
src/odata.ts
src/odata.test.ts
src/resources/property.ts
src/resources/property.test.ts
src/sync/property.ts
src/sync/property.test.ts
```

When a file exports several SDK methods, the adjacent test file must cover each exported method in that file. Do not add a method without adding or updating the beside-it test file in the same change.

## Effect Test And Mocking Rules

Use Effect's test integration for SDK tests. Prefer `@effect/vitest` style tests, such as `describe`, `it.effect`, `assert`, and `expect`, once the test dependency is added.

Tests should mock yielded services through Effect Context and Layer composition instead of monkey-patching globals.

Mock these boundaries through services:

- Native Effect HTTP transport.
- Clock/time for token expiry and retry backoff.
- Logger/telemetry observer when behavior depends on emitted diagnostics.
- Persistence sinks for sync workflows.
- Token provider/auth service when testing resource methods above HTTP.

Do not call the live CREA API in normal unit tests. Live credential checks should be opt-in integration tests that are clearly separated from the default `pnpm test` command.

Minimum coverage expectations:

- Auth: token request body, token caching, proactive refresh, 401 refresh-once behavior.
- OData: `$select`, `$count`, `$filter`, `$top`, `$skip`, `$orderby`, key escaping, and `@odata.nextLink` pagination.
- HTTP: headers, JSON parsing, schema decode success/failure, retryable vs non-retryable statuses.
- Resources: list/get paths and schemas for Property, Member, Office, Destination, OpenHouse, and Lead.
- Replication: all-destination and destination-specific paths for Property, Member, and Office.
- Sync: identifier filtering, hydration, concurrency, sink calls, normalization, summary results, and next watermark behavior.

The `test` script should eventually run both typechecking and the Effect test suite. Until then, `pnpm run typecheck` is not enough to consider a method implemented.
