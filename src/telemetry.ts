import { Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Otlp from "effect/unstable/observability/Otlp";

import {
  layer,
  layerJson,
  layerProtobuf
} from "effect/unstable/observability/Otlp";

export interface DdfOtlpTelemetryOptions {
  readonly baseUrl: string;
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  readonly attributes?: Record<string, unknown>;
}

export const makeDdfOtlpTelemetryLayer = (options: DdfOtlpTelemetryOptions) =>
  Otlp.layerJson({
    baseUrl: options.baseUrl,
    resource: {
      serviceName: options.serviceName ?? "crea-ddf-effect-sdk",
      serviceVersion: options.serviceVersion,
      attributes: options.attributes,
    },
  }).pipe(Layer.provide(FetchHttpClient.layer));
