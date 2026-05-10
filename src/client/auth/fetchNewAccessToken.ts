import { DdfConfig } from "@/client";
import { ddfTokenRequestCount } from "@/metrics";
import { Duration, Effect, Metric, Redacted, Result, Schema } from "effect";
import { HttpClient, UrlParams } from "effect/unstable/http";
import {
  DdfTokenFetchError,
  DdfTokenHttpError,
  DdfTokenJsonParseError,
  DdfTokenResponseValidationError,
} from "./errors";

const TokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.Number,
  token_type: Schema.String,
  scope: Schema.String,
});

const secretValue = (secret: string | Redacted.Redacted<string>) =>
  typeof secret === "string" ? secret : Redacted.value(secret);

export const fetchNewAccessToken = Effect.fn("DdfAuth.fetchNewAccessToken")(
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
        urlParams: UrlParams.fromInput({
          values: {
            grant_type: "client_credentials",
            client_id: cfg.clientId,
            client_secret: secretValue(cfg.clientSecret),
            scope: "DDFApi_Read",
          },
        }),
      })
      .pipe(
        Effect.mapError(
          (cause) => new DdfTokenFetchError({ url: identityUrl, cause }),
        ),
      );

    if (response.status < 200 || response.status >= 300) {
      return yield* new DdfTokenHttpError({
        url: identityUrl,
        status: response.status,
        statusText: "",
      });
    }

    const jsonResponse = yield* response.json;

    const parseResult = yield* Effect.try({
      try: () => Schema.decodeUnknownResult(TokenResponseSchema)(jsonResponse),
      catch: (cause) => new DdfTokenJsonParseError({ url: identityUrl, cause }),
    });

    if (Result.isFailure(parseResult)) {
      return yield* new DdfTokenResponseValidationError({
        url: identityUrl,
        failure: parseResult.failure,
      });
    }

    const { access_token, expires_in } = parseResult.success;

    return {
      token: Redacted.make(access_token),
      ttlMillis: Math.max(0, expires_in * 1000 - tokenExpiryBuffer),
    };
  },
);
