import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { makeDdfLayer } from "./client";
import { listDestinations, listProperties } from "./resources";

const clientId = process.env.DDF_CLIENT_ID;
const clientSecret = process.env.DDF_CLIENT_SECRET;

const maybeLive = clientId && clientSecret ? describe : describe.skip;

maybeLive("live CREA/DDF integration", () => {
  const layer = makeDdfLayer({
    clientId: clientId ?? "",
    clientSecret: clientSecret ?? "",
    baseUrl: process.env.DDF_BASE_URL,
    identityUrl: process.env.DDF_IDENTITY_URL,
    fetch,
  });

  it("fetches a token, destinations, and one property without running by default", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const destinations = yield* listDestinations({ top: 1 });
        const properties = yield* listProperties({ top: 1 });
        return { destinations, properties };
      }).pipe(Effect.provide(layer)),
    );

    assert.equal(Array.isArray(result.destinations.value), true);
    assert.equal(Array.isArray(result.properties.value), true);
  });
});

if (!clientId || !clientSecret) {
  process.stdout.write(
    "Skipping live CREA/DDF tests: set DDF_CLIENT_ID and DDF_CLIENT_SECRET to enable.\n",
  );
}
