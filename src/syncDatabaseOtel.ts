import { BunFileSystem, BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer, Redacted } from "effect";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeDdfLayer } from "./client";
import { DdfDatabase } from "./db/layer";
import { syncDdfDatabaseOnce } from "./syncDatabase";
import { captureDdfFileTelemetry } from "./telemetry";

const SyncOtelConfig = Config.all({
  clientId: Config.redacted("CREA_DDF_CLIENT_ID"),
  clientSecret: Config.redacted("CREA_DDF_CLIENT_SECRET"),
  baseUrl: Config.string("CREA_DDF_BASE_URL").pipe(
    Config.withDefault("https://ddfapi.realtor.ca"),
  ),
  identityUrl: Config.string("CREA_DDF_AUTH_URL").pipe(
    Config.withDefault("https://identity.crea.ca/connect/token"),
  ),
  analyticsUrl: Config.string("CREA_ANALYTICS_URL").pipe(
    Config.withDefault(undefined),
  ),
  databaseUrl: Config.redacted("DATABASE_URL"),
});

const program = Effect.gen(function* () {
  const config = yield* SyncOtelConfig;
  const runId = `ddf-sync-${randomUUID()}`;
  const ddfLayer = makeDdfLayer({
    clientId: Redacted.value(config.clientId),
    clientSecret: config.clientSecret,
    baseUrl: config.baseUrl,
    identityUrl: config.identityUrl,
    analyticsUrl: config.analyticsUrl,
  });
  const appLayer = Layer.mergeAll(
    ddfLayer,
    DdfDatabase.layerFromUrl(config.databaseUrl),
    BunFileSystem.layer,
  );

  const result = yield* captureDdfFileTelemetry(syncDdfDatabaseOnce({ runId }), {
    directory: ".otel",
    includePrometheus: true,
    runId,
  }).pipe(Effect.provide(appLayer));

  yield* Effect.logInfo("DDF database sync telemetry written", {
    runId: result.runId,
    filePath: result.filePath,
    spanCount: result.spanCount,
    metricCount: result.metricCount,
  });

  return result.value;
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  BunRuntime.runMain(program);
}
