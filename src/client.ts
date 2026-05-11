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

export const makeDdfLayer = (config: DdfClientConfig) => {
  const configLayer = DdfConfig.layer(config);
  const nativeHttpLayer = FetchHttpClient.layer;
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
