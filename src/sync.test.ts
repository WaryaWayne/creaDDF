import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Data, Effect, Layer } from "effect";
import { DdfApiHttpError, DdfApiResponseSchemaDecodeError, DdfHttp } from "./client";
import type { DdfHttpApi } from "./client";
import {
  diffLocalKeysAgainstMasterList,
  getPropertyMasterList,
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

const runWithHttp = <A, E>(effect: Effect.Effect<A, E, DdfHttpApi>, http: DdfHttpApi) =>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.succeed(DdfHttp)(http))));

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
  it("hydrates property replication identifiers with bounded concurrency and normalized graph records", async () => {
    const requestedKeys: Array<string> = [];
    let active = 0;
    let maxActive = 0;
    const http = emptyHttp({
      requestJson: <T = unknown>(path: string) => {
        if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
          return response<T>({
            value: [
              { ListingKey: "listing-1", ModificationTimestamp: "2024-01-25T00:00:00.000Z" },
              { ListingKey: "listing-2", ModificationTimestamp: "2024-01-26T00:00:00.000Z" },
              { ListingKey: "listing-3", ModificationTimestamp: "2024-01-27T00:00:00.000Z" },
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
          yield* Effect.sleep(10);
          active -= 1;
          return propertyFor(String(key)) as T;
        }),
    });

    const result = await runWithHttp(syncProperties({ concurrency: 2 }), http);

    assert.deepEqual(requestedKeys.sort(), ["listing-1", "listing-2", "listing-3"]);
    assert.equal(maxActive, 2);
    assert.equal(result.records.length, 3);
    assert.equal(result.records[0]?.rooms[0]?.ListingKey, "listing-1");
    assert.equal(result.records[0]?.media[0]?.ResourceRecordKey, "listing-1");
    assert.equal(result.nextWatermark, "2024-01-27T00:00:00.000Z");
    assert.deepEqual(result.counts, {
      identifiers: 3,
      hydrated: 3,
      persisted: 3,
      failed: 0,
    });
  });

  it("paginates replication next links and calls property persistence sinks", async () => {
    const paths: Array<string> = [];
    const calls: Array<string> = [];
    const http = emptyHttp({
      requestJson: <T = unknown>(path: string) => {
        paths.push(path);
        if (path === "/odata/v1/Property/PropertyReplication(DestinationId=7)?%24filter=ModificationTimestamp+gt+2024-01-01T00%3A00%3A00.000Z") {
          return response<T>({
            "@odata.nextLink": "https://ddf.test/page-2",
            value: [{ ListingKey: "listing-1", ModificationTimestamp: "2024-01-02T00:00:00.000Z" }],
          });
        }
        if (path === "https://ddf.test/page-2") {
          return response<T>({
            value: [{ ListingKey: "listing-2", ModificationTimestamp: "2024-01-03T00:00:00.000Z" }],
          });
        }
        return response<T>({ value: [] });
      },
      getOData: <T = unknown>(_path: string, key: string | number) =>
        response<T>(propertyFor(String(key))),
    });

    const result = await runWithHttp(
      syncProperties({
        mode: "incremental",
        since: "2024-01-01T00:00:00.000Z",
        destinationId: 7,
        sink: {
          upsertProperty: (property) => Effect.sync(() => calls.push(`property:${property.ListingKey}`)),
          upsertRoom: (room) => Effect.sync(() => calls.push(`room:${room.ListingKey}`)),
          upsertMedia: (media) => Effect.sync(() => calls.push(`media:${media.ResourceRecordKey}`)),
          saveWatermark: (_resource, watermark) => Effect.sync(() => calls.push(`watermark:${watermark}`)),
        },
      }),
      http,
    );

    assert.deepEqual(paths, [
      "/odata/v1/Property/PropertyReplication(DestinationId=7)?%24filter=ModificationTimestamp+gt+2024-01-01T00%3A00%3A00.000Z",
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
  });

  it("collects per-record hydration, schema decode, and persistence errors", async () => {
    const http = emptyHttp({
      requestJson: <T = unknown>(path: string) => {
        if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
          return response<T>({
            value: [
              { ListingKey: "ok", ModificationTimestamp: "2024-01-02T00:00:00.000Z" },
              { ListingKey: "http-fail", ModificationTimestamp: "2024-01-03T00:00:00.000Z" },
              { ListingKey: "decode-fail", ModificationTimestamp: "2024-01-04T00:00:00.000Z" },
            ],
          });
        }
        return response<T>({ value: [] });
      },
      getOData: <T = unknown>(_path: string, key: string | number) => {
        if (key === "http-fail") {
          return Effect.fail(new DdfApiHttpError({
            url: "https://ddf.test/property/http-fail",
            status: 503,
            statusText: "Service Unavailable",
          }));
        }
        if (key === "decode-fail") {
          return Effect.fail(new DdfApiResponseSchemaDecodeError({
            url: "https://ddf.test/property/decode-fail",
            cause: new Error("invalid ListingKey"),
          }));
        }
        return response<T>(propertyFor(String(key)));
      },
    });

    const result = await runWithHttp(
      syncProperties({
        sink: {
          upsertProperty: () => Effect.fail(new TestSinkError({ reason: "sink unavailable" })),
        },
      }),
      http,
    );

    assert.equal(result.records.length, 1);
    assert.equal(result.errors.length, 3);
    assert.deepEqual(result.errors.map((error) => error.stage).sort(), ["hydrate", "hydrate", "persist"]);
    assert.match(result.errors.map((error) => error.message).join("\n"), /schema decoding|invalid ListingKey/i);
    assert.equal(result.nextWatermark, "2024-01-04T00:00:00.000Z");
  });
});

describe("syncMembers and syncOffices", () => {
  it("syncs member and office identifiers through hydration and sinks", async () => {
    const calls: Array<string> = [];
    const http = emptyHttp({
      requestJson: <T = unknown>(path: string) => {
        if (path.startsWith("/odata/v1/Member/MemberReplication")) {
          return response<T>({ value: [{ MemberKey: "member-1", ModificationTimestamp: "2024-02-01T00:00:00.000Z" }] });
        }
        if (path.startsWith("/odata/v1/Office/OfficeReplication")) {
          return response<T>({ value: [{ OfficeKey: "office-1", ModificationTimestamp: "2024-03-01T00:00:00.000Z" }] });
        }
        return response<T>({ value: [] });
      },
      getOData: <T = unknown>(path: string, key: string | number) => {
        if (path === "/odata/v1/Member") return response<T>({ MemberKey: key, Media: [] });
        return response<T>({ OfficeKey: key, Media: [] });
      },
    });

    const members = await runWithHttp(
      syncMembers({ sink: { upsertMember: (member) => Effect.sync(() => calls.push(`member:${member.MemberKey}`)) } }),
      http,
    );
    const offices = await runWithHttp(
      syncOffices({ sink: { upsertOffice: (office) => Effect.sync(() => calls.push(`office:${(office as { OfficeKey: string }).OfficeKey}`)) } }),
      http,
    );

    assert.equal(members.nextWatermark, "2024-02-01T00:00:00.000Z");
    assert.equal(offices.nextWatermark, "2024-03-01T00:00:00.000Z");
    assert.deepEqual(calls, ["member:member-1", "office:office-1"]);
  });
});

describe("syncOpenHouses", () => {
  it("uses list pagination with caller query options and sink calls", async () => {
    const paths: Array<string> = [];
    const calls: Array<string> = [];
    const http = emptyHttp({
      listOData: <T = unknown>(path: string, query?: { readonly filter?: string; readonly orderby?: string | ReadonlyArray<string> }) => {
        paths.push(`${path}:${query?.filter ?? ""}:${query?.orderby ?? ""}`);
        return response<T>({
          "@odata.nextLink": "https://ddf.test/openhouse-page-2",
          value: [{ OpenHouseKey: "open-1", ListingKey: "listing-1", OpenHouseDate: "2024-04-01T00:00:00.000Z" }],
        });
      },
      requestJson: <T = unknown>(path: string) => {
        paths.push(path);
        return response<T>({
          value: [{ OpenHouseKey: "open-2", ListingKey: "listing-2", OpenHouseDate: "2024-04-03T00:00:00.000Z" }],
        });
      },
    });

    const result = await runWithHttp(
      syncOpenHouses({
        query: { filter: "OpenHouseStatus eq 'Active'", orderby: "OpenHouseDate asc", top: 2 },
        sink: {
          upsertOpenHouse: (openHouse) => Effect.sync(() => calls.push(`open:${openHouse.OpenHouseKey}`)),
          saveWatermark: (_resource, watermark) => Effect.sync(() => calls.push(`watermark:${watermark}`)),
        },
      }),
      http,
    );

    assert.deepEqual(paths, [
      "/odata/v1/OpenHouse:OpenHouseStatus eq 'Active':OpenHouseDate asc",
      "https://ddf.test/openhouse-page-2",
    ]);
    assert.equal(result.records.length, 2);
    assert.equal(result.nextWatermark, "2024-04-03T00:00:00.000Z");
    assert.deepEqual(calls, ["open:open-1", "open:open-2", "watermark:2024-04-03T00:00:00.000Z"]);
  });
});

describe("property prune helpers", () => {
  it("diffs local keys against master replication lists", () => {
    assert.deepEqual(diffLocalKeysAgainstMasterList(["a", "b"], ["b", "c"]), {
      localKeys: ["a", "b"],
      masterKeys: ["b", "c"],
      missingLocalKeys: ["a"],
      newMasterKeys: ["c"],
    });
  });

  it("gets property master lists and calls prune sinks without owning a database", async () => {
    const marked: Array<ReadonlyArray<string>> = [];
    const http = emptyHttp({
      requestJson: <T = unknown>(path: string) => {
        if (path.startsWith("/odata/v1/Property/PropertyReplication")) {
          return response<T>({ value: [{ ListingKey: "master-1" }, { ListingKey: "master-2" }] });
        }
        return response<T>({ value: [] });
      },
    });

    const master = await runWithHttp(getPropertyMasterList(), http);
    const diff = await runWithHttp(
      pruneMissingProperties(["master-1", "stale-1"], {
        sink: {
          markMissingPropertiesInactive: (keys) => Effect.sync(() => marked.push(keys)),
        },
      }),
      http,
    );

    assert.deepEqual(master.map((identifier) => identifier.ListingKey), ["master-1", "master-2"]);
    assert.deepEqual(diff.missingLocalKeys, ["stale-1"]);
    assert.deepEqual(marked, [["stale-1"]]);
  });
});
