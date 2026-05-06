import { Clock, Context, Data, Effect, Layer, Ref, Schema } from "effect";
import type { ODataGetQuery, ODataListQuery, ReplicationQuery } from "./types";
import { ODataUnknownListEnvelopeSchema } from "./schema/odata";

export interface DdfClientConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  identityUrl?: string;
  /**
   * Explicit fetch boundary for now. TODO: migrate this to Effect Platform's
   * Fetch/Http client service layer when that dependency is adopted, without
   * falling back to global fetch inside SDK workflows.
   */
  fetch: typeof fetch;
}

interface CachedToken {
  token: string;
  expiresAt: number;
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
  }) => Effect.Effect<string, DdfAuthError>;
}

export type DdfResponseSchema<T> = Schema.Decoder<T, never>;

export interface DdfHttpApi {
  requestJson: <T = unknown>(
    path: string,
    init?: RequestInit,
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

export const DdfConfig = Context.Service<DdfClientConfig>("DdfConfig");
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
const odataValueLiteral = (value: string | number | boolean | Date | null) => {
  if (value === null) return "null";
  if (typeof value === "string") return odataStringLiteral(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

export const filters = {
  eq: (field: string, value: string | number | boolean | Date | null) =>
    `${field} eq ${odataValueLiteral(value)}`,
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
const isRetryableStatus = (status: number) => status === 408 || status === 503;

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

const responseText = (res: Response) =>
  Effect.tryPromise({
    try: () => res.clone().text(),
    catch: () => undefined,
  }).pipe(Effect.orElseSucceed(() => undefined as string | undefined));

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

export const makeDdfLayer = (config: DdfClientConfig) => {
  const configLayer = Layer.succeed(DdfConfig, config);

  const authLayer = Layer.effect(
    DdfAuth,
    Effect.gen(function* () {
      const cfg = yield* DdfConfig;
      const ref = yield* Ref.make<CachedToken | null>(null);

      const getAccessToken = Effect.fn("DdfAuth.getAccessToken")(
        function* (options?: { readonly forceRefresh?: boolean }) {
          const cached = yield* Ref.get(ref);
          const now = yield* Clock.currentTimeMillis;

          if (
            !options?.forceRefresh &&
            cached &&
            cached.expiresAt > now + 60_000
          ) {
            return cached.token;
          }

          const identityUrl =
            cfg.identityUrl ?? "https://identity.crea.ca/connect/token";

          const res = yield* Effect.tryPromise({
            try: () =>
              cfg.fetch(identityUrl, {
                method: "POST",
                body: new URLSearchParams({
                  grant_type: "client_credentials",
                  client_id: cfg.clientId,
                  client_secret: cfg.clientSecret,
                  scope: "DDFApi_Read",
                }),
              }),
            catch: (cause) =>
              new DdfTokenFetchError({ url: identityUrl, cause }),
          });

          if (!res.ok) {
            return yield* new DdfTokenHttpError({
              url: identityUrl,
              status: res.status,
              statusText: res.statusText,
            });
          }

          const json: unknown = yield* Effect.tryPromise({
            try: () => res.json(),
            catch: (cause) =>
              new DdfTokenJsonParseError({ url: identityUrl, cause }),
          });

          if (!hasValidTokenFields(json)) {
            return yield* new DdfTokenResponseValidationError({
              url: identityUrl,
            });
          }

          yield* Ref.set(ref, {
            token: json.access_token,
            expiresAt: now + json.expires_in * 1000,
          });
          return json.access_token;
        },
      );

      return { getAccessToken };
    }),
  );

  const closedAuthLayer = authLayer.pipe(Layer.provide(configLayer));

  const httpLayer = Layer.effect(
    DdfHttp,
    Effect.gen(function* () {
      const cfg = yield* DdfConfig;
      const auth = yield* DdfAuth;

      const requestJson = Effect.fn("DdfHttp.requestJson")(function* <
        T = unknown,
      >(path: string, init?: RequestInit, schema?: DdfResponseSchema<T>) {
        const url = path.startsWith("http")
          ? path
          : `${cfg.baseUrl ?? "https://ddfapi.realtor.ca"}${path}`;

        const request = (
          remainingRetries: number,
          refreshed: boolean,
          forceRefresh: boolean,
        ): Effect.Effect<unknown, DdfHttpError> =>
          Effect.gen(function* () {
            const token = yield* auth.getAccessToken({ forceRefresh });
            const headers = headersWithJsonAccept(init?.headers);
            headers.set("Authorization", `Bearer ${token}`);

            const res: Response = yield* Effect.tryPromise({
              try: () => cfg.fetch(url, { ...init, headers }),
              catch: (cause) => new DdfApiTransportFetchFailure({ url, cause }),
            });

            if (res.status === 401 && !refreshed) {
              return yield* request(remainingRetries, true, true);
            }

            if (isRetryableStatus(res.status) && remainingRetries > 0) {
              const attempt = 3 - remainingRetries;
              yield* Effect.sleep(100 * 2 ** attempt);
              return yield* request(remainingRetries - 1, refreshed, false);
            }

            if (!res.ok) {
              const bodyText = yield* responseText(res);
              return yield* statusError({
                url,
                status: res.status,
                statusText: res.statusText,
                bodyText,
              });
            }

            return yield* Effect.tryPromise({
              try: () => res.json(),
              catch: (cause) => new DdfApiJsonParseError({ url, cause }),
            });
          });

        const json = yield* request(2, false, false);
        return yield* decodeJson(json, url, schema);
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

          while (next) {
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
  );

  return httpLayer.pipe(
    Layer.provide(Layer.mergeAll(configLayer, closedAuthLayer)),
  );
};
