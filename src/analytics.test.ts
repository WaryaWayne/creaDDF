import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import {
  buildAnalyticsLogEventUrl,
  DEFAULT_CREA_ANALYTICS_URL,
  logAnalyticsEvent,
} from "./analytics";
import { DdfConfig } from "./client";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

interface MockRequestOptions {
  readonly method: string;
  readonly headers: Headers;
}

type HttpHandler = (url: string, init: MockRequestOptions) => Response;

const nativeClientFrom = (handler: HttpHandler): HttpClient.HttpClient =>
  HttpClient.make((request, url) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        handler(url.toString(), {
          method: request.method,
          headers: new Headers(request.headers),
        }),
      ),
    ),
  );

const layerFor = (handler: HttpHandler) =>
  Layer.mergeAll(
    DdfConfig.layer({
      clientId: "client-id",
      clientSecret: "super-secret-client-secret",
      analyticsUrl: "https://analytics.override.test/log",
      logger: { debug: (event) => debugEvents.push(event) },
    }),
    Layer.succeed(HttpClient.HttpClient, nativeClientFrom(handler)),
  );

const debugEvents: Array<unknown> = [];

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

  it("encodes optional analytics fields and allows a URL override", () => {
    const built = buildAnalyticsLogEventUrl(
      {
        ...baseInput,
        EventType: "email_realtor",
        IP: "192.168.1.1",
        ReferralURL: "https://example.test/path?q=John O'Brien & Co",
        LanguageID: 2,
      },
      "https://analytics.test/LogEvents",
    );
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
  });

  it.effect(
    "uses client config analyticsUrl without adding auth or secrets",
    () =>
      Effect.gen(function* () {
        let requestedUrl = "";
        let requestedInit: MockRequestOptions | undefined;
        debugEvents.length = 0;
        const httpHandler: HttpHandler = (input, init) => {
          requestedUrl = String(input);
          requestedInit = init;
          return new Response(null, { status: 204 });
        };

        yield* logAnalyticsEvent({
          ...baseInput,
          EventType: "Click",
          ReferralURL: "https://example.test/listing/12830763",
        }).pipe(Effect.provide(layerFor(httpHandler)));

        const url = new URL(requestedUrl);
        assert.equal(
          url.origin + url.pathname,
          "https://analytics.override.test/log",
        );
        assert.equal(url.searchParams.get("EventType"), "Click");
        assert.equal(requestedInit?.method, "GET");
        assert.equal(
          new Headers(requestedInit?.headers).has("Authorization"),
          false,
        );
        assert.equal(
          debugEvents.some((event) => String(event).includes("super-secret")),
          false,
        );
      }),
  );
});
