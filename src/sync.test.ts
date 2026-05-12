import { assert, describe, it } from "@effect/vitest";
import { Data, Effect, Schema } from "effect";
import {
  DdfApiHttpError,
  DdfApiResponseSchemaDecodeError,
  DdfHttp,
} from "./client";
import type {
  DdfHttpApi,
  DdfRequestOptions,
  DdfResponseSchema,
} from "./client";
import {
  diffLocalKeysAgainstMasterList,
  getMemberMasterList,
  getOfficeMasterList,
  getPropertyMasterList,
  pruneMissingMembers,
  pruneMissingOffices,
  pruneMissingProperties,
  syncMembers,
  syncOffices,
  syncOpenHouses,
  syncProperties,
} from "./sync";

const response = <T>(value: unknown) => Effect.succeed(value as T);

class TestSinkError extends Data.TaggedError("TestSinkError")<{
  readonly reason: string;
}> {
  override get message() {
    return this.reason;
  }
}

const emptyHttp = (overrides: Partial<DdfHttpApi>): DdfHttpApi => ({
  requestJson: <T = unknown>() => response<T>({ value: [] }),
  listOData: <T = unknown>() => response<T>({ value: [] }),
  getOData: <T = unknown>() => response<T>({}),
  replicateIdentifiers: <T = unknown>() => response<T>({ value: [] }),
  paginateOData: () => Effect.succeed([]),
  ...overrides,
});

const runWithHttp = <A, E>(
  effect: Effect.Effect<A, E, DdfHttp>,
  http: DdfHttpApi,
) => effect.pipe(Effect.provideService(DdfHttp, http));

const propertyMedia = {
  MediaKey: "media-1",
  ModificationTimestamp: null,
  LongDescription: null,
  MediaURL: "https://example.test/photo.jpg",
  Order: 1,
  PreferredPhotoYN: true,
  ResourceRecordId: "record-1",
  ResourceRecordKey: null,
  ResourceName: null,
  MediaCategory: "Property Photo",
};

const propertyFor = (key: string) => ({
  ListingKey: key,
  Rooms: [{ RoomKey: `${key}-room`, ListingKey: null }],
  Media: [{ ...propertyMedia, MediaKey: `${key}-media` }],
});

describe("syncProperties", () => {
  it.effect(
    "hydrates property replication identifiers with bounded concurrency and normalized graph records",
    () =>
      Effect.gen(function* () {
        const requestedKeys: Array<string> = [];
        let active = 0;
        let maxActive = 0;
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
              return response<T>({
                value: [
                  {
                    ListingKey: "listing-1",
                    ModificationTimestamp: "2024-01-25T00:00:00.000Z",
                  },
                  {
                    ListingKey: "listing-2",
                    ModificationTimestamp: "2024-01-26T00:00:00.000Z",
                  },
                  {
                    ListingKey: "listing-3",
                    ModificationTimestamp: "2024-01-27T00:00:00.000Z",
                  },
                ],
              });
            }
            return response<T>({ value: [] });
          },
          getOData: <T = unknown>(_path: string, key: string | number) =>
            Effect.gen(function* () {
              requestedKeys.push(String(key));
              active += 1;
              maxActive = Math.max(maxActive, active);
              yield* Effect.yieldNow;
              active -= 1;
              return propertyFor(String(key)) as T;
            }),
        });

        const result = yield* runWithHttp(
          syncProperties({ concurrency: 2 }),
          http,
        );

        assert.deepEqual(requestedKeys.sort(), [
          "listing-1",
          "listing-2",
          "listing-3",
        ]);
        assert.equal(maxActive, 2);
        assert.equal(result.records.length, 3);
        assert.equal(result.records[0]?.rooms[0]?.ListingKey, "listing-1");
        assert.equal(
          result.records[0]?.media[0]?.ResourceRecordKey,
          "listing-1",
        );
        assert.equal(result.nextWatermark, "2024-01-27T00:00:00.000Z");
        assert.deepEqual(result.counts, {
          identifiers: 3,
          hydrated: 3,
          persisted: 0,
          failed: 0,
        });
      }),
  );

  it.effect(
    "persists hydrated property batches before hydrating every identifier",
    () =>
      Effect.gen(function* () {
        const events: Array<string> = [];
        const identifiers = Array.from({ length: 25 }, (_, index) => ({
          ListingKey: `listing-${index + 1}`,
          ModificationTimestamp: `2024-01-${String(index + 1).padStart(
            2,
            "0",
          )}T00:00:00.000Z`,
        }));
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
              return response<T>({ value: identifiers });
            }
            return response<T>({ value: [] });
          },
          getOData: <T = unknown>(_path: string, key: string | number) =>
            Effect.sync(() => {
              events.push(`hydrate:${String(key)}`);
              return propertyFor(String(key)) as T;
            }),
        });

        const result = yield* runWithHttp(
          syncProperties({
            concurrency: 2,
            sink: {
              upsertPropertyGraph: (graph) =>
                Effect.sync(() =>
                  events.push(`persist:${graph.property.ListingKey}`),
                ),
            },
          }),
          http,
        );

        assert.equal(result.records.length, 25);
        assert.equal(result.counts.persisted, 25);
        assert.ok(
          events.indexOf("persist:listing-1") <
            events.indexOf("hydrate:listing-21"),
        );
      }),
  );

  it.effect(
    "uses atomic property graph sink when provided",
    () =>
      Effect.gen(function* () {
        const calls: Array<string> = [];
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
              return response<T>({
                value: [
                  {
                    ListingKey: "listing-1",
                    ModificationTimestamp: "2024-01-02T00:00:00.000Z",
                  },
                ],
              });
            }
            return response<T>({ value: [] });
          },
          getOData: <T = unknown>(_path: string, key: string | number) =>
            response<T>(propertyFor(String(key))),
        });

        const result = yield* runWithHttp(
          syncProperties({
            sink: {
              upsertPropertyGraph: (graph) =>
                Effect.sync(() => calls.push(`graph:${graph.property.ListingKey}:${graph.rooms.length}:${graph.media.length}`)),
              upsertProperty: (property) =>
                Effect.sync(() => calls.push(`property:${property.ListingKey}`)),
              upsertRoom: (room) =>
                Effect.sync(() => calls.push(`room:${room.ListingKey}`)),
              upsertMedia: (media) =>
                Effect.sync(() => calls.push(`media:${media.MediaKey}`)),
            },
          }),
          http,
        );

        assert.equal(result.nextWatermark, "2024-01-02T00:00:00.000Z");
        assert.deepEqual(calls, ["graph:listing-1:1:1"]);
      }),
  );

  it.effect(
    "paginates replication next links and calls property persistence sinks",
    () =>
      Effect.gen(function* () {
        const paths: Array<string> = [];
        const calls: Array<string> = [];
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            paths.push(path);
            if (
              path ===
              "/odata/v1/Property/PropertyReplication(DestinationId=7)?%24filter=ModificationTimestamp%20gt%202024-01-01T00%3A00%3A00.000Z&%24orderby=ModificationTimestamp%20asc%2CListingKey%20asc"
            ) {
              return response<T>({
                "@odata.nextLink": "https://ddf.test/page-2",
                value: [
                  {
                    ListingKey: "listing-1",
                    ModificationTimestamp: "2024-01-02T00:00:00.000Z",
                  },
                ],
              });
            }
            if (path === "https://ddf.test/page-2") {
              return response<T>({
                value: [
                  {
                    ListingKey: "listing-2",
                    ModificationTimestamp: "2024-01-03T00:00:00.000Z",
                  },
                ],
              });
            }
            return response<T>({ value: [] });
          },
          getOData: <T = unknown>(_path: string, key: string | number) =>
            response<T>(propertyFor(String(key))),
        });

        const result = yield* runWithHttp(
          syncProperties({
            mode: "incremental",
            since: "2024-01-01T00:00:00.000Z",
            destinationId: 7,
            sink: {
              upsertProperty: (property) =>
                Effect.sync(() =>
                  calls.push(`property:${property.ListingKey}`),
                ),
              upsertRoom: (room) =>
                Effect.sync(() => calls.push(`room:${room.ListingKey}`)),
              upsertMedia: (media) =>
                Effect.sync(() =>
                  calls.push(`media:${media.ResourceRecordKey}`),
                ),
              saveWatermark: (_resource, watermark) =>
                Effect.sync(() => calls.push(`watermark:${watermark}`)),
            },
          }),
          http,
        );

        assert.deepEqual(paths, [
          "/odata/v1/Property/PropertyReplication(DestinationId=7)?%24filter=ModificationTimestamp%20gt%202024-01-01T00%3A00%3A00.000Z&%24orderby=ModificationTimestamp%20asc%2CListingKey%20asc",
          "https://ddf.test/page-2",
        ]);
        assert.equal(result.nextWatermark, "2024-01-03T00:00:00.000Z");
        assert.deepEqual(calls, [
          "property:listing-1",
          "room:listing-1",
          "media:listing-1",
          "property:listing-2",
          "room:listing-2",
          "media:listing-2",
          "watermark:2024-01-03T00:00:00.000Z",
        ]);
      }),
  );

  it.effect(
    "collects per-record hydration, schema decode, and persistence errors",
    () =>
      Effect.gen(function* () {
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
              return response<T>({
                value: [
                  {
                    ListingKey: "ok",
                    ModificationTimestamp: "2024-01-02T00:00:00.000Z",
                  },
                  {
                    ListingKey: "http-fail",
                    ModificationTimestamp: "2024-01-03T00:00:00.000Z",
                  },
                  {
                    ListingKey: "decode-fail",
                    ModificationTimestamp: "2024-01-04T00:00:00.000Z",
                  },
                ],
              });
            }
            return response<T>({ value: [] });
          },
          getOData: <T = unknown>(_path: string, key: string | number) => {
            if (key === "http-fail") {
              return Effect.fail(
                new DdfApiHttpError({
                  url: "https://ddf.test/property/http-fail",
                  status: 503,
                }),
              );
            }
            if (key === "decode-fail") {
              return Effect.fail(
                new DdfApiResponseSchemaDecodeError({
                  url: "https://ddf.test/property/decode-fail",
                  cause: new Error("invalid ListingKey"),
                }),
              );
            }
            return response<T>(propertyFor(String(key)));
          },
        });

        const result = yield* runWithHttp(
          syncProperties({
            sink: {
              upsertProperty: () =>
                Effect.fail(new TestSinkError({ reason: "sink unavailable" })),
            },
          }),
          http,
        );

        assert.equal(result.records.length, 1);
        assert.equal(result.errors.length, 3);
        assert.deepEqual(result.errors.map((error) => error.stage).sort(), [
          "hydrate",
          "hydrate",
          "persist",
        ]);
        assert.match(
          result.errors.map((error) => error.message).join("\n"),
          /schema decoding|invalid ListingKey/i,
        );
        assert.equal(result.nextWatermark, null);
      }),
  );

  it.effect("does not save a property watermark past a hydration failure", () =>
    Effect.gen(function* () {
      const savedWatermarks: Array<string> = [];
      const http = emptyHttp({
        requestJson: <T = unknown>(path: string) => {
          if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
            return response<T>({
              value: [
                {
                  ListingKey: "before-fail",
                  ModificationTimestamp: "2024-05-01T00:00:00.000Z",
                },
                {
                  ListingKey: "hydrate-fail",
                  ModificationTimestamp: "2024-05-02T00:00:00.000Z",
                },
                {
                  ListingKey: "after-fail",
                  ModificationTimestamp: "2024-05-03T00:00:00.000Z",
                },
              ],
            });
          }
          return response<T>({ value: [] });
        },
        getOData: <T = unknown>(_path: string, key: string | number) => {
          if (key === "hydrate-fail") {
            return Effect.fail(
              new DdfApiHttpError({
                url: "https://ddf.test/property/hydrate-fail",
                status: 503,
              }),
            );
          }
          return response<T>(propertyFor(String(key)));
        },
      });

      const result = yield* runWithHttp(
        syncProperties({
          sink: {
            saveWatermark: (_resource, watermark) =>
              Effect.sync(() => savedWatermarks.push(watermark)),
          },
        }),
        http,
      );

      assert.equal(result.records.length, 2);
      assert.equal(result.errors.length, 1);
      assert.equal(result.nextWatermark, "2024-05-01T00:00:00.000Z");
      assert.deepEqual(savedWatermarks, ["2024-05-01T00:00:00.000Z"]);
    }),
  );

  it.effect(
    "does not save a property watermark past a persistence failure",
    () =>
      Effect.gen(function* () {
        const savedWatermarks: Array<string> = [];
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
              return response<T>({
                value: [
                  {
                    ListingKey: "persist-ok-before",
                    ModificationTimestamp: "2024-06-01T00:00:00.000Z",
                  },
                  {
                    ListingKey: "persist-fail",
                    ModificationTimestamp: "2024-06-02T00:00:00.000Z",
                  },
                  {
                    ListingKey: "persist-ok-after",
                    ModificationTimestamp: "2024-06-03T00:00:00.000Z",
                  },
                ],
              });
            }
            return response<T>({ value: [] });
          },
          getOData: <T = unknown>(_path: string, key: string | number) =>
            response<T>(propertyFor(String(key))),
        });

        const result = yield* runWithHttp(
          syncProperties({
            sink: {
              upsertProperty: (property) =>
                property.ListingKey === "persist-fail"
                  ? Effect.fail(
                      new TestSinkError({ reason: "property sink failed" }),
                    )
                  : Effect.void,
              saveWatermark: (_resource, watermark) =>
                Effect.sync(() => savedWatermarks.push(watermark)),
            },
          }),
          http,
        );

        assert.equal(result.records.length, 3);
        assert.equal(result.errors.length, 1);
        assert.equal(result.nextWatermark, "2024-06-01T00:00:00.000Z");
        assert.equal(result.counts.persisted, 2);
        assert.deepEqual(savedWatermarks, ["2024-06-01T00:00:00.000Z"]);
      }),
  );

  it.effect(
    "counts record persistence independently from watermark persistence",
    () =>
      Effect.gen(function* () {
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
              return response<T>({
                value: [
                  {
                    ListingKey: "listing-1",
                    ModificationTimestamp: "2024-10-01T00:00:00.000Z",
                  },
                ],
              });
            }
            return response<T>({ value: [] });
          },
          getOData: <T = unknown>(_path: string, key: string | number) =>
            response<T>(propertyFor(String(key))),
        });

        const result = yield* runWithHttp(
          syncProperties({
            sink: {
              upsertProperty: () => Effect.void,
              saveWatermark: () =>
                Effect.fail(new TestSinkError({ reason: "watermark failed" })),
            },
          }),
          http,
        );

        assert.equal(result.records.length, 1);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0]?.key, "watermark");
        assert.deepEqual(result.counts, {
          identifiers: 1,
          hydrated: 1,
          persisted: 1,
          failed: 1,
        });
      }),
  );
});

describe("syncMembers and syncOffices", () => {
  it.effect(
    "syncs member and office identifiers through hydration and sinks",
    () =>
      Effect.gen(function* () {
        const calls: Array<string> = [];
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            if (path.startsWith("/odata/v1/Member/MemberReplication")) {
              return response<T>({
                value: [
                  {
                    MemberKey: "member-1",
                    ModificationTimestamp: "2024-02-01T00:00:00.000Z",
                  },
                ],
              });
            }
            if (path.startsWith("/odata/v1/Office/OfficeReplication")) {
              return response<T>({
                value: [
                  {
                    OfficeKey: "office-1",
                    ModificationTimestamp: "2024-03-01T00:00:00.000Z",
                  },
                ],
              });
            }
            return response<T>({ value: [] });
          },
          getOData: <T = unknown>(path: string, key: string | number) => {
            if (path === "/odata/v1/Member")
              return response<T>({ MemberKey: key, Media: [] });
            return response<T>({ OfficeKey: key, Media: [] });
          },
        });

        const members = yield* runWithHttp(
          syncMembers({
            sink: {
              upsertMember: (member) =>
                Effect.sync(() => calls.push(`member:${member.MemberKey}`)),
              saveWatermark: (_resource, watermark) =>
                Effect.sync(() => calls.push(`member-watermark:${watermark}`)),
            },
          }),
          http,
        );
        const offices = yield* runWithHttp(
          syncOffices({
            sink: {
              upsertOffice: (office) =>
                Effect.sync(() =>
                  calls.push(
                    `office:${(office as { OfficeKey: string }).OfficeKey}`,
                  ),
                ),
              saveWatermark: (_resource, watermark) =>
                Effect.sync(() => calls.push(`office-watermark:${watermark}`)),
            },
          }),
          http,
        );

        assert.equal(members.nextWatermark, "2024-02-01T00:00:00.000Z");
        assert.equal(offices.nextWatermark, "2024-03-01T00:00:00.000Z");
        assert.deepEqual(calls, [
          "member:member-1",
          "member-watermark:2024-02-01T00:00:00.000Z",
          "office:office-1",
          "office-watermark:2024-03-01T00:00:00.000Z",
        ]);
      }),
  );

  it.effect("keeps member and office watermarks before failed records", () =>
    Effect.gen(function* () {
      const calls: Array<string> = [];
      const http = emptyHttp({
        requestJson: <T = unknown>(path: string) => {
          if (path.startsWith("/odata/v1/Member/MemberReplication")) {
            return response<T>({
              value: [
                {
                  MemberKey: "member-before",
                  ModificationTimestamp: "2024-07-01T00:00:00.000Z",
                },
                {
                  MemberKey: "member-fail",
                  ModificationTimestamp: "2024-07-02T00:00:00.000Z",
                },
                {
                  MemberKey: "member-after",
                  ModificationTimestamp: "2024-07-03T00:00:00.000Z",
                },
              ],
            });
          }
          if (path.startsWith("/odata/v1/Office/OfficeReplication")) {
            return response<T>({
              value: [
                {
                  OfficeKey: "office-before",
                  ModificationTimestamp: "2024-08-01T00:00:00.000Z",
                },
                {
                  OfficeKey: "office-fail",
                  ModificationTimestamp: "2024-08-02T00:00:00.000Z",
                },
                {
                  OfficeKey: "office-after",
                  ModificationTimestamp: "2024-08-03T00:00:00.000Z",
                },
              ],
            });
          }
          return response<T>({ value: [] });
        },
        getOData: <T = unknown>(path: string, key: string | number) => {
          if (key === "member-fail") {
            return Effect.fail(
              new DdfApiHttpError({
                url: "https://ddf.test/member/member-fail",
                status: 503,
              }),
            );
          }
          if (path === "/odata/v1/Member")
            return response<T>({ MemberKey: key, Media: [] });
          return response<T>({ OfficeKey: key, Media: [] });
        },
      });

      const members = yield* runWithHttp(
        syncMembers({
          sink: {
            saveWatermark: (_resource, watermark) =>
              Effect.sync(() => calls.push(`member-watermark:${watermark}`)),
          },
        }),
        http,
      );
      const offices = yield* runWithHttp(
        syncOffices({
          sink: {
            upsertOffice: (office) =>
              (office as { OfficeKey: string }).OfficeKey === "office-fail"
                ? Effect.fail(
                    new TestSinkError({ reason: "office sink failed" }),
                  )
                : Effect.void,
            saveWatermark: (_resource, watermark) =>
              Effect.sync(() => calls.push(`office-watermark:${watermark}`)),
          },
        }),
        http,
      );

      assert.equal(members.nextWatermark, "2024-07-01T00:00:00.000Z");
      assert.equal(offices.nextWatermark, "2024-08-01T00:00:00.000Z");
      assert.deepEqual(calls, [
        "member-watermark:2024-07-01T00:00:00.000Z",
        "office-watermark:2024-08-01T00:00:00.000Z",
      ]);
    }),
  );

  it.effect(
    "keeps nextLink replication page failures structured and does not advance watermarks",
    () =>
      Effect.gen(function* () {
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
              return response<T>({
                "@odata.nextLink": "https://ddf.test/property-page-2",
                value: [
                  {
                    ListingKey: "property-1",
                    ModificationTimestamp: "2024-09-01T00:00:00.000Z",
                  },
                ],
              });
            }
            if (path.startsWith("/odata/v1/Member/MemberReplication")) {
              return response<T>({
                "@odata.nextLink": "https://ddf.test/member-page-2",
                value: [
                  {
                    MemberKey: "member-1",
                    ModificationTimestamp: "2024-09-01T00:00:00.000Z",
                  },
                ],
              });
            }
            if (path.startsWith("/odata/v1/Office/OfficeReplication")) {
              return response<T>({
                "@odata.nextLink": "https://ddf.test/office-page-2",
                value: [
                  {
                    OfficeKey: "office-1",
                    ModificationTimestamp: "2024-09-01T00:00:00.000Z",
                  },
                ],
              });
            }
            if (path.includes("page-2")) {
              return Effect.fail(
                new DdfApiHttpError({
                  url: path,
                  status: 503,
                }),
              );
            }
            return response<T>({ value: [] });
          },
          getOData: <T = unknown>(path: string, key: string | number) => {
            if (path === "/odata/v1/Property")
              return response<T>(propertyFor(String(key)));
            if (path === "/odata/v1/Member")
              return response<T>({ MemberKey: key, Media: [] });
            return response<T>({ OfficeKey: key, Media: [] });
          },
        });

        const property = yield* runWithHttp(syncProperties(), http);
        const member = yield* runWithHttp(syncMembers(), http);
        const office = yield* runWithHttp(syncOffices(), http);

        assert.equal(property.counts.identifiers, 1);
        assert.equal(member.counts.identifiers, 1);
        assert.equal(office.counts.identifiers, 1);
        assert.equal(property.nextWatermark, null);
        assert.equal(member.nextWatermark, null);
        assert.equal(office.nextWatermark, null);
        assert.equal(
          property.errors[0]?.key,
          "page:https://ddf.test/property-page-2",
        );
        assert.equal(
          member.errors[0]?.key,
          "page:https://ddf.test/member-page-2",
        );
        assert.equal(
          office.errors[0]?.key,
          "page:https://ddf.test/office-page-2",
        );
      }),
  );
});

describe("syncOpenHouses", () => {
  it.effect(
    "uses list pagination with caller query options and sink calls",
    () =>
      Effect.gen(function* () {
        const paths: Array<string> = [];
        const calls: Array<string> = [];
        const http = emptyHttp({
          listOData: <T = unknown>(
            path: string,
            query?: {
              readonly filter?: string;
              readonly orderby?: string | ReadonlyArray<string>;
            },
          ) => {
            paths.push(
              `${path}:${query?.filter ?? ""}:${query?.orderby ?? ""}`,
            );
            return response<T>({
              "@odata.nextLink": "https://ddf.test/openhouse-page-2",
              value: [
                {
                  OpenHouseKey: "open-1",
                  ListingKey: "listing-1",
                  OpenHouseDate: "2024-04-01T00:00:00.000Z",
                },
              ],
            });
          },
          requestJson: <T = unknown>(path: string) => {
            paths.push(path);
            return response<T>({
              value: [
                {
                  OpenHouseKey: "open-2",
                  ListingKey: "listing-2",
                  OpenHouseDate: "2024-04-03T00:00:00.000Z",
                },
              ],
            });
          },
        });

        const result = yield* runWithHttp(
          syncOpenHouses({
            query: {
              filter: "OpenHouseStatus eq 'Active'",
              orderby: "OpenHouseDate asc",
              top: 2,
            },
            sink: {
              upsertOpenHouse: (openHouse) =>
                Effect.sync(() => calls.push(`open:${openHouse.OpenHouseKey}`)),
              saveWatermark: (_resource, watermark) =>
                Effect.sync(() => calls.push(`watermark:${watermark}`)),
            },
          }),
          http,
        );

        assert.deepEqual(paths, [
          "/odata/v1/OpenHouse:OpenHouseStatus eq 'Active':OpenHouseDate asc",
          "https://ddf.test/openhouse-page-2",
        ]);
        assert.equal(result.records.length, 2);
        assert.deepEqual(result.counts, {
          identifiers: 0,
          hydrated: 2,
          persisted: 2,
          failed: 0,
        });
        assert.equal(result.nextWatermark, "2024-04-03T00:00:00.000Z");
        assert.deepEqual(calls, [
          "open:open-1",
          "open:open-2",
          "watermark:2024-04-03T00:00:00.000Z",
        ]);
      }),
  );

  it.effect(
    "does not save an OpenHouse watermark past a persistence failure",
    () =>
      Effect.gen(function* () {
        const calls: Array<string> = [];
        const http = emptyHttp({
          listOData: <T = unknown>() =>
            response<T>({
              value: [
                {
                  OpenHouseKey: "open-before",
                  OpenHouseDate: "2024-09-01T00:00:00.000Z",
                },
                {
                  OpenHouseKey: "open-fail",
                  OpenHouseDate: "2024-09-02T00:00:00.000Z",
                },
                {
                  OpenHouseKey: "open-after",
                  OpenHouseDate: "2024-09-03T00:00:00.000Z",
                },
              ],
            }),
        });

        const result = yield* runWithHttp(
          syncOpenHouses({
            sink: {
              upsertOpenHouse: (openHouse) =>
                openHouse.OpenHouseKey === "open-fail"
                  ? Effect.fail(
                      new TestSinkError({ reason: "open house sink failed" }),
                    )
                  : Effect.void,
              saveWatermark: (_resource, watermark) =>
                Effect.sync(() => calls.push(`watermark:${watermark}`)),
            },
          }),
          http,
        );

        assert.equal(result.nextWatermark, "2024-09-01T00:00:00.000Z");
        assert.deepEqual(calls, ["watermark:2024-09-01T00:00:00.000Z"]);
      }),
  );

  it.effect(
    "collects OpenHouse page schema failures as structured sync errors",
    () =>
      Effect.gen(function* () {
        const http = emptyHttp({
          listOData: <T = unknown>(
            _path: string,
            _query?: unknown,
            schema?: DdfResponseSchema<T>,
          ) => {
            const payload = {
              value: [{ OpenHouseKey: 123, OpenHouseDate: "not-a-date" }],
            };
            return schema !== undefined
              ? (Schema.decodeUnknownEffect(schema)(payload) as Effect.Effect<
                  T,
                  never
                >)
              : response<T>(payload);
          },
        });

        const result = yield* runWithHttp(syncOpenHouses(), http);

        assert.equal(result.records.length, 0);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0]?.resource, "OpenHouse");
        assert.equal(result.errors[0]?.key, "page:first");
        assert.equal(result.errors[0]?.stage, "hydrate");
        assert.match(
          result.errors[0]?.message ?? "",
          /OpenHouseKey|OpenHouseDate/,
        );
        assert.deepEqual(result.counts, {
          identifiers: 0,
          hydrated: 0,
          persisted: 0,
          failed: 1,
        });
      }),
  );

  it.effect(
    "collects OpenHouse nextLink failures without dropping previous page records or advancing watermarks",
    () =>
      Effect.gen(function* () {
        const calls: Array<string> = [];
        const http = emptyHttp({
          listOData: <T = unknown>() =>
            response<T>({
              "@odata.nextLink": "https://ddf.test/openhouse-bad-page",
              value: [
                {
                  OpenHouseKey: "open-1",
                  OpenHouseDate: "2024-11-01T00:00:00.000Z",
                },
              ],
            }),
          requestJson: <T = unknown>(
            _path: string,
            _init?: DdfRequestOptions,
            schema?: DdfResponseSchema<T>,
          ) => {
            const payload = { value: [{ OpenHouseKey: 456 }] };
            return schema !== undefined
              ? (Schema.decodeUnknownEffect(schema)(payload) as Effect.Effect<
                  T,
                  never
                >)
              : response<T>(payload);
          },
        });

        const result = yield* runWithHttp(
          syncOpenHouses({
            sink: {
              saveWatermark: (_resource, watermark) =>
                Effect.sync(() => calls.push(`watermark:${watermark}`)),
            },
          }),
          http,
        );

        assert.deepEqual(
          result.records.map((record) => record.OpenHouseKey),
          ["open-1"],
        );
        assert.equal(result.errors.length, 1);
        assert.equal(
          result.errors[0]?.key,
          "page:https://ddf.test/openhouse-bad-page",
        );
        assert.equal(result.counts.hydrated, 1);
        assert.equal(result.counts.failed, 1);
        assert.equal(result.nextWatermark, null);
        assert.deepEqual(calls, []);
      }),
  );

  it.effect(
    "decodes selected OpenHouse nextLink pages with the selected schema",
    () =>
      Effect.gen(function* () {
        const paths: Array<string> = [];
        const http = emptyHttp({
          listOData: <T = unknown>(path: string) => {
            paths.push(path);
            return response<T>({
              "@odata.nextLink": "https://ddf.test/openhouse-selected-page-2",
              value: [{ OpenHouseKey: "open-selected-1" }],
            });
          },
          requestJson: <T = unknown>(
            path: string,
            _init?: DdfRequestOptions,
            schema?: DdfResponseSchema<T>,
          ) => {
            paths.push(path);
            const payload = { value: [{ OpenHouseKey: "open-selected-2" }] };
            return schema !== undefined
              ? (Schema.decodeUnknownEffect(schema)(payload) as Effect.Effect<
                  T,
                  never
                >)
              : response<T>(payload);
          },
        });

        const result = yield* runWithHttp(
          syncOpenHouses({ query: { select: ["OpenHouseKey"] } }),
          http,
        );

        assert.deepEqual(paths, [
          "/odata/v1/OpenHouse",
          "https://ddf.test/openhouse-selected-page-2",
        ]);
        assert.deepEqual(
          result.records.map((record) => record.OpenHouseKey),
          ["open-selected-1", "open-selected-2"],
        );
      }),
  );
});

describe("master list prune helpers", () => {
  it("diffs local keys against master replication lists", () => {
    assert.deepEqual(diffLocalKeysAgainstMasterList(["a", "b"], ["b", "c"]), {
      localKeys: ["a", "b"],
      masterKeys: ["b", "c"],
      missingLocalKeys: ["a"],
      newMasterKeys: ["c"],
    });
  });

  it.effect(
    "gets property master lists and calls prune sinks without owning a database",
    () =>
      Effect.gen(function* () {
        const marked: Array<ReadonlyArray<string>> = [];
        const http = emptyHttp({
          requestJson: <T = unknown>(path: string) => {
            if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
              return response<T>({
                value: [{ ListingKey: "master-1" }, { ListingKey: "master-2" }],
              });
            }
            return response<T>({ value: [] });
          },
        });

        const master = yield* runWithHttp(getPropertyMasterList(), http);
        const diff = yield* runWithHttp(
          pruneMissingProperties(["master-1", "stale-1"], {
            sink: {
              markMissingPropertiesInactive: (keys) =>
                Effect.sync(() => marked.push(keys)),
            },
          }),
          http,
        );

        assert.deepEqual(
          master.map((identifier) => identifier.ListingKey),
          ["master-1", "master-2"],
        );
        assert.deepEqual(diff.missingLocalKeys, ["stale-1"]);
        assert.deepEqual(marked, [["stale-1"]]);
      }),
  );

  it.effect("gets member and office master lists and calls prune sinks", () =>
    Effect.gen(function* () {
      const markedMembers: Array<ReadonlyArray<string>> = [];
      const markedOffices: Array<ReadonlyArray<string>> = [];
      const http = emptyHttp({
        requestJson: <T = unknown>(path: string) => {
          if (path.startsWith("/odata/v1/Member/MemberReplication")) {
            return response<T>({
              value: [{ MemberKey: "member-1" }, { MemberKey: "member-2" }],
            });
          }
          if (path.startsWith("/odata/v1/Office/OfficeReplication")) {
            return response<T>({
              value: [{ OfficeKey: "office-1" }, { OfficeKey: "office-2" }],
            });
          }
          return response<T>({ value: [] });
        },
      });

      const members = yield* runWithHttp(getMemberMasterList(), http);
      const offices = yield* runWithHttp(getOfficeMasterList(), http);
      const memberDiff = yield* runWithHttp(
        pruneMissingMembers(["member-1", "stale-member"], {
          sink: {
            markMissingMembersInactive: (keys) =>
              Effect.sync(() => markedMembers.push(keys)),
          },
        }),
        http,
      );
      const officeDiff = yield* runWithHttp(
        pruneMissingOffices(["office-1", "stale-office"], {
          sink: {
            markMissingOfficesInactive: (keys) =>
              Effect.sync(() => markedOffices.push(keys)),
          },
        }),
        http,
      );

      assert.deepEqual(
        members.map((identifier) => identifier.MemberKey),
        ["member-1", "member-2"],
      );
      assert.deepEqual(
        offices.map((identifier) => identifier.OfficeKey),
        ["office-1", "office-2"],
      );
      assert.deepEqual(memberDiff.missingLocalKeys, ["stale-member"]);
      assert.deepEqual(officeDiff.missingLocalKeys, ["stale-office"]);
      assert.deepEqual(markedMembers, [["stale-member"]]);
      assert.deepEqual(markedOffices, [["stale-office"]]);
    }),
  );
});
