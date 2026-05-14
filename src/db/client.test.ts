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
  readonly where: (condition: unknown) => FakeQuery;
  readonly limit: (value: number) => FakeQuery;
  readonly offset: (value: number) => FakeQuery;
  readonly orderBy: (...orders: ReadonlyArray<unknown>) => FakeQuery;
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

const constructorName = (value: unknown) =>
  typeof value === "object" && value !== null
    ? (value as { readonly constructor?: { readonly name?: string } })
        .constructor?.name
    : undefined;

const queryChunks = (value: unknown): ReadonlyArray<unknown> | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const chunks = (value as { readonly queryChunks?: unknown }).queryChunks;
  return Array.isArray(chunks) ? chunks : undefined;
};

const stringChunkText = (value: unknown) => {
  if (constructorName(value) !== "StringChunk") return "";
  const chunkValue = (value as { readonly value?: unknown }).value;
  return Array.isArray(chunkValue)
    ? chunkValue
        .filter((text): text is string => typeof text === "string")
        .join("")
    : "";
};

const isColumnChunk = (
  value: unknown,
): value is { readonly name: string } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { readonly name?: unknown }).name === "string" &&
  queryChunks(value) === undefined &&
  constructorName(value) !== "Param" &&
  constructorName(value) !== "StringChunk";

const isParamChunk = (value: unknown) => constructorName(value) === "Param";

const paramValue = (value: unknown) =>
  isParamChunk(value)
    ? (value as { readonly value?: unknown }).value
    : undefined;

const columnFieldNames = new Map<unknown, string>();

const registerColumnFields = (table: object) => {
  for (const [field, column] of Object.entries(
    table as Record<string, unknown>,
  )) {
    if (isColumnChunk(column)) columnFieldNames.set(column, field);
  }
};

[
  ddfProperties,
  ddfMembers,
  ddfOffices,
  ddfOpenHouses,
  ddfSocialMedia,
].forEach(registerColumnFields);

const snakeToCamel = (value: string) =>
  value.replaceAll(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );

const fieldForColumn = (column: { readonly name: string }) =>
  columnFieldNames.get(column) ?? snakeToCamel(column.name);

const rowColumnValue = (
  row: Readonly<Record<string, unknown>>,
  column: { readonly name: string },
) => {
  const field = fieldForColumn(column);
  return field in row ? row[field] : row[column.name];
};

const unwrapFakeSql = (value: unknown): unknown => {
  const chunks = queryChunks(value);
  if (chunks === undefined) return value;
  const meaningful = chunks.filter((chunk) => stringChunkText(chunk) !== "");
  if (meaningful.length === 1 && queryChunks(meaningful[0]) !== undefined) {
    return unwrapFakeSql(meaningful[0]);
  }
  if (
    meaningful.length === 3 &&
    stringChunkText(meaningful[0]) === "(" &&
    queryChunks(meaningful[1]) !== undefined &&
    stringChunkText(meaningful[2]) === ")"
  ) {
    return unwrapFakeSql(meaningful[1]);
  }
  return value;
};

const compareFakeValues = (left: unknown, right: unknown) => {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  const leftComparable =
    left instanceof Date
      ? left.getTime()
      : typeof left === "boolean"
        ? Number(left)
        : typeof left === "string" || typeof left === "number"
          ? left
          : null;
  const rightComparable =
    right instanceof Date
      ? right.getTime()
      : typeof right === "boolean"
        ? Number(right)
        : typeof right === "string" || typeof right === "number"
          ? right
          : null;

  if (leftComparable == null && rightComparable == null) return 0;
  if (leftComparable == null) return 1;
  if (rightComparable == null) return -1;
  return leftComparable < rightComparable
    ? -1
    : leftComparable > rightComparable
      ? 1
      : 0;
};

const evaluateFakeCondition = (
  row: Readonly<Record<string, unknown>>,
  condition: unknown,
): boolean => {
  const normalized = unwrapFakeSql(condition);
  const chunks = queryChunks(normalized);
  if (chunks === undefined) return true;

  const operatorText = chunks.map(stringChunkText).join("");
  const nestedSql = chunks.filter((chunk) => queryChunks(chunk) !== undefined);
  if (operatorText.includes(" and ") && nestedSql.length > 1) {
    return nestedSql.every((chunk) => evaluateFakeCondition(row, chunk));
  }

  const column = chunks.find(isColumnChunk);
  if (column === undefined) {
    return nestedSql.length === 0
      ? true
      : nestedSql.every((chunk) => evaluateFakeCondition(row, chunk));
  }

  const left = rowColumnValue(row, column);
  if (operatorText.includes(" in ")) {
    const values = chunks
      .filter(Array.isArray)
      .flatMap((items) => items.map(paramValue));
    return values.some((value) => Object.is(left, value));
  }

  const right = paramValue(chunks.find(isParamChunk));
  if (operatorText.includes(" = ")) return Object.is(left, right);
  if (operatorText.includes(" >= ")) return compareFakeValues(left, right) >= 0;
  if (operatorText.includes(" <= ")) return compareFakeValues(left, right) <= 0;
  return true;
};

const orderFakeRows = (
  rows: ReadonlyArray<Record<string, unknown>>,
  orders: ReadonlyArray<unknown>,
) => {
  if (orders.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const normalized = unwrapFakeSql(order);
      const chunks = queryChunks(normalized) ?? [];
      const column = chunks.find(isColumnChunk);
      if (column === undefined) continue;
      const operatorText = chunks.map(stringChunkText).join("");
      const comparison = compareFakeValues(
        rowColumnValue(left, column),
        rowColumnValue(right, column),
      );
      if (comparison !== 0)
        return operatorText.includes(" desc") ? -comparison : comparison;
    }
    return 0;
  });
};

const fakeQuery = (
  rows: ReadonlyArray<Record<string, unknown>>,
  selection: Readonly<Record<string, unknown>>,
): FakeQuery => {
  let take: number | undefined;
  let skip = 0;
  const conditions: Array<unknown> = [];
  let orders: ReadonlyArray<unknown> = [];
  const query: FakeQuery = {
    $dynamic: () => query,
    where: (condition) => {
      conditions.push(condition);
      return query;
    },
    limit: (value) => {
      take = value;
      return query;
    },
    offset: (value) => {
      skip = value;
      return query;
    },
    orderBy: (...nextOrders) => {
      orders = nextOrders;
      return query;
    },
    pipe: (fn) => {
      const end = take === undefined ? undefined : skip + take;
      const filtered = rows.filter((row) =>
        conditions.every((condition) => evaluateFakeCondition(row, condition)),
      );
      const ordered = orderFakeRows(filtered, orders);
      return fn(
        Effect.succeed(projectSelection(ordered.slice(skip, end), selection)),
      );
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
          from: (table: unknown) => fakeQuery(tableRows(rows, table), selection),
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

const queryRows: FakeRows = {
  properties: [
    {
      listingKey: "listing-1",
      city: "Ottawa",
      listAgentKey: "member-1",
      listOfficeKey: "office-1",
      coListAgentKey: "member-3",
      coListOfficeKey: "office-2",
    },
    {
      listingKey: "listing-2",
      city: "Toronto",
      listAgentKey: "member-2",
      listOfficeKey: "office-2",
      coListAgentKey: "member-3",
      coListOfficeKey: "office-1",
    },
  ],
  members: [
    {
      memberKey: "member-1",
      firstName: "Ada",
      officeKey: "office-1",
    },
    {
      memberKey: "member-2",
      firstName: "Grace",
      officeKey: "office-2",
    },
    {
      memberKey: "member-3",
      firstName: "Barbara",
      officeKey: "office-2",
    },
  ],
  offices: [
    {
      officeKey: "office-1",
      officeName: "North Realty",
    },
    {
      officeKey: "office-2",
      officeName: "South Realty",
    },
  ],
  openHouses: [
    {
      openHouseKey: "open-house-1",
      listingKey: "listing-1",
    },
    {
      openHouseKey: "open-house-2",
      listingKey: "listing-2",
    },
  ],
  socialMedia: [
    {
      socialMediaKey: "member-social-1",
      resource: "Member",
      resourceKey: "member-1",
    },
    {
      socialMediaKey: "member-social-2",
      resource: "Member",
      resourceKey: "member-2",
    },
    {
      socialMediaKey: "member-social-3",
      resource: "Member",
      resourceKey: "member-3",
    },
    {
      socialMediaKey: "office-social-with-member-key",
      resource: "Office",
      resourceKey: "member-3",
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

  effectLayer(clientLayer(queryRows))(
    "database read client query behavior",
    (it) => {
      it.effect("applies get filters, list filters, ordering, and include grouping", () =>
        Effect.gen(function* () {
          const client = yield* DdfDbClient;
          const property = yield* client.properties.get("listing-2", {
            select: ["city"],
            include: {
              listAgent: { select: ["firstName"] },
              listOffice: { select: ["officeName"] },
              coListAgents: { select: ["memberKey"] },
              coListOffices: { select: ["officeKey"] },
              openHouses: { select: ["openHouseKey"] },
            },
          });

          assert.deepEqual(property, {
            city: "Toronto",
            listAgent: { firstName: "Grace" },
            listOffice: { officeName: "South Realty" },
            coListAgents: [{ memberKey: "member-3" }],
            coListOffices: [{ officeKey: "office-1" }],
            openHouses: [{ openHouseKey: "open-house-2" }],
          });

          const members = yield* client.members.list({
            select: ["memberKey", "firstName"],
            filters: { officeKey: "office-2" },
            orderBy: [{ field: "firstName", direction: "asc" }],
            include: {
              office: { select: ["officeName"] },
              socialMedia: { select: ["socialMediaKey"] },
            },
          });

          assert.deepEqual(members, [
            {
              memberKey: "member-3",
              firstName: "Barbara",
              office: { officeName: "South Realty" },
              socialMedia: [{ socialMediaKey: "member-social-3" }],
            },
            {
              memberKey: "member-2",
              firstName: "Grace",
              office: { officeName: "South Realty" },
              socialMedia: [{ socialMediaKey: "member-social-2" }],
            },
          ]);
        }),
      );
    },
  );

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
