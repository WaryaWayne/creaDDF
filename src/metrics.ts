import { Metric } from "effect";

export const ddfTokenRequestCount = Metric.counter(
  "crea_ddf_token_requests_total",
  {
    description: "CREA DDF OAuth token requests",
    incremental: true,
  },
);
export const ddfTokenRefreshCount = Metric.counter(
  "crea_ddf_token_refreshes_total",
  {
    description: "CREA DDF forced token refreshes",
    incremental: true,
  },
);
export const ddfApiRequestCount = Metric.counter(
  "crea_ddf_api_requests_total",
  {
    description: "CREA DDF API requests",
    incremental: true,
  },
);
export const ddfApiRetryCount = Metric.counter("crea_ddf_api_retries_total", {
  description: "CREA DDF API retry attempts",
  incremental: true,
});
export const ddfApiFailureCount = Metric.counter(
  "crea_ddf_api_failures_total",
  {
    description: "CREA DDF API request failures",
    incremental: true,
  },
);
export const ddfRequestDuration = Metric.timer("crea_ddf_request_duration");
export const ddfSyncHydratedCount = Metric.counter(
  "crea_ddf_sync_hydrated_total",
  {
    description: "CREA DDF sync records hydrated",
    incremental: true,
  },
);
export const ddfSyncPersistedCount = Metric.counter(
  "crea_ddf_sync_persisted_total",
  {
    description: "CREA DDF sync records persisted",
    incremental: true,
  },
);
export const ddfSyncFailedCount = Metric.counter("crea_ddf_sync_failed_total", {
  description: "CREA DDF sync record failures",
  incremental: true,
});
export const ddfWatermarkLoadCount = Metric.counter(
  "crea_ddf_watermark_loads_total",
  {
    description: "CREA DDF watermark load attempts",
    incremental: true,
  },
);
export const ddfWatermarkSaveCount = Metric.counter(
  "crea_ddf_watermark_saves_total",
  {
    description: "CREA DDF watermark save attempts",
    incremental: true,
  },
);
export const ddfAuthCacheHitCount = Metric.counter(
  "crea_ddf_auth_cache_hits_total",
  {
    description: "CREA DDF auth cache hits",
    incremental: true,
  },
);
export const ddfAuthCacheMissCount = Metric.counter(
  "crea_ddf_auth_cache_misses_total",
  {
    description: "CREA DDF auth cache misses",
    incremental: true,
  },
);
