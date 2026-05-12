import { assert, describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";
import { DdfAuth, DdfConfig, DdfHttp, encodeODataQuery } from "./client";
import type { DdfClientConfig, DdfHttpApi, DdfRequestOptions } from "./client";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import {
  createLead,
  getDestination,
  getMember,
  getOffice,
  getOpenHouse,
  getProperty,
  listDestinations,
  listMembers,
  listOffices,
  listOpenHouses,
  listProperties,
  replicateMembers,
  replicateMembersForDestination,
  replicateOffices,
  replicateOfficesForDestination,
  replicateProperties,
  replicatePropertiesForDestination,
} from "./resources";
import type {
  LeadInput,
  ODataGetQuery,
  ODataListQuery,
  ReplicationQuery,
} from "./types";

const keyLiteral = (key: string | number) =>
  typeof key === "number" ? String(key) : `'${key.replaceAll("'", "''")}'`;
interface MockRequestOptions {
  readonly method: string;
  readonly headers: Headers;
  readonly body?: string | URLSearchParams;
}

type HttpHandler = (url: string, init: MockRequestOptions) => Response;

const httpHandlerFrom = (handler: HttpHandler) => handler;

const tokenResponse = Response.json({
  access_token: "token-123",
  expires_in: 3600,
});

const configFor = (): DdfClientConfig => ({
  clientId: "client-id",
  clientSecret: "client-secret",
  identityUrl: "https://identity.test/connect/token",
  baseUrl: "https://ddf.test",
});

const bodyFromRequest = (request: HttpClientRequest.HttpClientRequest) => {
  if (request.body._tag !== "Uint8Array") return undefined;
  const text = new TextDecoder().decode(request.body.body);
  const contentType = request.body.contentType;
  return contentType.includes("application/x-www-form-urlencoded")
    ? new URLSearchParams(text)
    : text;
};

const nativeClientFrom = (handler: HttpHandler): HttpClient.HttpClient =>
  HttpClient.make((request, url) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        handler(url.toString(), {
          method: request.method,
          headers: new Headers(request.headers),
          body: bodyFromRequest(request),
        }),
      ),
    ),
  );

const layerFor = (handler: HttpHandler) => {
  const configLayer = DdfConfig.layer(configFor());
  const nativeHttpLayer = Layer.succeed(
    HttpClient.HttpClient,
    nativeClientFrom(handler),
  );
  const baseLayer = Layer.mergeAll(configLayer, nativeHttpLayer);
  const authLayer = DdfAuth.layer.pipe(Layer.provide(baseLayer));
  const httpLayer = DdfHttp.layer.pipe(
    Layer.provide(Layer.mergeAll(baseLayer, authLayer)),
  );

  return Layer.mergeAll(configLayer, nativeHttpLayer, authLayer, httpLayer);
};

const requestedUrlFor = (effect: Effect.Effect<unknown, unknown, DdfHttp>) =>
  Effect.gen(function* () {
    const requestedUrls: Array<string> = [];
    const response = <T>(value: unknown) => Effect.succeed(value as T);
    const http: DdfHttpApi = {
      requestJson: <T = unknown>(url: string) => {
        requestedUrls.push(url);
        return response<T>({ value: [] });
      },
      listOData: <T = unknown>(url: string, query?: ODataListQuery) => {
        requestedUrls.push(`${url}${encodeODataQuery(query)}`);
        return response<T>({ value: [] });
      },
      getOData: <T = unknown>(
        url: string,
        key: string | number,
        query?: ODataGetQuery,
      ) => {
        requestedUrls.push(
          `${url}(${keyLiteral(key)})${encodeODataQuery(query)}`,
        );
        return response<T>({ value: [] });
      },
      replicateIdentifiers: <T = unknown>(
        url: string,
        query?: ReplicationQuery,
      ) => {
        requestedUrls.push(`${url}${encodeODataQuery(query)}`);
        return response<T>({ value: [] });
      },
      paginateOData: (url: string) => {
        requestedUrls.push(url);
        return Effect.succeed([]);
      },
    };

    yield* effect.pipe(Effect.provideService(DdfHttp, http));
    assert.equal(requestedUrls.length, 1);
    return requestedUrls[0];
  });

const leadInput: LeadInput = {
  Culture: "en-CA",
  MemberKey: "member-1",
  ListingKey: "listing-1",
  SenderName: "Jane Buyer",
  SenderEmailAddress: "jane@example.com",
  SenderPhoneNumber: 4165551234,
  PreferredMethodContact: "email",
  SenderPhoneExtension: null,
  Message: "I would like to know more about this listing.",
};

const leadBody =
  '{"Culture":"en-CA","MemberKey":"member-1","ListingKey":"listing-1","SenderName":"Jane Buyer","SenderEmailAddress":"jane@example.com","SenderPhoneNumber":4165551234,"PreferredMethodContact":"email","SenderPhoneExtension":null,"Message":"I would like to know more about this listing."}';

// @ts-expect-error DestinationId is numeric; callers should coerce route/env strings before calling.
const getDestinationRejectsStringIds = () => getDestination("123");
void getDestinationRejectsStringIds;

const officeRecord = {
  "@odata.context": "https://ddf.test/$metadata#Office/$entity",
  OfficeKey: "office-1",
  OfficeMlsId: "OFF-1",
  OfficeAORKey: "AOR-1",
  OfficeNationalAssociationId: "ORG-1",
  FranchiseNationalAssociationId: null,
  OfficeBrokerNationalAssociationId: null,
  OfficeAddress1: "123 Main St",
  OfficeAddress2: null,
  OfficeCity: "Toronto",
  OfficeFax: null,
  OfficeName: "Example Brokerage",
  OfficePhone: "416-555-0100",
  OfficePhoneExt: null,
  OfficePostalCode: "M5V 1A1",
  Media: [],
  OfficeSocialMedia: [
    {
      SocialMediaKey: "social-1",
      ResourceRecordKey: "office-1",
      SocialMediaType: "Website",
      ModificationTimestamp: "2024-01-20T00:00:00.000Z",
      ResourceName: "Office",
      SocialMediaUrlOrId: "https://example.test",
    },
  ],
  ModificationTimestamp: "2024-01-25T00:00:00.000Z",
  OriginalEntryTimestamp: "2024-01-01T00:00:00.000Z",
  OfficeType: "Firm",
  OfficeStateOrProvince: "Ontario",
  OfficeAOR: "Toronto",
  OfficeStatus: "Active",
  OfficeCountry: "Canada",
};

describe("odata resource paths", () => {
  it.effect("requests list endpoints with encoded query options", () =>
    Effect.gen(function* () {
      assert.equal(
        yield* requestedUrlFor(
          listProperties({ select: ["ListingKey"], top: 2 }),
        ),
        "/odata/v1/Property?%24select=ListingKey&%24top=2&%24orderby=ModificationTimestamp%20desc%2CListingKey%20asc",
      );
      assert.equal(
        yield* requestedUrlFor(listMembers()),
        "/odata/v1/Member?%24orderby=ModificationTimestamp%20desc%2CMemberKey%20asc",
      );
      assert.equal(
        yield* requestedUrlFor(listOffices()),
        "/odata/v1/Office?%24orderby=ModificationTimestamp%20desc%2COfficeKey%20asc",
      );
      assert.equal(
        yield* requestedUrlFor(listOpenHouses()),
        "/odata/v1/OpenHouse?%24orderby=OpenHouseDate%20desc%2COpenHouseKey%20asc",
      );
      assert.equal(
        yield* requestedUrlFor(listDestinations()),
        "/odata/v1/Destination?%24orderby=DestinationId%20asc",
      );
    }),
  );

  it.effect("requests keyed endpoints and escapes string keys", () =>
    Effect.gen(function* () {
      assert.equal(
        yield* requestedUrlFor(
          getProperty("abc'123", { select: ["ListingKey"] }),
        ),
        "/odata/v1/Property('abc''123')?%24select=ListingKey",
      );
      assert.equal(
        yield* requestedUrlFor(getMember("member-1")),
        "/odata/v1/Member('member-1')",
      );
      assert.equal(
        yield* requestedUrlFor(getOffice("office-1")),
        "/odata/v1/Office('office-1')",
      );
      assert.equal(
        yield* requestedUrlFor(getOpenHouse("open-house-1")),
        "/odata/v1/OpenHouse('open-house-1')",
      );
      assert.equal(
        yield* requestedUrlFor(getDestination(123)),
        "/odata/v1/Destination(123)",
      );
    }),
  );
});

describe("selected resource decoding", () => {
  it.effect(
    "decodes selected property, member, and office list rows as partial resources",
    () =>
      Effect.gen(function* () {
        const httpHandler = httpHandlerFrom((input) => {
          const url = String(input);
          if (url === "https://identity.test/connect/token")
            return tokenResponse.clone();

          if (
            url ===
            "https://ddf.test/odata/v1/Property?%24select=ListingKey%2CModificationTimestamp%2CAvailabilityDate%2CLotFeatures%2CAppliances%2CHeating%2CCooling&%24top=1&%24orderby=ModificationTimestamp%20desc%2CListingKey%20asc"
          ) {
            return Response.json({
              value: [
                {
                  ListingKey: "listing-1",
                  ModificationTimestamp: "2024-01-25T00:00:00.000Z",
                  AvailabilityDate: "2025-03-10",
                  LotFeatures: ["Generator"],
                  Appliances: ["Range - Induction"],
                  Heating: ["Geothermal"],
                  Cooling: ["Geothermal"],
                },
              ],
            });
          }
          if (
            url ===
            "https://ddf.test/odata/v1/Member?%24select=MemberKey%2CMemberDesignation&%24top=1&%24orderby=ModificationTimestamp%20desc%2CMemberKey%20asc"
          ) {
            return Response.json({
              value: [
                {
                  MemberKey: "member-1",
                  MemberDesignation: ["Real Estate Sector Governance Designation"],
                },
              ],
            });
          }
          if (
            url ===
            "https://ddf.test/odata/v1/Office?%24select=OfficeKey&%24top=1&%24orderby=ModificationTimestamp%20desc%2COfficeKey%20asc"
          ) {
            return Response.json({ value: [{ OfficeKey: "office-1" }] });
          }

          throw new Error(`Unexpected request: ${url}`);
        });

        const result = yield* Effect.gen(function* () {
          const properties = yield* listProperties({
            select: [
              "ListingKey",
              "ModificationTimestamp",
              "AvailabilityDate",
              "LotFeatures",
              "Appliances",
              "Heating",
              "Cooling",
            ],
            top: 1,
          });
          const members = yield* listMembers({
            select: ["MemberKey", "MemberDesignation"],
            top: 1,
          });
          const offices = yield* listOffices({ select: ["OfficeKey"], top: 1 });
          return { properties, members, offices };
        }).pipe(Effect.provide(layerFor(httpHandler)));

        assert.equal(result.properties.value[0]?.ListingKey, "listing-1");
        assert.deepEqual(result.properties.value[0]?.LotFeatures, ["Generator"]);
        assert.deepEqual(result.properties.value[0]?.Appliances, ["Range - Induction"]);
        assert.deepEqual(result.properties.value[0]?.Heating, ["Geothermal"]);
        assert.deepEqual(result.properties.value[0]?.Cooling, ["Geothermal"]);
        assert.equal(result.members.value[0]?.MemberKey, "member-1");
        assert.deepEqual(result.members.value[0]?.MemberDesignation, [
          "Real Estate Sector Governance Designation",
        ]);
        assert.equal(result.offices.value[0]?.OfficeKey, "office-1");
        const timestamp = result.properties.value[0]?.ModificationTimestamp;
        assert.equal(
          DateTime.isDateTime(timestamp) && DateTime.isUtc(timestamp),
          true,
        );
        const availabilityDate = result.properties.value[0]?.AvailabilityDate;
        assert.equal(availabilityDate instanceof Date, true);
        assert.equal(availabilityDate?.toISOString(), "2025-03-10T00:00:00.000Z");
      }),
  );

  it.effect(
    "decodes selected keyed resources without requiring non-selected fields",
    () =>
      Effect.gen(function* () {
        const httpHandler = httpHandlerFrom((input) => {
          const url = String(input);
          if (url === "https://identity.test/connect/token")
            return tokenResponse.clone();

          if (
            url ===
            "https://ddf.test/odata/v1/Property('property-1')?%24select=ListingKey"
          ) {
            return Response.json({
              "@odata.context": "https://ddf.test/$metadata#Property/$entity",
              ListingKey: "property-1",
            });
          }
          if (
            url ===
            "https://ddf.test/odata/v1/Member('member-1')?%24select=MemberKey"
          ) {
            return Response.json({ MemberKey: "member-1" });
          }
          if (
            url ===
            "https://ddf.test/odata/v1/Office('office-1')?%24select=OfficeKey"
          ) {
            return Response.json({ OfficeKey: "office-1" });
          }
          if (
            url ===
            "https://ddf.test/odata/v1/OpenHouse('open-house-1')?%24select=OpenHouseKey"
          ) {
            return Response.json({ OpenHouseKey: "open-house-1" });
          }
          if (
            url ===
            "https://ddf.test/odata/v1/Destination(123)?%24select=DestinationId"
          ) {
            return Response.json({ DestinationId: 123 });
          }

          throw new Error(`Unexpected request: ${url}`);
        });

        const result = yield* Effect.gen(function* () {
          const property = yield* getProperty("property-1", {
            select: ["ListingKey"],
          });
          const member = yield* getMember("member-1", {
            select: ["MemberKey"],
          });
          const office = yield* getOffice("office-1", {
            select: ["OfficeKey"],
          });
          const openHouse = yield* getOpenHouse("open-house-1", {
            select: ["OpenHouseKey"],
          });
          const destination = yield* getDestination(123, {
            select: ["DestinationId"],
          });
          return { property, member, office, openHouse, destination };
        }).pipe(Effect.provide(layerFor(httpHandler)));

        assert.equal(result.property.ListingKey, "property-1");
        assert.equal(result.member.MemberKey, "member-1");
        assert.equal(result.office.OfficeKey, "office-1");
        assert.equal(result.openHouse.OpenHouseKey, "open-house-1");
        assert.equal(result.destination.DestinationId, 123);
      }),
  );

  it.effect(
    "decodes full office list and keyed resources with Office schema",
    () =>
      Effect.gen(function* () {
        const httpHandler = httpHandlerFrom((input) => {
          const url = String(input);
          if (url === "https://identity.test/connect/token")
            return tokenResponse.clone();

          if (
            url ===
            "https://ddf.test/odata/v1/Office?%24top=1&%24orderby=ModificationTimestamp%20desc%2COfficeKey%20asc"
          ) {
            return Response.json({ value: [officeRecord] });
          }
          if (url === "https://ddf.test/odata/v1/Office('office-1')") {
            return Response.json(officeRecord);
          }

          throw new Error(`Unexpected request: ${url}`);
        });

        const result = yield* Effect.gen(function* () {
          const offices = yield* listOffices({ top: 1 });
          const office = yield* getOffice("office-1");
          return { offices, office };
        }).pipe(Effect.provide(layerFor(httpHandler)));

        assert.equal(result.offices.value[0]?.OfficeKey, "office-1");
        assert.equal(result.office.OfficeName, "Example Brokerage");
        const officeTimestamp = result.office.ModificationTimestamp;
        if (!DateTime.isDateTime(officeTimestamp) || !DateTime.isUtc(officeTimestamp)) {
          assert.fail("expected office ModificationTimestamp to decode as Effect DateTime.Utc");
        }
        assert.equal(DateTime.formatIso(officeTimestamp), "2024-01-25T00:00:00.000Z");

        const socialTimestamp = result.office.OfficeSocialMedia?.[0]?.ModificationTimestamp;
        if (!DateTime.isDateTime(socialTimestamp) || !DateTime.isUtc(socialTimestamp)) {
          assert.fail("expected office social ModificationTimestamp to decode as Effect DateTime.Utc");
        }
        assert.equal(DateTime.formatIso(socialTimestamp), "2024-01-20T00:00:00.000Z");
      }),
  );

  it.effect("decodes full Destination list and keyed resources", () =>
    Effect.gen(function* () {
      const destinationRecord = {
        "@odata.context": "https://ddf.test/$metadata#Destination/$entity",
        DestinationId: 123,
        DestinationName: "Website Feed",
        DestinationUrl: "https://example.test",
        DestinationType: "Technology Provider",
        DestinationStatus: "Active",
        MemberFirstName: "Ada",
        MemberLastName: "Lovelace",
        MemberKey: "member-1",
        OriginalEntryTimestamp: "2024-01-01T00:00:00.000Z",
        ModificationTimestamp: "2024-01-02T00:00:00.000Z",
        FullNSP: true,
      };
      const httpHandler = httpHandlerFrom((input) => {
        const url = String(input);
        if (url === "https://identity.test/connect/token")
          return tokenResponse.clone();
        if (
          url ===
          "https://ddf.test/odata/v1/Destination?%24top=1&%24orderby=DestinationId%20asc"
        )
          return Response.json({ value: [destinationRecord] });
        if (url === "https://ddf.test/odata/v1/Destination(123)")
          return Response.json(destinationRecord);
        throw new Error(`Unexpected request: ${url}`);
      });

      const result = yield* Effect.gen(function* () {
        const destinations = yield* listDestinations({ top: 1 });
        const destination = yield* getDestination(123);
        return { destinations, destination };
      }).pipe(Effect.provide(layerFor(httpHandler)));

      assert.equal(
        result.destinations.value[0]?.DestinationName,
        "Website Feed",
      );
      assert.equal(result.destination.MemberKey, "member-1");
      assert.equal(result.destination.DestinationType, "Technology Provider");
      assert.equal(result.destination.DestinationStatus, "Active");
      const destinationTimestamp = result.destination.ModificationTimestamp;
      if (!DateTime.isDateTime(destinationTimestamp) || !DateTime.isUtc(destinationTimestamp)) {
        assert.fail("expected destination ModificationTimestamp to decode as Effect DateTime.Utc");
      }
    }),
  );

  it.effect("decodes OData string enum values for Destination responses", () =>
    Effect.gen(function* () {
      const destinationRecord = {
        DestinationId: 456,
        DestinationName: "Website Feed",
        DestinationUrl: "https://example.test",
        DestinationType: "Technology Provider",
        DestinationStatus: "Active",
        MemberFirstName: "Ada",
        MemberLastName: "Lovelace",
        MemberKey: "member-1",
        OriginalEntryTimestamp: "2024-01-01T00:00:00.000Z",
        ModificationTimestamp: "2024-01-02T00:00:00.000Z",
        FullNSP: false,
      };
      const httpHandler = httpHandlerFrom((input) => {
        const url = String(input);
        if (url === "https://identity.test/connect/token")
          return tokenResponse.clone();
        if (url === "https://ddf.test/odata/v1/Destination(456)")
          return Response.json(destinationRecord);
        throw new Error(`Unexpected request: ${url}`);
      });

      const destination = yield* getDestination(456).pipe(
        Effect.provide(layerFor(httpHandler)),
      );

      assert.equal(destination.DestinationType, "Technology Provider");
      assert.equal(destination.DestinationStatus, "Active");
    }),
  );

  it.effect("decodes selected Property national association id fields", () =>
    Effect.gen(function* () {
      const httpHandler = httpHandlerFrom((input) => {
        const url = String(input);
        if (url === "https://identity.test/connect/token")
          return tokenResponse.clone();
        if (
          url ===
          "https://ddf.test/odata/v1/Property('property-1')?%24select=ListingKey%2CListAgentNationalAssociationId%2CCoListAgentNationalAssociationId%2CCoListAgentNationalAssociationId2%2CCoListAgentNationalAssociationId3%2CListOfficeNationalAssociationId%2CCoListOfficeNationalAssociationId%2CCoListOfficeNationalAssociationId2%2CCoListOfficeNationalAssociationId3"
        ) {
          return Response.json({
            ListingKey: "property-1",
            ListAgentNationalAssociationId: "agent-primary",
            CoListAgentNationalAssociationId: null,
            CoListAgentNationalAssociationId2: "agent-2",
            CoListAgentNationalAssociationId3: null,
            ListOfficeNationalAssociationId: "office-primary",
            CoListOfficeNationalAssociationId: null,
            CoListOfficeNationalAssociationId2: "office-2",
            CoListOfficeNationalAssociationId3: null,
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      const property = yield* getProperty("property-1", {
        select: [
          "ListingKey",
          "ListAgentNationalAssociationId",
          "CoListAgentNationalAssociationId",
          "CoListAgentNationalAssociationId2",
          "CoListAgentNationalAssociationId3",
          "ListOfficeNationalAssociationId",
          "CoListOfficeNationalAssociationId",
          "CoListOfficeNationalAssociationId2",
          "CoListOfficeNationalAssociationId3",
        ],
      }).pipe(Effect.provide(layerFor(httpHandler)));

      assert.equal(property.ListAgentNationalAssociationId, "agent-primary");
      assert.equal(property.CoListOfficeNationalAssociationId2, "office-2");
    }),
  );

  it.effect("rejects invalid office payloads at the resource boundary", () =>
    Effect.gen(function* () {
      const httpHandler = httpHandlerFrom((input) => {
        const url = String(input);
        if (url === "https://identity.test/connect/token")
          return tokenResponse.clone();
        if (url === "https://ddf.test/odata/v1/Office('office-1')") {
          return Response.json({
            ...officeRecord,
            Media: [{ MediaKey: "bad", ResourceName: "Listing" }],
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      yield* Effect.promise(() =>
        expect(
          Effect.runPromise(
            getOffice("office-1").pipe(Effect.provide(layerFor(httpHandler))),
          ),
        ).rejects.toThrow(/schema decoding|ResourceName/),
      );
    }),
  );
});

describe("replication resource paths", () => {
  it.effect("requests all-destination replication functions", () =>
    Effect.gen(function* () {
      assert.equal(
        yield* requestedUrlFor(replicateProperties()),
        "/odata/v1/Property/PropertyReplication?%24orderby=ModificationTimestamp%20asc%2CListingKey%20asc",
      );
      assert.equal(
        yield* requestedUrlFor(replicateMembers()),
        "/odata/v1/Member/MemberReplication?%24orderby=ModificationTimestamp%20asc%2CMemberKey%20asc",
      );
      assert.equal(
        yield* requestedUrlFor(replicateOffices()),
        "/odata/v1/Office/OfficeReplication?%24orderby=ModificationTimestamp%20asc%2COfficeKey%20asc",
      );
    }),
  );

  it.effect("requests destination-specific replication functions", () =>
    Effect.gen(function* () {
      assert.equal(
        yield* requestedUrlFor(replicatePropertiesForDestination(123)),
        "/odata/v1/Property/PropertyReplication(DestinationId=123)?%24orderby=ModificationTimestamp%20asc%2CListingKey%20asc",
      );
      assert.equal(
        yield* requestedUrlFor(replicateMembersForDestination(123)),
        "/odata/v1/Member/MemberReplication(DestinationId=123)?%24orderby=ModificationTimestamp%20asc%2CMemberKey%20asc",
      );
      assert.equal(
        yield* requestedUrlFor(replicateOfficesForDestination(123)),
        "/odata/v1/Office/OfficeReplication(DestinationId=123)?%24orderby=ModificationTimestamp%20asc%2COfficeKey%20asc",
      );
    }),
  );

  it.effect("appends replication query options after destination path", () =>
    Effect.gen(function* () {
      const url = yield* requestedUrlFor(
        replicatePropertiesForDestination(123, {
          select: ["ListingKey", "ModificationTimestamp"],
          count: true,
          filter: "ModificationTimestamp gt 2024-01-25T00:00:00.00Z",
          orderby: "ModificationTimestamp desc",
        }),
      );

      assert.equal(
        url,
        "/odata/v1/Property/PropertyReplication(DestinationId=123)?%24select=ListingKey%2CModificationTimestamp&%24count=true&%24filter=ModificationTimestamp%20gt%202024-01-25T00%3A00%3A00.00Z&%24orderby=ModificationTimestamp%20desc",
      );
    }),
  );
});

describe("lead resource", () => {
  it.effect("creates a lead without suppressing email by default", () =>
    Effect.gen(function* () {
      const requests: Array<{ url: string; init?: DdfRequestOptions }> = [];
      const response = <T>(value: unknown) => Effect.succeed(value as T);
      const http: DdfHttpApi = {
        requestJson: <T = unknown>(url: string, init?: DdfRequestOptions) => {
          requests.push({ url, init });
          return response<T>({ success: true });
        },
        listOData: <T = unknown>() => response<T>({ value: [] }),
        getOData: <T = unknown>() => response<T>({ value: [] }),
        replicateIdentifiers: <T = unknown>() => response<T>({ value: [] }),
        paginateOData: () => Effect.succeed([]),
      };

      const provided = Effect.provide(
        createLead(leadInput),
        Layer.succeed(DdfHttp)(http),
      ) as Effect.Effect<unknown, unknown, never>;
      const result = yield* provided;

      assert.deepEqual(result, { success: true });
      assert.equal(requests[0]?.url, "/v1/Lead/CreateLead");
      assert.equal(requests[0]?.init?.method, "POST");
      assert.deepEqual(requests[0]?.init?.headers, {
        "content-type": "application/json",
      });
      assert.equal(requests[0]?.init?.body, leadBody);
    }),
  );

  it.effect("creates a lead with email suppressed when requested", () =>
    Effect.gen(function* () {
      const requests: Array<{ url: string; init?: DdfRequestOptions }> = [];
      const response = <T>(value: unknown) => Effect.succeed(value as T);
      const http: DdfHttpApi = {
        requestJson: <T = unknown>(url: string, init?: DdfRequestOptions) => {
          requests.push({ url, init });
          return response<T>({ success: true });
        },
        listOData: <T = unknown>() => response<T>({ value: [] }),
        getOData: <T = unknown>() => response<T>({ value: [] }),
        replicateIdentifiers: <T = unknown>() => response<T>({ value: [] }),
        paginateOData: () => Effect.succeed([]),
      };

      const provided = Effect.provide(
        createLead(leadInput, { suppressEmail: true }),
        Layer.succeed(DdfHttp)(http),
      ) as Effect.Effect<unknown, unknown, never>;
      const result = yield* provided;

      assert.deepEqual(result, { success: true });
      assert.equal(requests[0]?.url, "/v1/Lead/CreateLead?SuppressEmail=true");
      assert.equal(requests[0]?.init?.body, leadBody);
    }),
  );

  it.effect("rejects invalid lead inputs before sending the request", () =>
    Effect.gen(function* () {
      let called = false;
      const http: DdfHttpApi = {
        requestJson: <T = unknown>() => {
          called = true;
          return Effect.succeed({ success: true } as T);
        },
        listOData: <T = unknown>() => Effect.succeed({ value: [] } as T),
        getOData: <T = unknown>() => Effect.succeed({ value: [] } as T),
        replicateIdentifiers: <T = unknown>() =>
          Effect.succeed({ value: [] } as T),
        paginateOData: () => Effect.succeed([]),
      };

      const invalid = {
        ...leadInput,
        Culture: "en-US",
        Message: "x".repeat(501),
      } as unknown as LeadInput;

      yield* Effect.promise(() =>
        expect(
          Effect.runPromise(
            createLead(invalid).pipe(
              Effect.provide(Layer.succeed(DdfHttp)(http)),
            ),
          ),
        ).rejects.toThrow(/Failed to encode DDF lead input as JSON/),
      );
      assert.equal(called, false);
    }),
  );
});
