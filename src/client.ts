import { Effect, Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { DdfAuth } from "./client/auth/Service.js";
import { DdfConfig, ddfConfigFromEnv } from "./client/config/Service.js";
import type { DdfClientConfig } from "./client/config/Service.js";
import { DdfHttp } from "./client/http/Service.js";

export * from "./client/auth/errors.js";
export * from "./client/auth/Service.js";
export * from "./client/auth/types.js";
export * from "./client/config/Service.js";
export * from "./client/http/errors.js";
export * from "./client/http/odata.js";
export * from "./client/http/Service.js";
export * from "./client/http/types.js";

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
