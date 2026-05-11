import { Effect, Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { DdfAuth } from "./client/auth/Service";
import { DdfConfig, ddfConfigFromEnv } from "./client/config/Service";
import type { DdfClientConfig } from "./client/config/Service";
import { DdfHttp } from "./client/http/Service";

export * from "./client/auth/errors";
export * from "./client/auth/Service";
export * from "./client/auth/types";
export * from "./client/config/Service";
export * from "./client/http/errors";
export * from "./client/http/odata";
export * from "./client/http/Service";
export * from "./client/http/types";

const fetchLayerFor = (config: DdfClientConfig) => {
  const fetchOverride = config.fetch;
  if (fetchOverride === undefined) return Layer.empty;

  return Layer.succeed(FetchHttpClient.Fetch, (async (input, init) => {
    if (input instanceof Request) {
      const headers = new Headers(input.headers);
      let body: BodyInit | null | undefined = undefined;
      if (input.method !== "GET" && input.method !== "HEAD") {
        const text = await input.clone().text();
        const contentType = headers.get("content-type") ?? "";
        body = contentType.includes("application/x-www-form-urlencoded")
          ? new URLSearchParams(text)
          : text;
      }
      return fetchOverride(input.url, {
        method: input.method,
        headers,
        body,
      });
    }

    const headers = new Headers(init?.headers);
    let body = init?.body;
    if (body instanceof Uint8Array) {
      const text = new TextDecoder().decode(body);
      const contentType = headers.get("content-type") ?? "";
      body =
        contentType.includes("application/x-www-form-urlencoded") ||
        text.includes("grant_type=client_credentials")
          ? new URLSearchParams(text)
          : text;
    }
    return fetchOverride(input, { ...init, headers, body });
  }) as typeof fetch);
};

export const makeDdfLayer = (config: DdfClientConfig) => {
  const configLayer = DdfConfig.layer(config);
  const fetchLayer = fetchLayerFor(config);
  const nativeHttpLayer = FetchHttpClient.layer.pipe(Layer.provide(fetchLayer));
  const baseLayer = Layer.mergeAll(configLayer, nativeHttpLayer);
  const authLayer = DdfAuth.layer.pipe(Layer.provide(baseLayer));
  const httpLayer = DdfHttp.layer.pipe(
    Layer.provide(Layer.mergeAll(baseLayer, authLayer)),
  );

  return Layer.mergeAll(configLayer, nativeHttpLayer, authLayer, httpLayer);
};

export const makeDdfLayerFromEnv = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ddfConfigFromEnv;
    return makeDdfLayer(config);
  }),
);
