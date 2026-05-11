import { assert, describe, it } from "@effect/vitest";
import { makeDdfOtlpTelemetryLayer } from "./telemetry";

describe("telemetry", () => {
  it("constructs the optional OTLP telemetry layer without requiring callers to use it", () => {
    const layer = makeDdfOtlpTelemetryLayer({
      baseUrl: "http://otel-collector.test/v1",
      serviceName: "crea-ddf-test",
    });
    assert.equal(typeof layer, "object");
  });
});
