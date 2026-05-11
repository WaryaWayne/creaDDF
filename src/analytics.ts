import { Config, Data, Effect } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { DdfConfig } from "./client";

export const DEFAULT_CREA_ANALYTICS_URL =
  "https://analytics.crea.ca/LogEvents.svc/LogEvents";

export type AnalyticsEventType = "View" | "Click" | "email_realtor";
export type AnalyticsLanguageID = 1 | 2;

export interface AnalyticsLogEventInput {
  readonly ListingID: string | number;
  readonly DestinationID: string | number;
  readonly EventType: AnalyticsEventType;
  readonly UUID: string;
  readonly IP?: string;
  readonly ReferralURL?: string;
  readonly LanguageID?: AnalyticsLanguageID;
}

export class DdfAnalyticsTransportError extends Data.TaggedError(
  "DdfAnalyticsTransportError",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `CREA analytics event transport failed before receiving a response from ${this.url}`;
  }
}

const analyticsParamEntries = (input: AnalyticsLogEventInput) => {
  const entries: Array<readonly [string, string]> = [
    ["ListingID", String(input.ListingID)],
    ["DestinationID", String(input.DestinationID)],
    ["EventType", input.EventType],
    ["UUID", input.UUID],
  ];

  if (input.IP !== undefined) entries.push(["IP", input.IP]);
  if (input.ReferralURL !== undefined)
    entries.push(["ReferralURL", input.ReferralURL]);
  if (input.LanguageID !== undefined)
    entries.push(["LanguageID", String(input.LanguageID)]);

  return entries;
};

export const buildAnalyticsLogEventUrl = (
  input: AnalyticsLogEventInput,
  analyticsUrl = DEFAULT_CREA_ANALYTICS_URL,
) => {
  const url = new URL(analyticsUrl);
  for (const [key, value] of analyticsParamEntries(input)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

export const logAnalyticsEvent = Effect.fn("logAnalyticsEvent")(function* (
  input: AnalyticsLogEventInput,
) {
  const client = yield* HttpClient.HttpClient;
  const cfg = yield* DdfConfig;
  const url = buildAnalyticsLogEventUrl(input, cfg.analyticsUrl);
  return yield* client
    .get(url)
    .pipe(
      Effect.mapError(
        (cause) => new DdfAnalyticsTransportError({ url, cause }),
      ),
    );
});
