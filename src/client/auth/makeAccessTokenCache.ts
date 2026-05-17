import { Cache, Duration } from "effect";
import { requestNewAccessToken } from "#/client/auth/requestNewAccessToken";

export const makeAccessTokenCache = Cache.makeWith(
  (_key: void) => requestNewAccessToken(),
  {
    capacity: 1,
    timeToLive(exit) {
      if (exit._tag === "Failure") return Duration.zero;
      return Duration.millis(exit.value.ttlMillis);
    },
  },
);
