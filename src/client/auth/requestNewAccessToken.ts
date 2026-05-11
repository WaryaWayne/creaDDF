import { DdfConfig } from "../config/Service";
import { ddfTokenRequestCount } from "../../metrics";
import { Duration, Effect, Metric, Redacted, Schema } from "effect";
import { HttpBody, HttpClient, UrlParams } from "effect/unstable/http";
import {
  DdfTokenTransportError,
  DdfTokenHttpError,
  DdfTokenJsonParseError,
  DdfTokenResponseValidationError,
} from "./errors";

const TokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.Number,
  token_type: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
});

const secretValue = (secret: string | Redacted.Redacted<string>) =>
  typeof secret === "string" ? secret : Redacted.value(secret);

export const requestNewAccessToken = Effect.fn("DdfAuth.requestNewAccessToken")(
  function* () {
    const cfg = yield* DdfConfig;
    const client = yield* HttpClient.HttpClient;
    const tokenExpiryBuffer = Duration.toMillis(
      Duration.fromInputUnsafe(cfg.tokenExpiryBuffer ?? "60 seconds"),
    );
    const identityUrl =
      cfg.identityUrl ?? "https://identity.crea.ca/connect/token";
    yield* Effect.logDebug("requesting CREA DDF token", {
      url: identityUrl,
    });
    cfg.logger?.debug?.({
      type: "token_request",
      url: identityUrl,
      forceRefresh: false,
    });
    yield* Metric.update(ddfTokenRequestCount, 1);

    const response = yield* client
      .post(identityUrl, {
        body: HttpBody.urlParams(
          UrlParams.fromInput({
            grant_type: "client_credentials",
            client_id: cfg.clientId,
            client_secret: secretValue(cfg.clientSecret),
            scope: "DDFApi_Read",
          }),
        ),
      })
      .pipe(
        Effect.mapError(
          (cause) => new DdfTokenTransportError({ url: identityUrl, cause }),
        ),
      );

    if (response.status < 200 || response.status >= 300) {
      return yield* new DdfTokenHttpError({
        url: identityUrl,
        status: response.status,
        statusText: "",
      });
    }

    const jsonResponse: unknown = yield* response.json.pipe(
      Effect.mapError(
        (cause) => new DdfTokenJsonParseError({ url: identityUrl, cause }),
      ),
    );

    const { access_token, expires_in } = yield* Schema.decodeUnknownEffect(
      TokenResponseSchema,
    )(jsonResponse).pipe(
      Effect.mapError(
        (failure) =>
          new DdfTokenResponseValidationError({ url: identityUrl, failure }),
      ),
    );

    if (access_token.length === 0) {
      return yield* new DdfTokenResponseValidationError({
        url: identityUrl,
        failure: "empty access_token",
      });
    }

    return {
      token: Redacted.make(access_token),
      ttlMillis: Math.max(0, expires_in * 1000 - tokenExpiryBuffer),
    };
  },
);
