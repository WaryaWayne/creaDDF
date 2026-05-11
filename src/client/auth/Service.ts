import { Cache, Context, Effect, Layer, Metric } from "effect";
import { makeAccessTokenCache } from "./makeAccessTokenCache";
import {
  ddfAuthCacheHitCount,
  ddfAuthCacheMissCount,
  ddfTokenRefreshCount,
} from "../../metrics";
import type { DdfAuthError } from "../http/errors";
import type { DdfAuthApi } from "./types";

export class DdfAuth extends Context.Service<DdfAuth, DdfAuthApi>()(
  "crea-ddf-effect-sdk/client/auth/Service/DdfAuth",
  {
    make: Effect.gen(function* () {
      const cache = yield* makeAccessTokenCache;

      const getAccessToken = Effect.fn("DdfAuth.getAccessToken")(
        function* (options?: { readonly forceRefresh?: boolean }) {
          const forceRefresh = options?.forceRefresh === true;
          if (forceRefresh) {
            yield* Metric.update(ddfTokenRefreshCount, 1);
            yield* Cache.invalidate(cache, void 0);
          }
          const before = yield* Cache.size(cache);
          const token = yield* Cache.get(cache, void 0);
          const after = yield* Cache.size(cache);
          yield* Metric.update(
            before > 0 && after > 0 && !forceRefresh
              ? ddfAuthCacheHitCount
              : ddfAuthCacheMissCount,
            1,
          );
          return token.token;
        },
      );

      return { getAccessToken } satisfies DdfAuthApi;
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}

export { DdfAuth as DdfAuthService };
