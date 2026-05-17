import type { Effect, Redacted } from "effect";
import type { DdfAuthError } from "#/client/http/errors";

export interface DdfAuthApi {
  readonly getAccessToken: (options?: {
    readonly forceRefresh?: boolean;
  }) => Effect.Effect<Redacted.Redacted<string>, DdfAuthError>;
}
