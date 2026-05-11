import { Context, Effect, Layer, Cache, Metric } from "effect";
import { makeAccessTokenCache } from "./makeAccessTokenCache";
import {
  ddfAuthCacheHitCount,
  ddfAuthCacheMissCount,
  ddfTokenRefreshCount,
} from "@/metrics";
import { FetchHttpClient } from "effect/unstable/http";
import { DdfClientConfig } from "@/client";

export class DdfAuthService extends Context.Service<DdfAuthService>()(
  "crea-ddf-effect-sdk/client/auth/Service/DdfAuthService",
  {
    make: Effect.gen(function* () {
      const cache = yield* makeAccessTokenCache;

      const getAccessToken = Effect.fn("DdfAuth.getAccessToken")(function* ({
        forceRefresh,
      }: {
        forceRefresh: boolean;
      }) {
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
      });

      return { getAccessToken };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.merge(FetchHttpClient.layer),
  );
}

const wow = Effect.gen(function* () {
  const wow = yield* DdfAuthService;
  const token = yield* wow.getAccessToken({ forceRefresh: false });
  
});
