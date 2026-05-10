import {
  Context,
  Duration,
  Effect,
  Layer,
  Metric,
  Schedule,
  Schema,
} from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { DdfConfig } from "@/client";
import type { DdfClientConfig } from "@/client";
import {
  ddfApiFailureCount,
  ddfApiRequestCount,
  ddfApiRetryCount,
  ddfRequestDuration,
} from "@/metrics";
import { ODataUnknownListEnvelopeSchema } from "@/schema/odata";
import type { ODataGetQuery, ODataListQuery, ReplicationQuery } from "@/types";
import {
  DdfTokenFetchError,
  DdfTokenHttpError,
  DdfTokenJsonParseError,
  DdfTokenResponseValidationError,
} from "../auth/errors";
import { DdfAuthService } from "../auth/Service";
import {
  DdfApiJsonParseError,
  DdfApiResponseSchemaDecodeError,
  DdfApiTransportFetchFailure,
  RetryableApiStatus,
  statusError,
} from "./errors";
import {
  DdfInvalidODataQueryError,
  encodeODataQuery,
  keyLiteral,
} from "./odata";
import { requestFromOptions, responseText } from "./request";
import type {
  DdfHttpApi,
  DdfRequestOptions,
  DdfResponseSchema,
} from "./types";

const DEFAULT_RETRY_POLICY = {
  maxRetries: 2,
  baseDelayMillis: 100,
  retryableStatuses: [408, 503] as const,
} as const;

const retryPolicyFor = (config: DdfClientConfig) => ({
  maxRetries: config.retryPolicy?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
  baseDelay:
    config.retryPolicy?.baseDelay ??
    Duration.millis(
      config.retryPolicy?.baseDelayMillis ??
        DEFAULT_RETRY_POLICY.baseDelayMillis,
    ),
  retryableStatuses:
    config.retryPolicy?.retryableStatuses ??
    DEFAULT_RETRY_POLICY.retryableStatuses,
});

const isRetryableStatus = (
  status: number,
  retryableStatuses: ReadonlyArray<number>,
) => retryableStatuses.includes(status);

const apiTransportError = (url: string, cause: unknown) =>
  new DdfApiTransportFetchFailure({ url, cause });

const decodeJson = <T>(
  json: unknown,
  url: string,
  schema?: DdfResponseSchema<T>,
): Effect.Effect<T, DdfApiResponseSchemaDecodeError> => {
  if (schema === undefined) return Effect.succeed(json as T);

  return Schema.decodeUnknownEffect(schema)(json).pipe(
    Effect.mapError(
      (cause) => new DdfApiResponseSchemaDecodeError({ url, cause }),
    ),
  );
};

const authErrorFor = (cfg: DdfClientConfig, cause: unknown) => {
  if (
    cause instanceof DdfTokenFetchError ||
    cause instanceof DdfTokenHttpError ||
    cause instanceof DdfTokenJsonParseError ||
    cause instanceof DdfTokenResponseValidationError
  ) {
    return cause;
  }

  return new DdfTokenJsonParseError({
    url: cfg.identityUrl ?? "https://identity.crea.ca/connect/token",
    cause,
  });
};

export class DdfHttpService extends Context.Service<DdfHttpService>()(
  "crea-ddf-effect-sdk/client/http/Service/DdfHttpService",
  {
    make: Effect.gen(function* () {
      const cfg = yield* DdfConfig;
      const auth = yield* DdfAuthService;
      const client = yield* HttpClient.HttpClient;
      const retryPolicy = retryPolicyFor(cfg);
      const retryableStatuses = retryPolicy.retryableStatuses;
      const retrySchedule = Schedule.exponential(retryPolicy.baseDelay).pipe(
        Schedule.both(Schedule.recurs(retryPolicy.maxRetries)),
      );

      const executeOnce = Effect.fn("DdfHttp.executeOnce")(function* (
        url: string,
        init: DdfRequestOptions | undefined,
        forceRefresh: boolean,
      ) {
        const token = yield* auth.getAccessToken({ forceRefresh }).pipe(
          Effect.provideService(DdfConfig, cfg),
          Effect.provideService(HttpClient.HttpClient, client),
          Effect.mapError((cause) => authErrorFor(cfg, cause)),
        );
        const request = requestFromOptions(url, init).pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.acceptJson,
        );
        yield* Effect.logDebug("CREA DDF API request", { url });
        cfg.logger?.debug?.({ type: "api_request", url });
        yield* Metric.update(ddfApiRequestCount, 1);
        const res = yield* client.execute(request).pipe(
          Effect.mapError((cause) => apiTransportError(url, cause)),
        );
        if (isRetryableStatus(res.status, retryableStatuses)) {
          yield* Effect.logWarning("CREA DDF API retryable status", {
            url,
            status: res.status,
          });
          cfg.logger?.warn?.({
            type: "api_retry",
            url,
            status: res.status,
            attempt: 1,
            delayMillis: Duration.toMillis(
              Duration.fromInputUnsafe(retryPolicy.baseDelay),
            ),
          });
          yield* Metric.update(ddfApiRetryCount, 1);
          return yield* new RetryableApiStatus({ response: res });
        }
        return res;
      });

      const requestJson = Effect.fn("DdfHttp.requestJson")(
        function* <T = unknown>(
          path: string,
          init?: DdfRequestOptions,
          schema?: DdfResponseSchema<T>,
        ) {
          const url = path.startsWith("http")
            ? path
            : `${cfg.baseUrl ?? "https://ddfapi.realtor.ca"}${path}`;

          const sendWithRetry = (forceRefresh: boolean) =>
            executeOnce(url, init, forceRefresh).pipe(
              Effect.retry({
                schedule: retrySchedule,
                while: (error) => error instanceof RetryableApiStatus,
              }),
              Effect.catchTag("RetryableApiStatus", (error) =>
                Effect.succeed(error.response),
              ),
            );

          const res = yield* sendWithRetry(false).pipe(
            Effect.trackDuration(ddfRequestDuration),
          );
          let finalRes = res;
          if (res.status === 401) {
            yield* Effect.logWarning(
              "CREA DDF API unauthorized; refreshing token",
              { url, status: res.status },
            );
            cfg.logger?.warn?.({
              type: "api_unauthorized_refresh",
              url,
              status: res.status,
            });
            finalRes = yield* sendWithRetry(true);
          }

          if (finalRes.status < 200 || finalRes.status >= 300) {
            yield* Metric.update(ddfApiFailureCount, 1);
            const bodyText = yield* responseText(finalRes);
            return yield* statusError({
              url,
              status: finalRes.status,
              statusText: "",
              bodyText,
            });
          }

          const json: unknown = yield* finalRes.json.pipe(
            Effect.mapError(
              (cause) => new DdfApiJsonParseError({ url, cause }),
            ),
          );
          return yield* decodeJson(json, url, schema).pipe(
            Effect.tapError((cause) =>
              Effect.logWarning("CREA DDF schema decode failed", {
                url,
                cause,
              }),
            ),
          );
        },
      );

      return {
        requestJson,
        listOData: Effect.fn("DdfHttp.listOData")(function* <T = unknown>(
          path: string,
          query?: ODataListQuery,
          schema?: DdfResponseSchema<T>,
        ) {
          const encoded = yield* Effect.try({
            try: () => encodeODataQuery(query),
            catch: (cause) =>
              cause instanceof DdfInvalidODataQueryError
                ? cause
                : new DdfInvalidODataQueryError({
                    option: "query",
                    messageText: String(cause),
                  }),
          });
          return yield* requestJson(`${path}${encoded}`, undefined, schema);
        }),
        getOData: Effect.fn("DdfHttp.getOData")(function* <T = unknown>(
          path: string,
          key: string | number,
          query?: ODataGetQuery,
          schema?: DdfResponseSchema<T>,
        ) {
          const encoded = yield* Effect.try({
            try: () => encodeODataQuery(query),
            catch: (cause) =>
              cause instanceof DdfInvalidODataQueryError
                ? cause
                : new DdfInvalidODataQueryError({
                    option: "query",
                    messageText: String(cause),
                  }),
          });
          return yield* requestJson(
            `${path}(${keyLiteral(key)})${encoded}`,
            undefined,
            schema,
          );
        }),
        replicateIdentifiers: Effect.fn("DdfHttp.replicateIdentifiers")(
          function* <T = unknown>(
            path: string,
            query?: ReplicationQuery,
            schema?: DdfResponseSchema<T>,
          ) {
            const encoded = yield* Effect.try({
              try: () => encodeODataQuery(query),
              catch: (cause) =>
                cause instanceof DdfInvalidODataQueryError
                  ? cause
                  : new DdfInvalidODataQueryError({
                      option: "query",
                      messageText: String(cause),
                    }),
            });
            return yield* requestJson(`${path}${encoded}`, undefined, schema);
          },
        ),
        paginateOData: Effect.fn("DdfOData.paginate")(function* (
          first: string,
        ) {
          const out: Array<unknown> = [];
          let next: string | undefined = first;
          while (next !== undefined) {
            const page = (yield* requestJson(
              next,
              undefined,
              ODataUnknownListEnvelopeSchema,
            )) as {
              readonly value?: ReadonlyArray<unknown>;
              readonly "@odata.nextLink"?: string | null;
            };
            out.push(...(page.value ?? []));
            next = page["@odata.nextLink"] ?? undefined;
          }
          return out;
        }),
      } satisfies DdfHttpApi;
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
