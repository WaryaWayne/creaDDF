import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Config, Effect, Redacted } from "effect";
import { makeDdfLayer } from "./client";
import { listDestinations, listProperties } from "./resources";

const hasLiveCredentials = Boolean(
  process.env.CREA_DDF_CLIENT_ID && process.env.CREA_DDF_CLIENT_SECRET,
);

const LiveDdfConfig = Config.all({
  clientId: Config.redacted("CREA_DDF_CLIENT_ID"),
  clientSecret: Config.redacted("CREA_DDF_CLIENT_SECRET"),
  baseUrl: Config.string("CREA_DDF_BASE_URL").pipe(
    Config.withDefault(undefined),
  ),
  identityUrl: Config.string("CREA_DDF_AUTH_URL").pipe(
    Config.withDefault(undefined),
  ),
});

const maybeLive = hasLiveCredentials ? describe : describe.skip;

maybeLive("live CREA/DDF integration", () => {
  it("fetches a token, destinations, and one property without running by default", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const config = yield* LiveDdfConfig;
        const layer = makeDdfLayer({
          clientId: Redacted.value(config.clientId),
          clientSecret: Redacted.value(config.clientSecret),
          baseUrl: config.baseUrl,
          identityUrl: config.identityUrl,
          fetch,
        });

        return yield* Effect.gen(function* () {
          const destinations = yield* listDestinations({ top: 1 });
          const properties = yield* listProperties({ top: 1 });
          return { destinations, properties };
        }).pipe(Effect.provide(layer));
      }),
    );

    assert.equal(Array.isArray(result.destinations.value), true);
    assert.equal(Array.isArray(result.properties.value), true);
  });
});

if (!hasLiveCredentials) {
  process.stdout.write(
    "Skipping live CREA/DDF tests: set CREA_DDF_CLIENT_ID and CREA_DDF_CLIENT_SECRET to enable. Optional URLs: CREA_DDF_BASE_URL and CREA_DDF_AUTH_URL.\n",
  );
}
