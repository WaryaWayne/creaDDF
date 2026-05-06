import { Cache, Clock, Config, Context, Data, Duration, Effect, Layer, Metric, Redacted, Schedule, Schema } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type { ODataGetQuery, ODataListQuery, ReplicationQuery } from "./types";
import { ODataUnknownListEnvelopeSchema } from "./schema/odata";
import {
  ddfApiFailureCount,
  ddfApiRequestCount,
  ddfApiRetryCount,
  ddfAuthCacheHitCount,
  ddfAuthCacheMissCount,
  ddfRequestDuration,
  ddfTokenRefreshCount,
  ddfTokenRequestCount,
} from "./metrics";

export interface DdfRetryPolicy {
  readonly maxRetries?: number;
  readonly baseDelay?: Duration.Input;
  /** @deprecated use baseDelay */
  readonly baseDelayMillis?: number;
  readonly retryableStatuses?: ReadonlyArray<number>;
}

export interface DdfLogger {
  readonly debug?: (event: DdfLogEvent) => void;
  readonly warn?: (event: DdfLogEvent) => void;
}

export type DdfLogEvent =
  | { readonly type: "token_request"; readonly url: string; readonly forceRefresh: boolean }
  | { readonly type: "api_request"; readonly url: string }
  | { readonly type: "api_retry"; readonly url: string; readonly status: number; readonly attempt: number; readonly delayMillis: number }
  | { readonly type: "api_unauthorized_refresh"; readonly url: string; readonly status: number };

export interface DdfClientConfig {
  clientId: string;
  clientSecret: string | Redacted.Redacted<string>;
  baseUrl?: string;
  identityUrl?: string;
  analyticsUrl?: string;
  retryPolicy?: DdfRetryPolicy;
  tokenExpiryBuffer?: Duration.Input;
  logger?: DdfLogger;
  /** Optional test/edge override for the Effect FetchHttpClient service. */
  fetch?: typeof fetch;
}

interface CachedToken {
  token: Redacted.Redacted<string>;
  ttlMillis: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface DdfAuthApi {
  getAccessToken: (options?: {
    readonly forceRefresh?: boolean;
  }) => Effect.Effect<Redacted.Redacted<string>, DdfAuthError>;
}

export type DdfResponseSchema<T> = Schema.Decoder<T, never>;

export interface DdfHttpApi {
  requestJson: <T = unknown>(
    path: string,
    init?: DdfRequestOptions,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  listOData: <T = unknown>(
    path: string,
    query?: ODataListQuery,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  getOData: <T = unknown>(
    path: string,
    key: string | number,
    query?: ODataGetQuery,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  replicateIdentifiers: <T = unknown>(
    path: string,
    query?: ReplicationQuery,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  paginateOData: (first: string) => Effect.Effect<Array<unknown>, DdfHttpError>;
}

export interface DdfRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: BodyInit | null;
}

export const DdfConfig = Context.Service<DdfClientConfig>("DdfConfig");

export const ddfConfigFromEnv = Config.all({
  clientId: Config.string("CREA_DDF_CLIENT_ID"),
  clientSecret: Config.redacted("CREA_DDF_CLIENT_SECRET"),
  baseUrl: Config.string("CREA_DDF_BASE_URL").pipe(Config.withDefault("https://ddfapi.realtor.ca")),
  identityUrl: Config.string("CREA_DDF_IDENTITY_URL").pipe(Config.withDefault("https://identity.crea.ca/connect/token")),
});
export const DdfAuth = Context.Service<DdfAuthApi>("DdfAuth");
export const DdfHttp = Context.Service<DdfHttpApi>("DdfHttp");

const ODATA_TOP_MAX = 100;

export class DdfInvalidODataQueryError extends Data.TaggedError(
  "DdfInvalidODataQueryError",
)<{
  readonly option: string;
  readonly messageText: string;
}> {
  override get message() {
    return this.messageText;
  }
}

const validateODataQuery = (
  query?: ODataListQuery | ODataGetQuery | ReplicationQuery,
) => {
  if (query && "top" in query && query.top !== undefined) {
    if (
      !Number.isInteger(query.top) ||
      query.top < 0 ||
      query.top > ODATA_TOP_MAX
    ) {
      throw new DdfInvalidODataQueryError({
        option: "$top",
        messageText: `DDF OData $top must be an integer between 0 and ${ODATA_TOP_MAX}`,
      });
    }
  }
};

const odataStringLiteral = (value: string) =>
  `'${value.replaceAll("'", "''")}'`;
const odataDateLiteral = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : value;
export type ODataPrimitive = string | number | boolean | Date | null;

const odataValueLiteral = (value: ODataPrimitive) => {
  if (value === null) return "null";
  if (typeof value === "string") return odataStringLiteral(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

export const filters = {
  eq: (field: string, value: ODataPrimitive) =>
    `${field} eq ${odataValueLiteral(value)}`,
  ne: (field: string, value: ODataPrimitive) =>
    `${field} ne ${odataValueLiteral(value)}`,
  gt: (field: string, value: Exclude<ODataPrimitive, null>) =>
    `${field} gt ${odataValueLiteral(value)}`,
  lt: (field: string, value: Exclude<ODataPrimitive, null>) =>
    `${field} lt ${odataValueLiteral(value)}`,
  ge: (field: string, value: Exclude<ODataPrimitive, null>) =>
    `${field} ge ${odataValueLiteral(value)}`,
  le: (field: string, value: Exclude<ODataPrimitive, null>) =>
    `${field} le ${odataValueLiteral(value)}`,
  in: (field: string, values: ReadonlyArray<ODataPrimitive>) =>
    `${field} in (${values.map(odataValueLiteral).join(",")})`,
  has: (field: string, value: string) =>
    `${field} has ${value}`,
  not: (clause: string) => `not (${clause})`,
  any: (
    collection: string,
    variable: string,
    clause: string | ((variable: string) => string),
  ) =>
    `${collection}/any(${variable}: ${typeof clause === "function" ? clause(variable) : clause})`,
  modifiedAfter: (field: string, dateOrString: Date | string) =>
    `${field} gt ${odataDateLiteral(dateOrString)}`,
  and: (...clauses: ReadonlyArray<string>) =>
    clauses
      .filter(Boolean)
      .map((clause) => `(${clause})`)
      .join(" and "),
  or: (...clauses: ReadonlyArray<string>) =>
    clauses
      .filter(Boolean)
      .map((clause) => `(${clause})`)
      .join(" or "),
} as const;

export const encodeODataQuery = (
  query?: ODataListQuery | ODataGetQuery | ReplicationQuery,
): string => {
  validateODataQuery(query);
  if (!query) return "";

  const p = new URLSearchParams();
  if ("select" in query && query.select?.length)
    p.set("$select", query.select.join(","));
  if ("count" in query && query.count !== undefined)
    p.set("$count", String(query.count));
  if ("filter" in query && query.filter) p.set("$filter", query.filter);
  if ("top" in query && query.top !== undefined)
    p.set("$top", String(query.top));
  if ("skip" in query && query.skip !== undefined)
    p.set("$skip", String(query.skip));
  if ("orderby" in query && query.orderby) {
    const orderby = query.orderby;
    p.set(
      "$orderby",
      typeof orderby === "string" ? orderby : orderby.join(","),
    );
  }

  const s = p.toString();
  return s ? `?${s}` : "";
};

const keyLiteral = (key: string | number) =>
  typeof key === "number" ? String(key) : `'${key.replaceAll("'", "''")}'`;
const DEFAULT_RETRY_POLICY = {
  maxRetries: 2,
  baseDelayMillis: 100,
  retryableStatuses: [408, 503] as const,
} as const;

const retryPolicyFor = (config: DdfClientConfig) => ({
  maxRetries: config.retryPolicy?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
  baseDelay: config.retryPolicy?.baseDelay ?? Duration.millis(config.retryPolicy?.baseDelayMillis ?? DEFAULT_RETRY_POLICY.baseDelayMillis),
  retryableStatuses:
    config.retryPolicy?.retryableStatuses ??
    DEFAULT_RETRY_POLICY.retryableStatuses,
});

const isRetryableStatus = (
  status: number,
  retryableStatuses: ReadonlyArray<number>,
) => retryableStatuses.includes(status);

const hasValidTokenFields = (value: unknown): value is TokenResponse => {
  if (!value || typeof value !== "object") return false;

  const token = value as Partial<TokenResponse>;
  return (
    typeof token.access_token === "string" &&
    token.access_token.length > 0 &&
    typeof token.expires_in === "number" &&
    Number.isFinite(token.expires_in) &&
    token.expires_in > 0
  );
};

const headersWithJsonAccept = (headers?: HeadersInit) => {
  const next = new Headers(headers);
  next.set("Accept", "application/json");
  return next;
};

const formatHttpStatus = (status: number, statusText: string) =>
  statusText ? `${status} ${statusText}` : String(status);

export class DdfTokenFetchError extends Data.TaggedError("DdfTokenFetchError")<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `Token request failed before receiving a response from ${this.url}`;
  }
}

export class DdfTokenHttpError extends Data.TaggedError("DdfTokenHttpError")<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
}> {
  override get message() {
    return `Token request failed with HTTP ${formatHttpStatus(
      this.status,
      this.statusText,
    )}`;
  }
}

export class DdfTokenJsonParseError extends Data.TaggedError(
  "DdfTokenJsonParseError",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `Token response body is not valid JSON from ${this.url}`;
  }
}

export class DdfTokenResponseValidationError extends Data.TaggedError(
  "DdfTokenResponseValidationError",
)<{
  readonly url: string;
}> {
  override get message() {
    return "Token response is missing required fields";
  }
}

export class DdfApiTransportFetchFailure extends Data.TaggedError(
  "DdfApiTransportFetchFailure",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `DDF API request failed before receiving a response from ${this.url}`;
  }
}

export class DdfApiHttpError extends Data.TaggedError("DdfApiHttpError")<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API request failed with HTTP ${formatHttpStatus(
      this.status,
      this.statusText,
    )} from ${this.url}`;
  }
}

export class DdfApiBadRequestQueryError extends Data.TaggedError(
  "DdfApiBadRequestQueryError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API rejected the request/query with HTTP ${formatHttpStatus(this.status, this.statusText)} from ${this.url}`;
  }
}

export class DdfApiUnauthorizedAfterRefreshError extends Data.TaggedError(
  "DdfApiUnauthorizedAfterRefreshError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API returned unauthorized after refreshing credentials from ${this.url}`;
  }
}

export class DdfApiForbiddenError extends Data.TaggedError(
  "DdfApiForbiddenError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API forbids this request with HTTP ${formatHttpStatus(this.status, this.statusText)} from ${this.url}`;
  }
}

export class DdfApiNotFoundError extends Data.TaggedError(
  "DdfApiNotFoundError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API resource was not found at ${this.url}`;
  }
}

export class DdfApiTimeoutError extends Data.TaggedError("DdfApiTimeoutError")<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API request timed out with HTTP ${formatHttpStatus(this.status, this.statusText)} from ${this.url}`;
  }
}

export class DdfApiUnsupportedMediaTypeError extends Data.TaggedError(
  "DdfApiUnsupportedMediaTypeError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API rejected the media type with HTTP ${formatHttpStatus(this.status, this.statusText)} from ${this.url}`;
  }
}

export class DdfApiRetryableServiceUnavailableError extends Data.TaggedError(
  "DdfApiRetryableServiceUnavailableError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API service is unavailable after retries from ${this.url}`;
  }
}

export class DdfApiInternalServerError extends Data.TaggedError(
  "DdfApiInternalServerError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API returned an internal server error from ${this.url}`;
  }
}

export class DdfApiJsonParseError extends Data.TaggedError(
  "DdfApiJsonParseError",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `DDF API response body is not valid JSON from ${this.url}`;
  }
}

export class DdfApiResponseSchemaDecodeError extends Data.TaggedError(
  "DdfApiResponseSchemaDecodeError",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `DDF API response failed schema decoding from ${this.url}`;
  }
}

export type DdfApiMappedHttpError =
  | DdfApiHttpError
  | DdfApiBadRequestQueryError
  | DdfApiUnauthorizedAfterRefreshError
  | DdfApiForbiddenError
  | DdfApiNotFoundError
  | DdfApiTimeoutError
  | DdfApiUnsupportedMediaTypeError
  | DdfApiRetryableServiceUnavailableError
  | DdfApiInternalServerError;

const statusError = (args: {
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}): DdfApiMappedHttpError => {
  switch (args.status) {
    case 400:
      return new DdfApiBadRequestQueryError(args);
    case 401:
      return new DdfApiUnauthorizedAfterRefreshError(args);
    case 403:
      return new DdfApiForbiddenError(args);
    case 404:
      return new DdfApiNotFoundError(args);
    case 408:
      return new DdfApiTimeoutError(args);
    case 415:
      return new DdfApiUnsupportedMediaTypeError(args);
    case 500:
      return new DdfApiInternalServerError(args);
    case 503:
      return new DdfApiRetryableServiceUnavailableError(args);
    default:
      return new DdfApiHttpError(args);
  }
};

export type DdfAuthError =
  | DdfTokenFetchError
  | DdfTokenHttpError
  | DdfTokenJsonParseError
  | DdfTokenResponseValidationError;

export type DdfHttpError =
  | DdfAuthError
  | DdfApiTransportFetchFailure
  | DdfApiMappedHttpError
  | DdfApiJsonParseError
  | DdfApiResponseSchemaDecodeError
  | DdfInvalidODataQueryError;

const decodeJson = <T>(
  json: unknown,
  url: string,
  schema?: DdfResponseSchema<T>,
): Effect.Effect<T, DdfApiResponseSchemaDecodeError> => {
  if (!schema) return Effect.succeed(json as T);

  return Schema.decodeUnknownEffect(schema)(json).pipe(
    Effect.mapError(
      (cause) => new DdfApiResponseSchemaDecodeError({ url, cause }),
    ),
  );
};


const responseText = (res: HttpClientResponse.HttpClientResponse) =>
  res.text.pipe(Effect.orElseSucceed(() => undefined as string | undefined));

const requestFromOptions = (url: string, init?: DdfRequestOptions) => {
  const method = init?.method ?? "GET";
  let request = HttpClientRequest.make(method)(url, {
    headers: init?.headers,
    acceptJson: true,
  });
  if (init?.body !== undefined) {
    if (init.body instanceof URLSearchParams) {
      request = HttpClientRequest.bodyUrlParams(request, init.body);
    } else if (typeof init.body === "string") {
      request = HttpClientRequest.bodyText(
        request,
        init.body,
        init.headers?.["content-type"] ?? init.headers?.["Content-Type"] ?? "application/json",
      );
    } else {
      request = HttpClientRequest.bodyJsonUnsafe(request, init.body);
    }
  }
  return request;
};

class RetryableApiStatus extends Data.TaggedError("RetryableApiStatus")<{
  readonly response: HttpClientResponse.HttpClientResponse;
}> {}

const tokenTransportError = (url: string, cause: unknown) =>
  new DdfTokenFetchError({ url, cause });

const apiTransportError = (url: string, cause: unknown) =>
  new DdfApiTransportFetchFailure({ url, cause });

const secretValue = (secret: string | Redacted.Redacted<string>) =>
  typeof secret === "string" ? secret : Redacted.value(secret);

export const makeDdfLayer = (config: DdfClientConfig) => {
  const configLayer = Layer.succeed(DdfConfig, config);
  const fetchLayer = config.fetch
    ? Layer.succeed(FetchHttpClient.Fetch, (async (input, init) => {
        if (input instanceof Request) {
          const headers = new Headers(input.headers);
          let body: BodyInit | null | undefined = undefined;
          if (!["GET", "HEAD"].includes(input.method)) {
            const text = await input.clone().text();
            const contentType = headers.get("content-type") ?? "";
            body = contentType.includes("application/x-www-form-urlencoded")
              ? new URLSearchParams(text)
              : text;
          }
          return config.fetch!(input.url, { method: input.method, headers, body });
        }
        const headers = new Headers(init?.headers);
        let body = init?.body;
        if (body instanceof Uint8Array) {
          const text = new TextDecoder().decode(body);
          const contentType = headers.get("content-type") ?? "";
          body = contentType.includes("application/x-www-form-urlencoded") || text.includes("grant_type=client_credentials")
            ? new URLSearchParams(text)
            : text;
        }
        return config.fetch!(input, { ...init, headers, body });
      }) as typeof fetch)
    : Layer.empty;
  const nativeHttpLayer = FetchHttpClient.layer.pipe(Layer.provide(fetchLayer));

  const authLayer = Layer.effect(
    DdfAuth,
    Effect.gen(function* () {
      const cfg = yield* DdfConfig;
      const client = yield* HttpClient.HttpClient;
      const tokenExpiryBuffer = Duration.toMillis(
        Duration.fromInputUnsafe(cfg.tokenExpiryBuffer ?? "60 seconds"),
      );

      const fetchToken = Effect.fn("DdfAuth.fetchToken")(function* () {
        const identityUrl = cfg.identityUrl ?? "https://identity.crea.ca/connect/token";
        yield* Effect.logDebug("requesting CREA DDF token", { url: identityUrl });
        cfg.logger?.debug?.({ type: "token_request", url: identityUrl, forceRefresh: false });
        yield* Metric.update(ddfTokenRequestCount, 1);
        const request = HttpClientRequest.post(identityUrl).pipe(
          HttpClientRequest.bodyUrlParams(
            new URLSearchParams({
              grant_type: "client_credentials",
              client_id: cfg.clientId,
              client_secret: secretValue(cfg.clientSecret),
              scope: "DDFApi_Read",
            }),
          ),
        );
        const res = yield* client.execute(request).pipe(
          Effect.mapError((cause) => tokenTransportError(identityUrl, cause)),
        );
        if (res.status < 200 || res.status >= 300) {
          return yield* new DdfTokenHttpError({
            url: identityUrl,
            status: res.status,
            statusText: "",
          });
        }
        const json: unknown = yield* res.json.pipe(
          Effect.mapError((cause) => new DdfTokenJsonParseError({ url: identityUrl, cause })),
        );
        if (!hasValidTokenFields(json)) {
          return yield* new DdfTokenResponseValidationError({ url: identityUrl });
        }
        return {
          token: Redacted.make(json.access_token),
          ttlMillis: Math.max(0, json.expires_in * 1000 - tokenExpiryBuffer),
        } satisfies CachedToken;
      });

      const cache = yield* Cache.makeWith<string, CachedToken, DdfAuthError>(
        () => fetchToken(),
        {
          capacity: 1,
          timeToLive(exit) {
            if (exit._tag === "Failure") return Duration.zero;
            return Duration.millis(exit.value.ttlMillis);
          },
        },
      );

      const getAccessToken = Effect.fn("DdfAuth.getAccessToken")(
        function* (options?: { readonly forceRefresh?: boolean }) {
          if (options?.forceRefresh) {
            yield* Metric.update(ddfTokenRefreshCount, 1);
            yield* Cache.invalidate(cache, "access-token");
          }
          const before = yield* Cache.size(cache);
          const token = yield* Cache.get(cache, "access-token");
          const after = yield* Cache.size(cache);
          yield* Metric.update(before > 0 && after > 0 && !options?.forceRefresh ? ddfAuthCacheHitCount : ddfAuthCacheMissCount, 1);
          return token.token;
        },
      );

      return { getAccessToken } satisfies DdfAuthApi;
    }),
  );

  const closedAuthLayer = authLayer.pipe(Layer.provide(Layer.mergeAll(configLayer, nativeHttpLayer)));

  const httpLayer = Layer.effect(
    DdfHttp,
    Effect.gen(function* () {
      const cfg = yield* DdfConfig;
      const auth = yield* DdfAuth;
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
        const token = yield* auth.getAccessToken({ forceRefresh });
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
          yield* Effect.logWarning("CREA DDF API retryable status", { url, status: res.status });
          cfg.logger?.warn?.({ type: "api_retry", url, status: res.status, attempt: 1, delayMillis: Duration.toMillis(Duration.fromInputUnsafe(retryPolicy.baseDelay)) });
          yield* Metric.update(ddfApiRetryCount, 1);
          return yield* new RetryableApiStatus({ response: res });
        }
        return res;
      });

      const requestJson = Effect.fn("DdfHttp.requestJson")(function* <T = unknown>(
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
            Effect.catchTag("RetryableApiStatus", (error) => Effect.succeed(error.response)),
          );

        const res = yield* sendWithRetry(false).pipe(Effect.trackDuration(ddfRequestDuration));
        const finalRes = res.status === 401
          ? yield* Effect.gen(function* () {
              yield* Effect.logWarning("CREA DDF API unauthorized; refreshing token", { url, status: res.status });
              cfg.logger?.warn?.({ type: "api_unauthorized_refresh", url, status: res.status });
              const refreshed = yield* sendWithRetry(true);
              if (refreshed.status === 401) return refreshed;
              return refreshed;
            })
          : res;

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
          Effect.mapError((cause) => new DdfApiJsonParseError({ url, cause })),
        );
        return yield* decodeJson(json, url, schema).pipe(
          Effect.tapError((cause) => Effect.logWarning("CREA DDF schema decode failed", { url, cause })),
        );
      });

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
                : new DdfInvalidODataQueryError({ option: "query", messageText: String(cause) }),
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
                : new DdfInvalidODataQueryError({ option: "query", messageText: String(cause) }),
          });
          return yield* requestJson(`${path}(${keyLiteral(key)})${encoded}`, undefined, schema);
        }),
        replicateIdentifiers: Effect.fn("DdfHttp.replicateIdentifiers")(
          function* <T = unknown>(path: string, query?: ReplicationQuery, schema?: DdfResponseSchema<T>) {
            const encoded = yield* Effect.try({
              try: () => encodeODataQuery(query),
              catch: (cause) =>
                cause instanceof DdfInvalidODataQueryError
                  ? cause
                  : new DdfInvalidODataQueryError({ option: "query", messageText: String(cause) }),
            });
            return yield* requestJson(`${path}${encoded}`, undefined, schema);
          },
        ),
        paginateOData: Effect.fn("DdfOData.paginate")(function* (first: string) {
          const out: Array<unknown> = [];
          let next: string | undefined = first;
          while (next) {
            const page = (yield* requestJson(next, undefined, ODataUnknownListEnvelopeSchema)) as {
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
  );

  const closedHttpLayer = httpLayer.pipe(
    Layer.provide(Layer.mergeAll(configLayer, closedAuthLayer, nativeHttpLayer)),
  );

  return Layer.mergeAll(configLayer, nativeHttpLayer, closedAuthLayer, closedHttpLayer);
};

export const makeDdfLayerFromEnv = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ddfConfigFromEnv;
    return makeDdfLayer(config);
  }),
);
