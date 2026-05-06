import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Config, Effect, Redacted } from "effect";
import { makeDdfLayer } from "./client";
import { listDestinations, listProperties } from "./resources";

const liveEnvNames = [
  "CREA_DDF_CLIENT_ID",
  "CREA_DDF_CLIENT_SECRET",
  "CREA_DDF_BASE_URL",
  "CREA_DDF_AUTH_URL",
  "CREA_DDF_PROPERTY_REPLICATION_URL",
  "CREA_ANALYTICS_URL",
  "CREA_DESTINATION_ID",
] as const;

const requiredLiveEnvNames = [
  "CREA_DDF_CLIENT_ID",
  "CREA_DDF_CLIENT_SECRET",
] as const;

const visibleLiveEnvNames = liveEnvNames.filter(
  (name) => process.env[name] !== undefined && process.env[name] !== "",
);
const missingRequiredLiveEnvNames = requiredLiveEnvNames.filter(
  (name) => process.env[name] === undefined || process.env[name] === "",
);
const hasLiveCredentials = missingRequiredLiveEnvNames.length === 0;

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
  const visible =
    visibleLiveEnvNames.length > 0 ? visibleLiveEnvNames.join(", ") : "none";
  process.stdout.write(
    `Skipping live CREA/DDF tests: missing required ${missingRequiredLiveEnvNames.join(", ")}. Visible CREA live env names: ${visible}. Optional URLs: CREA_DDF_BASE_URL and CREA_DDF_AUTH_URL.\n`,
  );
}
