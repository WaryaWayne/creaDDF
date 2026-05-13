import {
  Context,
  Duration,
  Effect,
  Layer,
  Metric,
  Schema,
} from "effect";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { DdfConfig } from "../config/Service";
import type { DdfClientConfig } from "../config/Service";
import {
  ddfApiFailureCount,
  ddfApiRequestCount,
  ddfApiRetryCount,
  ddfRequestDuration,
} from "../../metrics";
import { ODataUnknownListEnvelopeSchema } from "../../schema/odata";
import {
  DdfTokenTransportError,
  DdfTokenHttpError,
  DdfTokenJsonParseError,
  DdfTokenResponseValidationError,
} from "../auth/errors";
import { DdfAuth } from "../auth/Service";
import {
  DdfApiJsonParseError,
  DdfApiResponseSchemaDecodeError,
  DdfApiTransportError,
  schemaDecodeIssuesFromCause,
  statusError,
} from "./errors";
import {
  DdfInvalidODataQueryError,
  DdfUnsupportedODataParameterError,
  encodeODataQuery,
  keyLiteral,
} from "./odata";
import type {
  DdfHttpApi,
  DdfODataGetQuery,
  DdfODataListQuery,
  DdfReplicationQuery,
  DdfRequestOptions,
  DdfResponseSchema,
} from "./types";

const DEFAULT_RETRY_POLICY = {
  maxRetries: 2,
  baseDelay: Duration.millis(100),
  retryableStatuses: [408, 503] as const,
} as const;

const retryPolicyFor = (config: DdfClientConfig) => ({
  maxRetries: config.retryPolicy?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
  baseDelay:
    config.retryPolicy?.baseDelay ??
    Duration.millis(
      config.retryPolicy?.baseDelayMillis ??
        Duration.toMillis(DEFAULT_RETRY_POLICY.baseDelay),
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
  new DdfApiTransportError({ url, cause });

const responseText = (res: HttpClientResponse.HttpClientResponse) =>
  res.text.pipe(Effect.orElseSucceed(() => undefined as string | undefined));

const decodeJson = <T>(
  json: unknown,
  url: string,
  schema?: DdfResponseSchema<T>,
): Effect.Effect<T, DdfApiResponseSchemaDecodeError> => {
  if (schema === undefined) return Effect.succeed(json as T);

  return Schema.decodeUnknownEffect(schema)(json).pipe(
    Effect.mapError((cause) => {
      const issues = schemaDecodeIssuesFromCause(cause);
      return new DdfApiResponseSchemaDecodeError(
        issues === undefined ? { url, cause } : { url, cause, issues },
      );
    }),
  );
};

const authErrorFor = (cfg: DdfClientConfig, cause: unknown) => {
  if (
    cause instanceof DdfTokenTransportError ||
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

const retryDelay = (baseDelay: Duration.Input, attempt: number) =>
  Duration.millis(
    Duration.toMillis(Duration.fromInputUnsafe(baseDelay)) *
      2 ** Math.max(0, attempt - 1),
  );

const requestBody = (init?: DdfRequestOptions) => {
  if (init?.json !== undefined) return HttpBody.jsonUnsafe(init.json);
  if (init?.body === undefined || init.body === null) return undefined;
  if (typeof init.body === "string") {
    return HttpBody.text(
      init.body,
      init.headers?.["content-type"] ??
        init.headers?.["Content-Type"] ??
        "application/json",
    );
  }
  if (init.body instanceof URLSearchParams) {
    return HttpBody.text(
      init.body.toString(),
      "application/x-www-form-urlencoded",
    );
  }
  if (init.body instanceof Uint8Array) return HttpBody.uint8Array(init.body);
  return undefined;
};

const requestOptions = (
  init?: DdfRequestOptions,
): HttpClientRequest.Options.NoUrl => ({
  acceptJson: true,
  headers: init?.headers,
  body: requestBody(init),
});

const executeMethod = (
  client: HttpClient.HttpClient,
  url: string,
  init?: DdfRequestOptions,
) => {
  const options = requestOptions(init);

  switch (init?.method ?? "GET") {
    case "GET":
      return client.get(url, options);
    case "POST":
      return client.post(url, options);
    case "PUT":
      return client.put(url, options);
    case "PATCH":
      return client.patch(url, options);
    case "DELETE":
      return client.del(url, options);
  }
};

const encodeQueryError = (cause: unknown) =>
  cause instanceof DdfInvalidODataQueryError ||
  cause instanceof DdfUnsupportedODataParameterError
    ? cause
    : new DdfInvalidODataQueryError({
        option: "query",
        messageText: String(cause),
      });

const encodeQuery = (
  query?: DdfODataListQuery | DdfODataGetQuery | DdfReplicationQuery,
) =>
  Effect.try({
    try: () => encodeODataQuery(query),
    catch: encodeQueryError,
  });

export class DdfHttp extends Context.Service<DdfHttp, DdfHttpApi>()(
  "crea-ddf-effect-sdk/client/http/Service/DdfHttp",
  {
    make: Effect.gen(function* () {
      const cfg = yield* DdfConfig;
      const auth = yield* DdfAuth;
      const client = yield* HttpClient.HttpClient;
      const retryPolicy = retryPolicyFor(cfg);
      const retryableStatuses = retryPolicy.retryableStatuses;

      const executeOnce = Effect.fn("DdfHttp.executeOnce")(function* (
        url: string,
        init: DdfRequestOptions | undefined,
        forceRefresh: boolean,
      ) {
        const token = yield* auth
          .getAccessToken({ forceRefresh })
          .pipe(Effect.mapError((cause) => authErrorFor(cfg, cause)));
        const authorizedClient = client.pipe(
          HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
        );
        yield* Effect.logDebug("CREA DDF API request", { url });
        cfg.logger?.debug?.({ type: "api_request", url });
        yield* Metric.update(ddfApiRequestCount, 1);
        return yield* executeMethod(authorizedClient, url, init).pipe(
          Effect.mapError((cause) => apiTransportError(url, cause)),
        );
      });

      const executeWithRetry = Effect.fn("DdfHttp.executeWithRetry")(function* (
        url: string,
        init: DdfRequestOptions | undefined,
        forceRefresh: boolean,
      ) {
        let attempt = 0;

        while (true) {
          const res = yield* executeOnce(url, init, forceRefresh);
          if (!isRetryableStatus(res.status, retryableStatuses)) return res;
          if (attempt >= retryPolicy.maxRetries) return res;

          attempt += 1;
          const delay = retryDelay(retryPolicy.baseDelay, attempt);
          yield* Effect.logWarning("CREA DDF API retryable status", {
            url,
            status: res.status,
            attempt,
          });
          cfg.logger?.warn?.({
            type: "api_retry",
            url,
            status: res.status,
            attempt,
            delayMillis: Duration.toMillis(delay),
          });
          yield* Metric.update(ddfApiRetryCount, 1);
          yield* Effect.sleep(delay);
        }
      });

      const requestJson = Effect.fn("DdfHttp.requestJson")(function* <
        T = unknown,
      >(path: string, init?: DdfRequestOptions, schema?: DdfResponseSchema<T>) {
        const url = path.startsWith("http")
          ? path
          : `${cfg.baseUrl ?? "https://ddfapi.realtor.ca"}${path}`;

        const res = yield* executeWithRetry(url, init, false).pipe(
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
          finalRes = yield* executeWithRetry(url, init, true);
        }

        if (finalRes.status < 200 || finalRes.status >= 300) {
          yield* Metric.update(ddfApiFailureCount, 1);
          const bodyText = yield* responseText(finalRes);
          return yield* statusError({
            url,
            status: finalRes.status,
            bodyText,
          });
        }

        const json: unknown = yield* finalRes.json.pipe(
          Effect.mapError((cause) => new DdfApiJsonParseError({ url, cause })),
        );
        return yield* decodeJson(json, url, schema).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning("CREA DDF schema decode failed", {
              url,
              issues: cause.issues,
              cause,
            }),
          ),
        );
      });

      return {
        requestJson,
        listOData: Effect.fn("DdfHttp.listOData")(function* <T = unknown>(
          path: string,
          query?: DdfODataListQuery,
          schema?: DdfResponseSchema<T>,
        ) {
          const encoded = yield* encodeQuery(query);
          return yield* requestJson(`${path}${encoded}`, undefined, schema);
        }),
        getOData: Effect.fn("DdfHttp.getOData")(function* <T = unknown>(
          path: string,
          key: string | number,
          query?: DdfODataGetQuery,
          schema?: DdfResponseSchema<T>,
        ) {
          const encoded = yield* encodeQuery(query);
          return yield* requestJson(
            `${path}(${keyLiteral(key)})${encoded}`,
            undefined,
            schema,
          );
        }),
        replicateIdentifiers: Effect.fn("DdfHttp.replicateIdentifiers")(
          function* <T = unknown>(
            path: string,
            query?: DdfReplicationQuery,
            schema?: DdfResponseSchema<T>,
          ) {
            const encoded = yield* encodeQuery(query);
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

export { DdfHttp as DdfHttpService };
