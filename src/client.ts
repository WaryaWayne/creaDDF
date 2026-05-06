import { Clock, Context, Data, Effect, Layer, Ref, Schema } from "effect";
import type { ODataGetQuery, ODataListQuery, ReplicationQuery } from "./types";
import { ODataUnknownListEnvelopeSchema } from "./schema/odata";

export interface DdfClientConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  identityUrl?: string;
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

export const encodeODataQuery = (
  query?: ODataListQuery | ODataGetQuery | ReplicationQuery,
): string => {
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

export class DdfTokenFetchError extends Data.TaggedError(
  "DdfTokenFetchError",
)<{
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

export class DdfApiFetchError extends Data.TaggedError("DdfApiFetchError")<{
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
}> {
  override get message() {
    return `DDF API request failed with HTTP ${formatHttpStatus(
      this.status,
      this.statusText,
    )} from ${this.url}`;
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

export type DdfAuthError =
  | DdfTokenFetchError
  | DdfTokenHttpError
  | DdfTokenJsonParseError
  | DdfTokenResponseValidationError;

export type DdfHttpError =
  | DdfAuthError
  | DdfApiFetchError
  | DdfApiHttpError
  | DdfApiJsonParseError
  | DdfApiResponseSchemaDecodeError;

const decodeJson = <T>(
  json: unknown,
  url: string,
  schema?: DdfResponseSchema<T>,
): Effect.Effect<T, DdfApiResponseSchemaDecodeError> => {
  if (!schema) return Effect.succeed(json as T);

  return Schema.decodeUnknownEffect(schema)(json).pipe(
    Effect.mapError((cause) =>
      new DdfApiResponseSchemaDecodeError({ url, cause }),
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
            catch: (cause) => new DdfTokenFetchError({ url: identityUrl, cause }),
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
              catch: (cause) => new DdfApiFetchError({ url, cause }),
            });

            if (res.status === 401 && !refreshed) {
              return yield* request(remainingRetries, true, true);
            }

            if (isRetryableStatus(res.status) && remainingRetries > 0) {
              return yield* request(remainingRetries - 1, refreshed, false);
            }

            if (!res.ok) {
              return yield* new DdfApiHttpError({
                url,
                status: res.status,
                statusText: res.statusText,
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
          return yield* requestJson(
            `${path}${encodeODataQuery(query)}`,
            undefined,
            schema,
          );
        }),
        getOData: Effect.fn("DdfHttp.getOData")(function* <T = unknown>(
          path: string,
          key: string | number,
          query?: ODataGetQuery,
          schema?: DdfResponseSchema<T>,
        ) {
          return yield* requestJson(
            `${path}(${keyLiteral(key)})${encodeODataQuery(query)}`,
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
            return yield* requestJson(
              `${path}${encodeODataQuery(query)}`,
              undefined,
              schema,
            );
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
