import { assert, describe, it, layer as effectLayer } from "@effect/vitest";
import { DateTime, Effect, Exit, Layer } from "effect";
import {
  DdfDbClient,
  DdfDbClientValidationError,
  type DbRow,
  coListAgentKeysFromRow,
  coListOfficeKeysFromRow,
  groupRowsBy,
  projectionPlan,
  embeddedMediaRowsFromColumn,
  embeddedRoomRowsFromColumn,
  propertyFieldPresets,
  validateListOptions,
} from "./client";
import { DdfDatabase, type DdfDrizzleDatabase } from "./layer";
import { ddfMembers, ddfOffices, ddfOpenHouses, ddfProperties, ddfSocialMedia } from "./schema";

type FakeRows = {
  readonly properties?: ReadonlyArray<Record<string, unknown>>;
  readonly members?: ReadonlyArray<Record<string, unknown>>;
  readonly offices?: ReadonlyArray<Record<string, unknown>>;
  readonly openHouses?: ReadonlyArray<Record<string, unknown>>;
  readonly socialMedia?: ReadonlyArray<Record<string, unknown>>;
};

type FakeQuery = {
  readonly $dynamic: () => FakeQuery;
  readonly where: (_condition: unknown) => FakeQuery;
  readonly limit: (value: number) => FakeQuery;
  readonly offset: (value: number) => FakeQuery;
  readonly orderBy: (..._orders: ReadonlyArray<unknown>) => FakeQuery;
  readonly pipe: <Output>(
    fn: (effect: Effect.Effect<ReadonlyArray<DbRow>>) => Output,
  ) => Output;
};

const tableRows = (rows: FakeRows, table: unknown): ReadonlyArray<Record<string, unknown>> => {
  if (table === ddfProperties) return rows.properties ?? [];
  if (table === ddfMembers) return rows.members ?? [];
  if (table === ddfOffices) return rows.offices ?? [];
  if (table === ddfOpenHouses) return rows.openHouses ?? [];
  if (table === ddfSocialMedia) return rows.socialMedia ?? [];
  return [];
};

const projectSelection = (
  rows: ReadonlyArray<Record<string, unknown>>,
  selection: Readonly<Record<string, unknown>>,
): ReadonlyArray<DbRow> =>
  rows.map((row) => {
    const selected: Record<string, unknown> = {};
    for (const field of Object.keys(selection)) {
      selected[field] = row[field];
    }
    return selected as DbRow;
  });

const fakeQuery = (rows: ReadonlyArray<DbRow>): FakeQuery => {
  let take: number | undefined;
  let skip = 0;
  const query: FakeQuery = {
    $dynamic: () => query,
    where: () => query,
    limit: (value) => {
      take = value;
      return query;
    },
    offset: (value) => {
      skip = value;
      return query;
    },
    orderBy: () => query,
    pipe: (fn) => {
      const end = take === undefined ? undefined : skip + take;
      return fn(Effect.succeed(rows.slice(skip, end)));
    },
  };
  return query;
};

const fakeDatabaseLayer = (rows: FakeRows) =>
  Layer.succeed(
    DdfDatabase,
    DdfDatabase.of({
      db: {
        select: (selection: Readonly<Record<string, unknown>>) => ({
          from: (table: unknown) => fakeQuery(projectSelection(tableRows(rows, table), selection)),
        }),
      } as unknown as DdfDrizzleDatabase,
      pg: {} as unknown as DdfDrizzleDatabase["$client"],
    }),
  );

const clientLayer = (rows: FakeRows) =>
  DdfDbClient.layer.pipe(Layer.provide(fakeDatabaseLayer(rows)));

const dbRows: FakeRows = {
  properties: [
    {
      listingKey: "listing-1",
      listingId: "L123",
      city: "Ottawa",
      rooms: [
        {
          RoomKey: "room-1",
          ListingId: "RL123",
          RoomType: "Kitchen",
          RoomLevel: "Main level",
          ModificationTimestamp: "2024-01-02T03:04:05.000Z",
        },
      ],
      media: [
        {
          MediaKey: "property-media-1",
          MediaURL: "https://example.test/property.jpg",
          Order: 1,
          ModificationTimestamp: "2024-01-02T03:04:05.000Z",
        },
      ],
    },
  ],
  members: [
    {
      memberKey: "member-1",
      firstName: "Ada",
      officeKey: "office-1",
      media: [
        {
          MediaKey: "member-media-1",
          MediaURL: "https://example.test/member.jpg",
          Order: 1,
        },
      ],
    },
  ],
  offices: [
    {
      officeKey: "office-1",
      officeName: "Example Realty",
      media: [
        {
          MediaKey: "office-media-1",
          MediaURL: "https://example.test/office.jpg",
          Order: 1,
        },
      ],
    },
  ],
};

describe("database read client helpers", () => {
  it("keeps website field presets free of raw payloads by default", () => {
    assert.deepEqual(propertyFieldPresets.card, [
      "listingKey",
      "listPrice",
      "city",
      "province",
      "propertySubType",
      "bedroomsTotal",
      "bathroomsTotalInteger",
      "primaryMediaUrl",
      "modificationTimestamp",
    ]);
    assert.equal(propertyFieldPresets.card.join(",").includes("raw"), false);
  });


  it("projects embedded JSONB property/member/office media and property rooms for includes", () => {
    const timestamp = DateTime.makeUnsafe("2024-01-02T03:04:05.000Z");
    const media = [
      { MediaKey: "media-2", MediaURL: "https://example.test/second.jpg", Order: 2 },
      {
        MediaKey: "media-1",
        MediaURL: "https://example.test/first.jpg",
        ModificationTimestamp: timestamp,
        Order: 1,
      },
    ];

    const mediaRows = embeddedMediaRowsFromColumn(media, "Property", "listing-1");

    assert.equal(mediaRows[0]?.mediaKey, "media-1");
    assert.equal(mediaRows[0]?.resource, "Property");
    assert.equal(mediaRows[0]?.resourceKey, "listing-1");
    assert.equal((mediaRows[0]?.modificationTimestamp as Date | null)?.toISOString(), "2024-01-02T03:04:05.000Z");
    assert.equal(mediaRows[1]?.mediaKey, "media-2");
    assert.equal(embeddedMediaRowsFromColumn(media, "Member", "member-1")[0]?.resourceKey, "member-1");
    assert.equal(embeddedMediaRowsFromColumn(media, "Office", "office-1")[0]?.resourceKey, "office-1");
    const roomRows = embeddedRoomRowsFromColumn([{
      RoomKey: "room-1",
      RoomType: "Kitchen",
      RoomLevel: "Main level",
      ModificationTimestamp: timestamp,
    }], {
      listingKey: "listing-1",
      listingId: "L123",
    });

    assert.equal(roomRows[0]?.roomKey, "room-1");
    assert.equal(roomRows[0]?.listingKey, "listing-1");
    assert.equal(roomRows[0]?.listingId, "L123");
    assert.equal((roomRows[0]?.modificationTimestamp as Date | null)?.toISOString(), "2024-01-02T03:04:05.000Z");
    assert.equal(roomRows[0]?.roomLevel, "Main level");
    assert.equal(roomRows[0]?.roomType, "Kitchen");
  });

  effectLayer(clientLayer(dbRows))("database read client service", (it) => {
    it.effect("assembles property include media and rooms without leaking helper fields", () =>
      Effect.gen(function* () {
        const client = yield* DdfDbClient;
        const properties = yield* client.properties.list({
          select: ["city"],
          include: {
            media: { select: ["mediaUrl"] },
            rooms: { select: ["roomType"] },
          },
        });

        assert.deepEqual(properties, [
          {
            city: "Ottawa",
            media: [{ mediaUrl: "https://example.test/property.jpg" }],
            rooms: [{ roomType: "Kitchen" }],
          },
        ]);
      }),
    );

    it.effect("projects member and office include media from parent JSONB", () =>
      Effect.gen(function* () {
        const client = yield* DdfDbClient;
        const member = yield* client.members.get("member-1", {
          select: ["firstName"],
          include: { media: { select: ["mediaUrl"] } },
        });
        const office = yield* client.offices.get("office-1", {
          select: ["officeName"],
          include: { media: { select: ["mediaUrl"] } },
        });

        assert.deepEqual(member, {
          firstName: "Ada",
          media: [{ mediaUrl: "https://example.test/member.jpg" }],
        });
        assert.deepEqual(office, {
          officeName: "Example Realty",
          media: [{ mediaUrl: "https://example.test/office.jpg" }],
        });
      }),
    );

    it.effect("does not expose embedded child collections as top-level read clients", () =>
      Effect.gen(function* () {
        const client = yield* DdfDbClient;
        assert.equal("media" in client, false);
        assert.equal("propertyRooms" in client, false);
      }),
    );
  });

  it("only includes raw when explicitly requested", () => {
    const defaultPlan = projectionPlan<"listingKey" | "raw">(["listingKey", "raw"], {
      select: ["listingKey", "raw"],
    });
    const rawPlan = projectionPlan<"listingKey" | "raw">(["listingKey"], {
      includeRaw: true,
    });

    assert.deepEqual(defaultPlan.fields, ["listingKey"]);
    assert.equal(defaultPlan.includesRaw, false);
    assert.deepEqual(rawPlan.fields, ["listingKey", "raw"]);
    assert.equal(rawPlan.includesRaw, true);
  });

  it("groups related rows by parent key for batched include assembly", () => {
    const grouped = groupRowsBy(
      [
        { listingKey: "listing-1", mediaKey: "media-1" },
        { listingKey: "listing-1", mediaKey: "media-2" },
        { listingKey: "listing-2", mediaKey: "media-3" },
        { listingKey: null, mediaKey: "ignored" },
      ],
      "listingKey",
    );

    assert.deepEqual(grouped.get("listing-1"), [
      { listingKey: "listing-1", mediaKey: "media-1" },
      { listingKey: "listing-1", mediaKey: "media-2" },
    ]);
    assert.deepEqual(grouped.get("listing-2"), [
      { listingKey: "listing-2", mediaKey: "media-3" },
    ]);
    assert.equal(grouped.has("ignored"), false);
  });

  it("reads property co-list keys from typed row columns", () => {
    const propertyRow = {
      coListAgentKey: "agent-2",
      coListAgentKey2: "agent-3",
      coListAgentKey3: "agent-2",
      coListOfficeKey: "office-2",
      coListOfficeKey2: "office-3",
      coListOfficeKey3: null,
    };

    assert.deepEqual(coListAgentKeysFromRow(propertyRow), ["agent-2", "agent-3"]);
    assert.deepEqual(coListOfficeKeysFromRow(propertyRow), ["office-2", "office-3"]);
  });

  it.effect("validates pagination options as typed Effect failures", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        validateListOptions("properties.list", { limit: 0 }),
      );
      const failure = Exit.findErrorOption(exit);

      assert.equal(Exit.isFailure(exit), true);
      assert.equal(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.equal(failure.value instanceof DdfDbClientValidationError, true);
        assert.equal(failure.value.message, "limit must be an integer from 1 to 500");
      }
    }),
  );
});
