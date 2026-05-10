import { Cache, Duration } from "effect";
import { fetchNewAccessToken } from "./fetchNewAccessToken";

export const makeAccessTokenCache = Cache.makeWith(
  (_key: void) => fetchNewAccessToken(),
  {
    capacity: 1,
    timeToLive(exit) {
      if (exit._tag === "Failure") return Duration.zero;
      return Duration.millis(exit.value.ttlMillis);
    },
    requireServicesAt: "lookup",
  },
);
