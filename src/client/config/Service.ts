import { Config, Context, Duration, Layer, Redacted } from "effect";

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
  | {
      readonly type: "token_request";
      readonly url: string;
      readonly forceRefresh: boolean;
    }
  | { readonly type: "api_request"; readonly url: string }
  | {
      readonly type: "api_retry";
      readonly url: string;
      readonly status: number;
      readonly attempt: number;
      readonly delayMillis: number;
    }
  | {
      readonly type: "api_unauthorized_refresh";
      readonly url: string;
      readonly status: number;
    };

export interface DdfClientConfig {
  readonly clientId: string;
  readonly clientSecret: string | Redacted.Redacted<string>;
  readonly baseUrl?: string;
  readonly identityUrl?: string;
  readonly analyticsUrl?: string;
  readonly retryPolicy?: DdfRetryPolicy;
  readonly tokenExpiryBuffer?: Duration.Input;
  readonly logger?: DdfLogger;
}

export class DdfConfig extends Context.Service<DdfConfig, DdfClientConfig>()(
  "crea-ddf-effect-sdk/client/config/Service/DdfConfig",
) {
  static readonly layer = (config: DdfClientConfig) =>
    Layer.succeed(this, config);
}

export const ddfConfigFromEnv = Config.all({
  clientId: Config.string("CREA_DDF_CLIENT_ID"),
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
});
