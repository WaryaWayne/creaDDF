import { assert, describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Exit } from "effect";
import {
  DdfHttp,
  type DdfLogEvent,
  DdfInvalidODataQueryError,
  encodeODataQuery,
  filters,
  makeDdfLayer,
} from "./client";
import type { DdfHttpApi } from "./client";

const configFor = (fetchMock: typeof fetch) => ({
  clientId: "client-id",
  clientSecret: "client-secret",
  identityUrl: "https://identity.test/connect/token",
  baseUrl: "https://ddf.test",
  fetch: fetchMock,
});

const withClient = <A>(
  fetchMock: typeof fetch,
  use: (http: DdfHttpApi) => Effect.Effect<A, Error>,
) =>
  Effect.gen(function* () {
    const http = yield* DdfHttp;
    return yield* use(http);
  }).pipe(Effect.provide(makeDdfLayer(configFor(fetchMock))));

const tokenResponse = (token: string) =>
  Response.json({ access_token: token, expires_in: 3600 });

describe("client", () => {
  it("encodes OData query parameters with reserved characters", () => {
    const query = encodeODataQuery({
      select: ["ListingKey", "ModificationTimestamp"],
      count: true,
      filter: "PropertySubType eq 'Office' and Price gt 500000",
      top: 10,
      skip: 5,
      orderby: ["ModificationTimestamp desc", "ListingKey"],
    });

    assert.equal(
      query,
      "?%24select=ListingKey%2CModificationTimestamp&%24count=true&%24filter=PropertySubType+eq+%27Office%27+and+Price+gt+500000&%24top=10&%24skip=5&%24orderby=ModificationTimestamp+desc%2CListingKey",
    );
  });

  it("builds escaped OData filters and rejects invalid $top values", () => {
    assert.equal(filters.eq("City", "O'Brien"), "City eq 'O''Brien'");
    assert.equal(filters.eq("FullNSP", true), "FullNSP eq true");
    assert.equal(
      filters.modifiedAfter(
        "ModificationTimestamp",
        DateTime.toDateUtc(DateTime.makeUnsafe("2024-01-01T00:00:00.000Z")),
      ),
      "ModificationTimestamp gt 2024-01-01T00:00:00.000Z",
    );
    assert.equal(
      filters.and(
        filters.eq("PropertySubType", "Office"),
        filters.modifiedAfter(
          "ModificationTimestamp",
          "2024-01-01T00:00:00.000Z",
        ),
      ),
      "(PropertySubType eq 'Office') and (ModificationTimestamp gt 2024-01-01T00:00:00.000Z)",
    );
    assert.throws(
      () => encodeODataQuery({ top: 101 }),
      DdfInvalidODataQueryError,
    );
  });

  it("builds ergonomic OData filters for documented operators and functions", () => {
    const date = DateTime.toDateUtc(
      DateTime.makeUnsafe("2024-02-03T04:05:06.000Z"),
    );

    assert.equal(filters.eq("City", "O'Brien"), "City eq 'O''Brien'");
    assert.equal(filters.ne("City", "Toronto"), "City ne 'Toronto'");
    assert.equal(filters.gt("ListPrice", 500000), "ListPrice gt 500000");
    assert.equal(filters.lt("ListPrice", 900000), "ListPrice lt 900000");
    assert.equal(
      filters.ge("BathroomsTotalInteger", 2),
      "BathroomsTotalInteger ge 2",
    );
    assert.equal(filters.le("BedroomsTotal", 4), "BedroomsTotal le 4");
    assert.equal(filters.eq("FullNSP", false), "FullNSP eq false");
    assert.equal(filters.eq("PostalCode", null), "PostalCode eq null");
    assert.equal(
      filters.in("PropertySubType", ["Office", "Retail", "O'Brien"]),
      "PropertySubType in ('Office','Retail','O''Brien')",
    );
    assert.equal(
      filters.gt("ModificationTimestamp", date),
      "ModificationTimestamp gt 2024-02-03T04:05:06.000Z",
    );
    assert.equal(
      filters.has("Permissions", "Namespace.Permission'Full'"),
      "Permissions has Namespace.Permission'Full'",
    );
    assert.equal(
      filters.any("Heating", "a", (a) => filters.eq(a, "Electric")),
      "Heating/any(a: a eq 'Electric')",
    );
    assert.equal(
      filters.not(filters.eq("CommonInterest", "Condo/Strata")),
      "not (CommonInterest eq 'Condo/Strata')",
    );
    assert.equal(
      filters.or(
        filters.and(
          filters.ge("ListPrice", 100000),
          filters.le("ListPrice", 200000),
        ),
        filters.eq("ListPrice", null),
      ),
      "((ListPrice ge 100000) and (ListPrice le 200000)) or (ListPrice eq null)",
    );
  });

  it("sends the expected token body and decodes JSON responses", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });

      if (url === "https://identity.test/connect/token") {
        assert.equal(init?.method, "POST");
        assert.equal(init?.body instanceof URLSearchParams, true);
        assert.equal(
          (init?.body as URLSearchParams).get("grant_type"),
          "client_credentials",
        );
        assert.equal(
          (init?.body as URLSearchParams).get("client_id"),
          "client-id",
        );
        assert.equal(
          (init?.body as URLSearchParams).get("client_secret"),
          "client-secret",
        );
        assert.equal(
          (init?.body as URLSearchParams).get("scope"),
          "DDFApi_Read",
        );
        return tokenResponse("token-123");
      }

      assert.equal(
        url,
        "https://ddf.test/odata/v1/Property?%24select=ListingKey&%24top=1",
      );
      return Response.json({ value: [{ ListingKey: "listing-1" }] });
    }) as typeof fetch;

    const result = await Effect.runPromise(
      withClient(fetchMock, (http) =>
        http.listOData("/odata/v1/Property", {
          select: ["ListingKey"],
          top: 1,
        }),
      ),
    );

    assert.deepEqual(result, { value: [{ ListingKey: "listing-1" }] });
    assert.equal(calls.length, 2);
  });

  it("caches a valid token across API requests", async () => {
    let tokenCalls = 0;
    let apiCalls = 0;
    const fetchMock = (async (input: RequestInfo | URL) => {
      if (String(input) === "https://identity.test/connect/token") {
        tokenCalls += 1;
        return tokenResponse("cached-token");
      }

      apiCalls += 1;
      return Response.json({ ok: true });
    }) as typeof fetch;

    await Effect.runPromise(
      withClient(fetchMock, (http) =>
        Effect.gen(function* () {
          yield* http.requestJson("/odata/v1/Property");
          yield* http.requestJson("/odata/v1/Member");
        }),
      ),
    );

    assert.equal(tokenCalls, 1);
    assert.equal(apiCalls, 2);
  });

  it("fails token requests before caching non-ok or malformed responses", async () => {
    const tokenStatuses: Array<number> = [];
    let apiCalls = 0;
    const fetchMock = (async (input: RequestInfo | URL) => {
      if (String(input) === "https://identity.test/connect/token") {
        if (tokenStatuses.length === 0) {
          tokenStatuses.push(500);
          return new Response(
            JSON.stringify({ error: "temporarily unavailable" }),
            { status: 500 },
          );
        }

        tokenStatuses.push(200);
        return tokenResponse("fresh-token");
      }

      apiCalls += 1;
      return Response.json({ ok: true });
    }) as typeof fetch;

    const result = await Effect.runPromise(
      withClient(fetchMock, (http) =>
        Effect.gen(function* () {
          const first = yield* Effect.exit(
            http.requestJson("/odata/v1/Property"),
          );
          const second = yield* http.requestJson("/odata/v1/Property");
          return { first, second };
        }),
      ),
    );

    assert.equal(Exit.isFailure(result.first), true);
    assert.deepEqual(tokenStatuses, [500, 200]);
    assert.equal(apiCalls, 1);

    const malformedFetch = (async () =>
      Response.json({ access_token: "", expires_in: 3600 })) as typeof fetch;
    await expect(
      Effect.runPromise(
        withClient(malformedFetch, (http) =>
          http.requestJson("/odata/v1/Property"),
        ),
      ),
    ).rejects.toThrow(/Token response is missing required fields/);
  });

  it("adds JSON accept and authorization headers to API requests", async () => {
    let apiHeaders: Headers | undefined;
    const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "https://identity.test/connect/token")
        return tokenResponse("token-123");

      apiHeaders = init?.headers as Headers;
      return Response.json({ ok: true });
    }) as typeof fetch;

    await Effect.runPromise(
      withClient(fetchMock, (http) =>
        http.requestJson("/v1/Lead/CreateLead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ListingKey: "listing-1" }),
        }),
      ),
    );

    assert.equal(apiHeaders?.get("Accept"), "application/json");
    assert.equal(apiHeaders?.get("Authorization"), "Bearer token-123");
    assert.equal(apiHeaders?.get("Content-Type"), "application/json");
  });

  it("refreshes auth once after a 401 response", async () => {
    let tokenCalls = 0;
    const apiAuthorizations: Array<string | null> = [];
    const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "https://identity.test/connect/token") {
        tokenCalls += 1;
        return tokenResponse(`token-${tokenCalls}`);
      }

      apiAuthorizations.push((init?.headers as Headers).get("Authorization"));
      if (apiAuthorizations.length === 1) {
        return new Response(JSON.stringify({ error: "expired" }), {
          status: 401,
        });
      }

      return Response.json({ value: [] });
    }) as typeof fetch;

    await Effect.runPromise(
      withClient(fetchMock, (http) => http.requestJson("/odata/v1/Property")),
    );

    assert.equal(tokenCalls, 2);
    assert.deepEqual(apiAuthorizations, ["Bearer token-1", "Bearer token-2"]);
  });

  it("maps common HTTP statuses to typed API errors with response bodies", async () => {
    const statuses = new Map([
      [400, "DdfApiBadRequestQueryError"],
      [401, "DdfApiUnauthorizedAfterRefreshError"],
      [403, "DdfApiForbiddenError"],
      [404, "DdfApiNotFoundError"],
      [408, "DdfApiTimeoutError"],
      [415, "DdfApiUnsupportedMediaTypeError"],
      [500, "DdfApiInternalServerError"],
      [503, "DdfApiRetryableServiceUnavailableError"],
    ]);

    for (const [status, tag] of statuses) {
      const fetchMock = (async (input: RequestInfo | URL) => {
        if (String(input) === "https://identity.test/connect/token")
          return tokenResponse("token-123");
        return new Response("body text", { status, statusText: "Nope" });
      }) as typeof fetch;

      const exit = await Effect.runPromiseExit(
        withClient(fetchMock, (http) => http.requestJson("/odata/v1/Property")),
      );
      assert.equal(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const cause = String(exit.cause);
        assert.match(cause, new RegExp(tag));
        assert.match(cause, /body text|Nope|DDF API/);
      }
    }
  });

  it("honors custom retry policy and emits retry logger calls without waiting", async () => {
    const events: Array<DdfLogEvent> = [];
    let apiCalls = 0;
    const fetchMock = (async (input: RequestInfo | URL) => {
      if (String(input) === "https://identity.test/connect/token")
        return tokenResponse("token-123");

      apiCalls += 1;
      if (apiCalls === 1) return new Response(null, { status: 500 });
      return Response.json({ ok: true });
    }) as typeof fetch;

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const http = yield* DdfHttp;
        return yield* http.requestJson("/odata/v1/Property");
      }).pipe(
        Effect.provide(
          makeDdfLayer({
            ...configFor(fetchMock),
            retryPolicy: {
              maxRetries: 1,
              baseDelayMillis: 0,
              retryableStatuses: [500],
            },
            logger: {
              debug: (event) => events.push(event),
              warn: (event) => events.push(event),
            },
          }),
        ),
      ),
    );

    assert.deepEqual(result, { ok: true });
    assert.equal(apiCalls, 2);
    assert.deepEqual(
      events.filter((event) => event.type === "api_retry"),
      [
        {
          type: "api_retry",
          url: "https://ddf.test/odata/v1/Property",
          status: 500,
          attempt: 1,
          delayMillis: 0,
        },
      ],
    );
  });

  it("does not retry statuses omitted from a custom retry policy", async () => {
    let apiCalls = 0;
    const fetchMock = (async (input: RequestInfo | URL) => {
      if (String(input) === "https://identity.test/connect/token")
        return tokenResponse("token-123");

      apiCalls += 1;
      return new Response("no retry", { status: 503 });
    }) as typeof fetch;

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const http = yield* DdfHttp;
        return yield* http.requestJson("/odata/v1/Property");
      }).pipe(
        Effect.provide(
          makeDdfLayer({
            ...configFor(fetchMock),
            retryPolicy: {
              maxRetries: 3,
              baseDelayMillis: 0,
              retryableStatuses: [408],
            },
          }),
        ),
      ),
    );

    assert.equal(Exit.isFailure(exit), true);
    assert.equal(apiCalls, 1);
  });

  it("retries bounded 408 and 503 responses", async () => {
    for (const status of [408, 503]) {
      let tokenCalls = 0;
      let apiCalls = 0;
      const fetchMock = (async (input: RequestInfo | URL) => {
        if (String(input) === "https://identity.test/connect/token") {
          tokenCalls += 1;
          return tokenResponse("token-123");
        }

        apiCalls += 1;
        if (apiCalls < 3) return new Response(null, { status });
        return Response.json({ ok: true, status });
      }) as typeof fetch;

      const result = await Effect.runPromise(
        withClient(fetchMock, (http) => http.requestJson("/odata/v1/Property")),
      );

      assert.deepEqual(result, { ok: true, status });
      assert.equal(tokenCalls, 1);
      assert.equal(apiCalls, 3);
    }
  });
});
