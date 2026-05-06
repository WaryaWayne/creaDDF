import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import {
  buildAnalyticsLogEventUrl,
  DEFAULT_CREA_ANALYTICS_URL,
  logAnalyticsEvent,
} from "./analytics";
import { makeDdfLayer } from "./client";

const baseInput = {
  ListingID: 12830763,
  DestinationID: 355,
  EventType: "View",
  UUID: "6b106320-b422-11e2-9e96-0800200c9a66-355",
} as const;

describe("analytics", () => {
  it("builds the documented default LogEvents URL with required fields", () => {
    const url = new URL(buildAnalyticsLogEventUrl(baseInput));

    assert.equal(url.origin + url.pathname, DEFAULT_CREA_ANALYTICS_URL);
    assert.equal(url.searchParams.get("ListingID"), "12830763");
    assert.equal(url.searchParams.get("DestinationID"), "355");
    assert.equal(url.searchParams.get("EventType"), "View");
    assert.equal(
      url.searchParams.get("UUID"),
      "6b106320-b422-11e2-9e96-0800200c9a66-355",
    );
    assert.equal(url.searchParams.has("IP"), false);
    assert.equal(url.searchParams.has("ReferralURL"), false);
    assert.equal(url.searchParams.has("LanguageID"), false);
  });

  it("encodes optional analytics fields and allows an environment URL override", () => {
    const previous = process.env.CREA_ANALYTICS_URL;
    process.env.CREA_ANALYTICS_URL = "https://analytics.test/LogEvents";
    try {
      const built = buildAnalyticsLogEventUrl({
        ...baseInput,
        EventType: "email_realtor",
        IP: "192.168.1.1",
        ReferralURL: "https://example.test/path?q=John O'Brien & Co",
        LanguageID: 2,
      });
      const url = new URL(built);

      assert.equal(url.origin + url.pathname, "https://analytics.test/LogEvents");
      assert.equal(url.searchParams.get("EventType"), "email_realtor");
      assert.equal(url.searchParams.get("IP"), "192.168.1.1");
      assert.equal(
        url.searchParams.get("ReferralURL"),
        "https://example.test/path?q=John O'Brien & Co",
      );
      assert.equal(url.searchParams.get("LanguageID"), "2");
      assert.match(built, /ReferralURL=https%3A%2F%2Fexample\.test/);
    } finally {
      if (previous === undefined) delete process.env.CREA_ANALYTICS_URL;
      else process.env.CREA_ANALYTICS_URL = previous;
    }
  });

  it("uses client config analyticsUrl without adding auth or secrets", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const debugEvents: Array<unknown> = [];
    const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await Effect.runPromise(
      logAnalyticsEvent({
        ...baseInput,
        EventType: "Click",
        ReferralURL: "https://example.test/listing/12830763",
      }).pipe(
        Effect.provide(
          makeDdfLayer({
            clientId: "client-id",
            clientSecret: "super-secret-client-secret",
            analyticsUrl: "https://analytics.override.test/log",
            fetch: fetchMock,
            logger: { debug: (event) => debugEvents.push(event) },
          }),
        ),
      ),
    );

    const url = new URL(requestedUrl);
    assert.equal(url.origin + url.pathname, "https://analytics.override.test/log");
    assert.equal(url.searchParams.get("EventType"), "Click");
    assert.equal(requestedInit?.method, "GET");
    assert.equal(requestedInit?.headers, undefined);
    assert.equal(JSON.stringify(debugEvents).includes("super-secret"), false);
  });
});
