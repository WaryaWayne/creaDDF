import {
  and,
  asc,
  desc,
  eq,
  getColumns,
  inArray,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { MediaRecord, PropertyRecord, RoomRecord } from "../sync";
import type { SocialMedia } from "../schema/officeSchema";
import type { PgColumn, PgTable, SelectedFields } from "drizzle-orm/pg-core";
import { Context, Data, Effect, Layer } from "effect";
import { DdfDatabase } from "./layer";
import { mediaRowFromRecord, roomRowFromRecord, socialMediaRowFromRecord } from "./sink";
import {
  ddfDestinations,
  ddfMembers,
  ddfOffices,
  ddfOpenHouses,
  ddfProperties,
} from "./schema";

type DbValue = string | number | boolean | Date | unknown | null;
export type DbRow = Readonly<Record<string, DbValue>>;
type DbRows = ReadonlyArray<DbRow>;
type Direction = "asc" | "desc";
type RowSelect<Field extends string> = ReadonlyArray<Field>;

type ColumnExpr = PgColumn | SQL;
type FieldMap<Field extends string> = Readonly<Record<Field, ColumnExpr>>;

type BaseOptions<Field extends string> = {
  readonly select?: RowSelect<Field>;
  readonly includeRaw?: boolean;
};

type ListOptions<Field extends string, Filter, Include> = BaseOptions<Field> & {
  readonly filters?: Filter;
  readonly include?: Include;
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: ReadonlyArray<{
    readonly field: Field;
    readonly direction: Direction;
  }>;
};

type GetOptions<Field extends string, Include> = BaseOptions<Field> & {
  readonly include?: Include;
};

export class DdfDbClientError extends Data.TaggedError("DdfDbClientError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class DdfDbClientValidationError extends Data.TaggedError(
  "DdfDbClientValidationError",
)<{
  readonly operation: string;
  readonly message: string;
}> {}

const mapClientError = (operation: string) => (cause: unknown) =>
  new DdfDbClientError({
    operation,
    message: "DDF database query failed",
    cause,
  });

const rawField = "raw";

const propertyColumns = {
  ...getColumns(ddfProperties),
} satisfies FieldMap<string>;

export type PropertyField = keyof typeof propertyColumns;

const memberColumns = {
  ...getColumns(ddfMembers),
  phone: ddfMembers.officePhone,
} satisfies FieldMap<string>;
export type MemberField = keyof typeof memberColumns;

const officeColumns = {
  ...getColumns(ddfOffices),
} satisfies FieldMap<string>;
export type OfficeField = keyof typeof officeColumns;

const openHouseColumns = {
  ...getColumns(ddfOpenHouses),
} satisfies FieldMap<string>;
export type OpenHouseField = keyof typeof openHouseColumns;

const mediaColumns = {
  mediaKey: true,
  resource: true,
  resourceKey: true,
  resourceRecordId: true,
  resourceRecordKey: true,
  resourceName: true,
  modificationTimestamp: true,
  mediaUrl: true,
  mediaCategory: true,
  longDescription: true,
  preferredPhoto: true,
  sortOrder: true,
  raw: true,
} as const;
export type MediaField = keyof typeof mediaColumns;

const roomColumns = {
  roomKey: true,
  listingKey: true,
  listingId: true,
  modificationTimestamp: true,
  roomDescription: true,
  roomDimensions: true,
  roomLength: true,
  roomLevel: true,
  roomWidth: true,
  roomLengthWidthUnits: true,
  roomType: true,
  raw: true,
} as const;
export type PropertyRoomField = keyof typeof roomColumns;

type SocialMediaRow = ReturnType<typeof socialMediaRowFromRecord>;
export type SocialMediaField = keyof SocialMediaRow;
export type MemberLanguageField = "memberKey" | "language";
export type MemberDesignationField = "memberKey" | "designation";

const destinationColumns = {
  ...getColumns(ddfDestinations),
} satisfies FieldMap<string>;
export type DestinationField = keyof typeof destinationColumns;

export const propertyFieldPresets = {
  card: [
    "listingKey",
    "listPrice",
    "city",
    "province",
    "propertySubType",
    "bedroomsTotal",
    "bathroomsTotalInteger",
    "primaryMediaUrl",
    "modificationTimestamp",
  ],
  detail: [
    "listingKey",
    "listPrice",
    "city",
    "province",
    "latitude",
    "longitude",
    "standardStatus",
    "propertySubType",
    "bedroomsTotal",
    "bathroomsTotalInteger",
    "primaryMediaUrl",
    "listAgentKey",
    "listOfficeKey",
    "modificationTimestamp",
  ],
} as const satisfies Record<string, RowSelect<PropertyField>>;

export const memberFieldPresets = {
  card: ["memberKey", "firstName", "lastName", "phone", "officeKey"],
  detail: [
    "memberKey",
    "firstName",
    "lastName",
    "phone",
    "city",
    "province",
    "officeKey",
  ],
} as const satisfies Record<string, RowSelect<MemberField>>;

export const officeFieldPresets = {
  card: ["officeKey", "officeName", "phone", "city", "province"],
  detail: [
    "officeKey",
    "officeName",
    "phone",
    "city",
    "province",
    "modificationTimestamp",
  ],
} as const satisfies Record<string, RowSelect<OfficeField>>;

export const openHouseFieldPresets = {
  card: ["openHouseKey", "listingKey", "openHouseDate", "openHouseStartTime"],
  detail: [
    "openHouseKey",
    "listingKey",
    "openHouseDate",
    "openHouseStartTime",
    "openHouseEndTime",
  ],
} as const satisfies Record<string, RowSelect<OpenHouseField>>;

export type ProjectionPlan<Field extends string> = {
  readonly fields: ReadonlyArray<Field>;
  readonly includesRaw: boolean;
};

export const projectionPlan = <Field extends string>(
  defaultFields: RowSelect<Field>,
  options?: BaseOptions<Field>,
): ProjectionPlan<Field> => {
  const requested = options?.select ?? defaultFields;
  const fields = new Set<Field>();
  for (const field of requested) {
    if (field !== rawField || options?.includeRaw === true) {
      fields.add(field);
    }
  }
  if (options?.includeRaw === true) {
    fields.add(rawField as Field);
  }
  return {
    fields: Array.from(fields),
    includesRaw: fields.has(rawField as Field),
  };
};

const selectionFor = <Field extends string>(
  columns: FieldMap<Field>,
  defaultFields: RowSelect<Field>,
  options?: BaseOptions<Field>,
  hiddenFields: RowSelect<Field> = [],
): SelectedFields => {
  const plan = projectionPlan(defaultFields, options);
  const selection: Record<string, ColumnExpr> = {};
  for (const field of [...plan.fields, ...hiddenFields]) {
    selection[field] = columns[field];
  }
  return selection;
};

export type PropertyFilters = {
  readonly active?: boolean;
  readonly standardStatus?: string;
  readonly propertySubType?: string;
  readonly city?: string;
  readonly province?: string;
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly minBedrooms?: number;
  readonly minBathrooms?: number;
};

const propertyWhere = (filters?: PropertyFilters) => {
  const clauses: SQL[] = [];
  if (filters?.active !== undefined)
    clauses.push(eq(ddfProperties.active, filters.active));
  if (filters?.standardStatus !== undefined)
    clauses.push(eq(ddfProperties.standardStatus, filters.standardStatus));
  if (filters?.city !== undefined)
    clauses.push(eq(ddfProperties.city, filters.city));
  if (filters?.province !== undefined)
    clauses.push(eq(ddfProperties.province, filters.province));
  if (filters?.propertySubType !== undefined)
    clauses.push(eq(ddfProperties.propertySubType, filters.propertySubType));
  if (filters?.minPrice !== undefined)
    clauses.push(sql`${ddfProperties.listPrice} >= ${filters.minPrice}`);
  if (filters?.maxPrice !== undefined)
    clauses.push(sql`${ddfProperties.listPrice} <= ${filters.maxPrice}`);
  if (filters?.minBedrooms !== undefined)
    clauses.push(sql`${ddfProperties.bedroomsTotal} >= ${filters.minBedrooms}`);
  if (filters?.minBathrooms !== undefined)
    clauses.push(
      sql`${ddfProperties.bathroomsTotalInteger} >= ${filters.minBathrooms}`,
    );
  return clauses.length === 0 ? undefined : and(...clauses);
};

const validatePage = Effect.fn("DdfDbClient.validatePage")(function* (
  operation: string,
  limit?: number,
  offset?: number,
) {
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > 500)
  ) {
    return yield* new DdfDbClientValidationError({
      operation,
      message: "limit must be an integer from 1 to 500",
    });
  }
  if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
    return yield* new DdfDbClientValidationError({
      operation,
      message: "offset must be a non-negative integer",
    });
  }
});

export const validateListOptions = Effect.fn("DdfDbClient.validateListOptions")(
  function* <Field extends string, Filter, Include>(
    operation: string,
    options?: ListOptions<Field, Filter, Include>,
  ) {
    yield* validatePage(operation, options?.limit, options?.offset);
  },
);

const orderExpressions = <Field extends string>(
  columns: FieldMap<Field>,
  orderBy?: ReadonlyArray<{
    readonly field: Field;
    readonly direction: Direction;
  }>,
) =>
  orderBy?.map((order) =>
    order.direction === "asc"
      ? asc(columns[order.field])
      : desc(columns[order.field]),
  );

const groupByKey = (rows: DbRows, key: string) => {
  const grouped = new Map<string, DbRows>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value === "string") {
      grouped.set(value, [...(grouped.get(value) ?? []), row]);
    }
  }
  return grouped;
};

export const groupRowsBy = groupByKey;

const stringValues = (rows: DbRows, key: string) =>
  Array.from(
    new Set(
      rows.flatMap((row) => (typeof row[key] === "string" ? [row[key]] : [])),
    ),
  );

const withoutHiddenRaw = <Row extends DbRow>(
  row: Row,
  includeRaw?: boolean,
): DbRow => {
  if (includeRaw === true || !(rawField in row)) return row;
  const { raw: _raw, ...rest } = row;
  return rest;
};

const appendGroup = (
  rows: DbRows,
  property: string,
  grouped: Map<string, DbRows>,
  key = "listingKey",
) =>
  rows.map((row) => ({
    ...row,
    [property]:
      typeof row[key] === "string" ? (grouped.get(row[key]) ?? []) : [],
  }));

const stripProjectionHelpers = <Field extends string>(
  row: DbRow,
  defaults: RowSelect<Field>,
  options: BaseOptions<Field> | undefined,
  helperFields: RowSelect<Field>,
  preserveFields: ReadonlyArray<string> = [],
): DbRow => {
  const visibleFields = new Set<string>(
    projectionPlan(defaults, options).fields,
  );
  const preservedFields = new Set(preserveFields);
  const helpers = new Set<string>(helperFields);
  const cleaned: Record<string, DbValue> = {};

  for (const [field, value] of Object.entries(row)) {
    if (field === rawField && options?.includeRaw !== true) continue;
    if (
      helpers.has(field) &&
      !visibleFields.has(field) &&
      !preservedFields.has(field)
    )
      continue;
    cleaned[field] = value;
  }

  return cleaned;
};

const groupProjectedRowsBy = <Field extends string>(
  rows: DbRows,
  key: string,
  defaults: RowSelect<Field>,
  options: BaseOptions<Field> | undefined,
  helperFields: RowSelect<Field>,
) => {
  const grouped = new Map<string, DbRows>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string") continue;
    grouped.set(value, [
      ...(grouped.get(value) ?? []),
      stripProjectionHelpers(row, defaults, options, helperFields),
    ]);
  }
  return grouped;
};

const projectedRowsByKey = <Field extends string>(
  rows: DbRows,
  key: string,
  defaults: RowSelect<Field>,
  options: BaseOptions<Field> | undefined,
  helperFields: RowSelect<Field>,
) =>
  new Map<DbValue, DbRow>(
    rows.flatMap((row) => {
      const value = row[key];
      return typeof value === "string"
        ? [
            [
              value,
              stripProjectionHelpers(row, defaults, options, helperFields),
            ],
          ]
        : [];
    }),
  );

export type RelatedSelect<Field extends string> = BaseOptions<Field>;
export type PropertyInclude = {
  readonly listAgent?: RelatedSelect<MemberField>;
  readonly coListAgents?: RelatedSelect<MemberField>;
  readonly listOffice?: RelatedSelect<OfficeField>;
  readonly coListOffices?: RelatedSelect<OfficeField>;
  readonly openHouses?: RelatedSelect<OpenHouseField>;
  readonly media?: RelatedSelect<MediaField>;
  readonly rooms?: RelatedSelect<PropertyRoomField>;
};
export type MemberInclude = {
  readonly office?: RelatedSelect<OfficeField>;
  readonly media?: RelatedSelect<MediaField>;
  readonly socialMedia?: RelatedSelect<SocialMediaField>;
  readonly languages?: RelatedSelect<MemberLanguageField>;
  readonly designations?: RelatedSelect<MemberDesignationField>;
};
export type OfficeInclude = {
  readonly members?: RelatedSelect<MemberField>;
  readonly properties?: RelatedSelect<PropertyField>;
  readonly media?: RelatedSelect<MediaField>;
  readonly socialMedia?: RelatedSelect<SocialMediaField>;
};
export type OpenHouseInclude = {
  readonly property?: RelatedSelect<PropertyField>;
};

const stableKey = (value: string | null | undefined): string | null =>
  value != null && value.length > 0 ? value : null;

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const stableHash = (value: unknown): string => {
  let hash = 0x811c9dc5;
  const text = stableJson(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const fallbackKey = (
  scope: string,
  parts: ReadonlyArray<string | number | null | undefined>,
  raw: unknown,
): string =>
  [
    ...parts.filter((part): part is string | number => part != null),
    stableHash(raw),
  ].join(":") || `${scope}:${stableHash(raw)}`;

export const embeddedMediaRowsFromColumn = (
  media: unknown,
  resource: "Property" | "Member" | "Office",
  resourceKey: string,
) =>
  (Array.isArray(media) ? (media as ReadonlyArray<MediaRecord>) : [])
    .map((record) => mediaRowFromRecord(record, { resource, key: resourceKey }))
    .sort(
      (left, right) =>
        (typeof left.sortOrder === "number"
          ? left.sortOrder
          : Number.MAX_SAFE_INTEGER) -
        (typeof right.sortOrder === "number"
          ? right.sortOrder
          : Number.MAX_SAFE_INTEGER),
    );

export const embeddedSocialMediaRowsFromColumn = (
  socialMedia: unknown,
  resource: "Member" | "Office",
  resourceKey: string,
) =>
  (Array.isArray(socialMedia) ? (socialMedia as ReadonlyArray<SocialMedia>) : [])
    .map((record) => socialMediaRowFromRecord(record, { resource, key: resourceKey }))
    .sort((left, right) => left.socialMediaKey.localeCompare(right.socialMediaKey));

const embeddedMemberLanguageRowsFromColumn = (
  languages: unknown,
  memberKey: string,
) =>
  (Array.isArray(languages) ? (languages as ReadonlyArray<string>) : []).map((language) => ({
    memberKey,
    language,
  }));

const embeddedMemberDesignationRowsFromColumn = (
  designations: unknown,
  memberKey: string,
) =>
  (Array.isArray(designations) ? (designations as ReadonlyArray<string>) : []).map((designation) => ({
    memberKey,
    designation,
  }));

const propertyRecordFromRow = (row: DbRow): PropertyRecord =>
  ({
    ListingKey: typeof row.listingKey === "string" ? row.listingKey : null,
    ListingId: typeof row.listingId === "string" ? row.listingId : null,
  }) as PropertyRecord;

export const embeddedRoomRowsFromColumn = (rooms: unknown, row: DbRow) =>
  (Array.isArray(rooms) ? (rooms as ReadonlyArray<RoomRecord>) : []).map(
    (room) => roomRowFromRecord(room, propertyRecordFromRow(row)),
  );

const projectRows = <Field extends string>(
  rows: DbRows,
  defaults: RowSelect<Field>,
  options?: BaseOptions<Field>,
): DbRows => rows.map((row) => pickVirtual(row, defaults, options));

const pickVirtual = <Field extends string>(
  row: DbRow,
  defaults: RowSelect<Field>,
  options?: BaseOptions<Field>,
) => {
  const fields = projectionPlan(defaults, options).fields;
  const selected: Record<string, DbValue> = {};
  for (const field of fields) selected[field] = row[field];
  return selected;
};

const compareValues = (left: DbValue, right: DbValue) => {
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

const orderVirtualRows = <Field extends string>(
  rows: DbRows,
  orderBy?: ReadonlyArray<{
    readonly field: Field;
    readonly direction: Direction;
  }>,
) => {
  if (orderBy === undefined || orderBy.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const order of orderBy) {
      const comparison = compareValues(left[order.field], right[order.field]);
      if (comparison !== 0)
        return order.direction === "asc" ? comparison : -comparison;
    }
    return 0;
  });
};

const pageRows = <Field extends string>(
  rows: DbRows,
  options?: Pick<ListOptions<Field, unknown, unknown>, "limit" | "offset">,
) => {
  const offset = options?.offset ?? 0;
  const end = options?.limit === undefined ? undefined : offset + options.limit;
  return rows.slice(offset, end);
};

const coListAgentFields = [
  "coListAgentKey",
  "coListAgentKey2",
  "coListAgentKey3",
] as const;
const coListOfficeFields = [
  "coListOfficeKey",
  "coListOfficeKey2",
  "coListOfficeKey3",
] as const;

const uniqueStringFields = (row: DbRow, fields: ReadonlyArray<string>) => {
  const values = new Set<string>();
  for (const field of fields) {
    const value = row[field];
    if (typeof value === "string" && value.length > 0) values.add(value);
  }
  return Array.from(values);
};

export const coListAgentKeysFromRow = (row: DbRow) =>
  uniqueStringFields(row, coListAgentFields);

export const coListOfficeKeysFromRow = (row: DbRow) =>
  uniqueStringFields(row, coListOfficeFields);

const valuesForKeys = (
  keys: ReadonlyArray<string>,
  rowsByKey: Map<DbValue, DbRow>,
) =>
  keys.flatMap((key) => {
    const row = rowsByKey.get(key);
    return row === undefined ? [] : [row];
  });

const makeDdfDbClient = Effect.fn("DdfDbClient.make")(function* () {
  const { db } = yield* DdfDatabase;

  const queryProperties = Effect.fn("DdfDbClient.properties.query")(function* (
    options?: ListOptions<PropertyField, PropertyFilters, PropertyInclude>,
    whereKey?: string,
  ) {
    yield* validateListOptions("properties.list", options);
    const include = options?.include;
    const hidden: PropertyField[] = [];
    if (
      include?.openHouses !== undefined ||
      include?.media !== undefined ||
      include?.rooms !== undefined
    )
      hidden.push("listingKey");
    if (include?.media !== undefined) hidden.push("media");
    if (include?.rooms !== undefined) hidden.push("rooms", "listingId");
    if (include?.listAgent !== undefined) hidden.push("listAgentKey");
    if (include?.listOffice !== undefined) hidden.push("listOfficeKey");
    if (include?.coListAgents !== undefined)
      hidden.push("coListAgentKey", "coListAgentKey2", "coListAgentKey3");
    if (include?.coListOffices !== undefined)
      hidden.push("coListOfficeKey", "coListOfficeKey2", "coListOfficeKey3");
    let query = db
      .select(
        selectionFor(
          propertyColumns,
          propertyFieldPresets.detail,
          options,
          hidden,
        ),
      )
      .from(ddfProperties)
      .$dynamic();
    const filters =
      whereKey === undefined
        ? propertyWhere(options?.filters)
        : eq(ddfProperties.listingKey, whereKey);
    if (filters !== undefined) query = query.where(filters);
    if (options?.limit !== undefined) query = query.limit(options.limit);
    if (options?.offset !== undefined) query = query.offset(options.offset);
    const orders = orderExpressions(propertyColumns, options?.orderBy);
    if (orders !== undefined && orders.length > 0)
      query = query.orderBy(...orders);
    const rows = yield* query.pipe(
      Effect.mapError(mapClientError("properties.query")),
    );
    return yield* withPropertyIncludes(rows, options, hidden);
  });

  const withPropertyIncludes = Effect.fn("DdfDbClient.properties.include")(
    function* (
      rows: DbRows,
      options:
        | (BaseOptions<PropertyField> & { readonly include?: PropertyInclude })
        | undefined,
      helperFields: RowSelect<PropertyField>,
    ) {
      const include = options?.include;
      let result = rows;
      if (rows.length === 0 || include === undefined) {
        return result.map((row) =>
          stripProjectionHelpers(
            row,
            propertyFieldPresets.detail,
            options,
            helperFields,
          ),
        );
      }
      const listingKeys = stringValues(rows, "listingKey");
      if (include.media !== undefined) {
        result = result.map((row) => ({
          ...row,
          media:
            typeof row.listingKey === "string"
              ? projectRows(
                  embeddedMediaRowsFromColumn(
                    row.media,
                    "Property",
                    row.listingKey,
                  ),
                  ["mediaKey", "mediaUrl", "sortOrder"],
                  include.media,
                )
              : [],
        }));
      }
      if (include.openHouses !== undefined && listingKeys.length > 0) {
        const openHouseRows = yield* db
          .select(
            selectionFor(
              openHouseColumns,
              openHouseFieldPresets.card,
              include.openHouses,
              ["listingKey"],
            ),
          )
          .from(ddfOpenHouses)
          .where(inArray(ddfOpenHouses.listingKey, listingKeys))
          .pipe(Effect.mapError(mapClientError("properties.openHouses")));
        result = appendGroup(
          result,
          "openHouses",
          groupProjectedRowsBy(
            openHouseRows,
            "listingKey",
            openHouseFieldPresets.card,
            include.openHouses,
            ["listingKey"],
          ),
        );
      }
      if (include.rooms !== undefined) {
        result = result.map((row) => ({
          ...row,
          rooms: projectRows(
            embeddedRoomRowsFromColumn(row.rooms, row),
            ["roomKey", "roomType", "roomLevel"],
            include.rooms,
          ),
        }));
      }
      if (include.listAgent !== undefined) {
        const agentKeys = stringValues(rows, "listAgentKey");
        const agents =
          agentKeys.length === 0
            ? []
            : yield* db
                .select(
                  selectionFor(
                    memberColumns,
                    memberFieldPresets.card,
                    include.listAgent,
                    ["memberKey"],
                  ),
                )
                .from(ddfMembers)
                .where(inArray(ddfMembers.memberKey, agentKeys))
                .pipe(Effect.mapError(mapClientError("properties.listAgent")));
        const byKey = projectedRowsByKey(
          agents,
          "memberKey",
          memberFieldPresets.card,
          include.listAgent,
          ["memberKey"],
        );
        result = result.map((row) => ({
          ...row,
          listAgent:
            typeof row.listAgentKey === "string"
              ? (byKey.get(row.listAgentKey) ?? null)
              : null,
        }));
      }
      if (include.listOffice !== undefined) {
        const officeKeys = stringValues(rows, "listOfficeKey");
        const offices =
          officeKeys.length === 0
            ? []
            : yield* db
                .select(
                  selectionFor(
                    officeColumns,
                    officeFieldPresets.card,
                    include.listOffice,
                    ["officeKey"],
                  ),
                )
                .from(ddfOffices)
                .where(inArray(ddfOffices.officeKey, officeKeys))
                .pipe(Effect.mapError(mapClientError("properties.listOffice")));
        const byKey = projectedRowsByKey(
          offices,
          "officeKey",
          officeFieldPresets.card,
          include.listOffice,
          ["officeKey"],
        );
        result = result.map((row) => ({
          ...row,
          listOffice:
            typeof row.listOfficeKey === "string"
              ? (byKey.get(row.listOfficeKey) ?? null)
              : null,
        }));
      }
      if (include.coListAgents !== undefined) {
        const agentKeys = Array.from(
          new Set(rows.flatMap((row) => coListAgentKeysFromRow(row))),
        );
        const agents =
          agentKeys.length === 0
            ? []
            : yield* db
                .select(
                  selectionFor(
                    memberColumns,
                    memberFieldPresets.card,
                    include.coListAgents,
                    ["memberKey"],
                  ),
                )
                .from(ddfMembers)
                .where(inArray(ddfMembers.memberKey, agentKeys))
                .pipe(
                  Effect.mapError(mapClientError("properties.coListAgents")),
                );
        const byKey = projectedRowsByKey(
          agents,
          "memberKey",
          memberFieldPresets.card,
          include.coListAgents,
          ["memberKey"],
        );
        result = result.map((row) => ({
          ...row,
          coListAgents: valuesForKeys(coListAgentKeysFromRow(row), byKey),
        }));
      }
      if (include.coListOffices !== undefined) {
        const officeKeys = Array.from(
          new Set(rows.flatMap((row) => coListOfficeKeysFromRow(row))),
        );
        const offices =
          officeKeys.length === 0
            ? []
            : yield* db
                .select(
                  selectionFor(
                    officeColumns,
                    officeFieldPresets.card,
                    include.coListOffices,
                    ["officeKey"],
                  ),
                )
                .from(ddfOffices)
                .where(inArray(ddfOffices.officeKey, officeKeys))
                .pipe(
                  Effect.mapError(mapClientError("properties.coListOffices")),
                );
        const byKey = projectedRowsByKey(
          offices,
          "officeKey",
          officeFieldPresets.card,
          include.coListOffices,
          ["officeKey"],
        );
        result = result.map((row) => ({
          ...row,
          coListOffices: valuesForKeys(coListOfficeKeysFromRow(row), byKey),
        }));
      }
      return result.map((row) =>
        stripProjectionHelpers(
          row,
          propertyFieldPresets.detail,
          options,
          helperFields,
          [
            "media",
            "rooms",
            "openHouses",
            "listAgent",
            "listOffice",
            "coListAgents",
            "coListOffices",
          ],
        ),
      );
    },
  );

  const withMemberIncludes = Effect.fn("DdfDbClient.members.include")(
    function* (
      rows: DbRows,
      options:
        | (BaseOptions<MemberField> & { readonly include?: MemberInclude })
        | undefined,
      helperFields: RowSelect<MemberField>,
    ) {
      const include = options?.include;
      let result = rows;
      if (rows.length === 0 || include === undefined) {
        return result.map((row) =>
          stripProjectionHelpers(
            row,
            memberFieldPresets.detail,
            options,
            helperFields,
          ),
        );
      }
      if (include.media !== undefined) {
        result = result.map((row) => ({
          ...row,
          media:
            typeof row.memberKey === "string"
              ? projectRows(
                  embeddedMediaRowsFromColumn(
                    row.media,
                    "Member",
                    row.memberKey,
                  ),
                  ["mediaKey", "mediaUrl", "sortOrder"],
                  include.media,
                )
              : [],
        }));
      }
      if (include.office !== undefined) {
        const officeKeys = stringValues(rows, "officeKey");
        const offices =
          officeKeys.length === 0
            ? []
            : yield* db
                .select(
                  selectionFor(
                    officeColumns,
                    officeFieldPresets.card,
                    include.office,
                    ["officeKey"],
                  ),
                )
                .from(ddfOffices)
                .where(inArray(ddfOffices.officeKey, officeKeys))
                .pipe(Effect.mapError(mapClientError("members.office")));
        const byKey = projectedRowsByKey(
          offices,
          "officeKey",
          officeFieldPresets.card,
          include.office,
          ["officeKey"],
        );
        result = result.map((row) => ({
          ...row,
          office:
            typeof row.officeKey === "string"
              ? (byKey.get(row.officeKey) ?? null)
              : null,
        }));
      }
      if (include.socialMedia !== undefined) {
        result = result.map((row) => ({
          ...row,
          socialMedia:
            typeof row.memberKey === "string"
              ? projectRows(
                  embeddedSocialMediaRowsFromColumn(
                    row.memberSocialMedia,
                    "Member",
                    row.memberKey,
                  ),
                  ["socialMediaKey", "socialMediaType", "socialMediaUrlOrId"],
                  include.socialMedia,
                )
              : [],
        }));
      }
      if (include.languages !== undefined) {
        result = result.map((row) => ({
          ...row,
          languages:
            typeof row.memberKey === "string"
              ? projectRows(
                  embeddedMemberLanguageRowsFromColumn(
                    row.memberLanguages,
                    row.memberKey,
                  ),
                  ["memberKey", "language"],
                  include.languages,
                )
              : [],
        }));
      }
      if (include.designations !== undefined) {
        result = result.map((row) => ({
          ...row,
          designations:
            typeof row.memberKey === "string"
              ? projectRows(
                  embeddedMemberDesignationRowsFromColumn(
                    row.memberDesignation,
                    row.memberKey,
                  ),
                  ["memberKey", "designation"],
                  include.designations,
                )
              : [],
        }));
      }
      return result.map((row) =>
        stripProjectionHelpers(
          row,
          memberFieldPresets.detail,
          options,
          helperFields,
          ["office", "media", "socialMedia", "languages", "designations"],
        ),
      );
    },
  );

  const withOfficeIncludes = Effect.fn("DdfDbClient.offices.include")(
    function* (
      rows: DbRows,
      options:
        | (BaseOptions<OfficeField> & { readonly include?: OfficeInclude })
        | undefined,
      helperFields: RowSelect<OfficeField>,
    ) {
      const include = options?.include;
      let result = rows;
      if (rows.length === 0 || include === undefined) {
        return result.map((row) =>
          stripProjectionHelpers(
            row,
            officeFieldPresets.detail,
            options,
            helperFields,
          ),
        );
      }
      const officeKeys = stringValues(rows, "officeKey");
      if (include.media !== undefined) {
        result = result.map((row) => ({
          ...row,
          media:
            typeof row.officeKey === "string"
              ? projectRows(
                  embeddedMediaRowsFromColumn(
                    row.media,
                    "Office",
                    row.officeKey,
                  ),
                  ["mediaKey", "mediaUrl", "sortOrder"],
                  include.media,
                )
              : [],
        }));
      }
      if (include.members !== undefined && officeKeys.length > 0) {
        const memberRows = yield* db
          .select(
            selectionFor(
              memberColumns,
              memberFieldPresets.card,
              include.members,
              ["officeKey"],
            ),
          )
          .from(ddfMembers)
          .where(inArray(ddfMembers.officeKey, officeKeys))
          .pipe(Effect.mapError(mapClientError("offices.members")));
        result = appendGroup(
          result,
          "members",
          groupProjectedRowsBy(
            memberRows,
            "officeKey",
            memberFieldPresets.card,
            include.members,
            ["officeKey"],
          ),
          "officeKey",
        );
      }
      if (include.properties !== undefined && officeKeys.length > 0) {
        const propertyRows = yield* db
          .select(
            selectionFor(
              propertyColumns,
              propertyFieldPresets.card,
              include.properties,
              ["listOfficeKey"],
            ),
          )
          .from(ddfProperties)
          .where(inArray(ddfProperties.listOfficeKey, officeKeys))
          .pipe(Effect.mapError(mapClientError("offices.properties")));
        result = appendGroup(
          result,
          "properties",
          groupProjectedRowsBy(
            propertyRows,
            "listOfficeKey",
            propertyFieldPresets.card,
            include.properties,
            ["listOfficeKey"],
          ),
          "officeKey",
        );
      }
      if (include.socialMedia !== undefined) {
        result = result.map((row) => ({
          ...row,
          socialMedia:
            typeof row.officeKey === "string"
              ? projectRows(
                  embeddedSocialMediaRowsFromColumn(
                    row.officeSocialMedia,
                    "Office",
                    row.officeKey,
                  ),
                  ["socialMediaKey", "socialMediaType", "socialMediaUrlOrId"],
                  include.socialMedia,
                )
              : [],
        }));
      }
      return result.map((row) =>
        stripProjectionHelpers(
          row,
          officeFieldPresets.detail,
          options,
          helperFields,
          ["members", "properties", "media", "socialMedia"],
        ),
      );
    },
  );

  const withOpenHouseIncludes = Effect.fn("DdfDbClient.openHouses.include")(
    function* (
      rows: DbRows,
      options:
        | (BaseOptions<OpenHouseField> & {
            readonly include?: OpenHouseInclude;
          })
        | undefined,
      helperFields: RowSelect<OpenHouseField>,
    ) {
      const include = options?.include;
      let result = rows;
      if (rows.length === 0 || include?.property === undefined) {
        return result.map((row) =>
          stripProjectionHelpers(
            row,
            openHouseFieldPresets.detail,
            options,
            helperFields,
          ),
        );
      }
      const listingKeys = stringValues(rows, "listingKey");
      const propertyRows =
        listingKeys.length === 0
          ? []
          : yield* db
              .select(
                selectionFor(
                  propertyColumns,
                  propertyFieldPresets.card,
                  include.property,
                  ["listingKey"],
                ),
              )
              .from(ddfProperties)
              .where(inArray(ddfProperties.listingKey, listingKeys))
              .pipe(Effect.mapError(mapClientError("openHouses.property")));
      const byKey = projectedRowsByKey(
        propertyRows,
        "listingKey",
        propertyFieldPresets.card,
        include.property,
        ["listingKey"],
      );
      result = result.map((row) => ({
        ...row,
        property:
          typeof row.listingKey === "string"
            ? (byKey.get(row.listingKey) ?? null)
            : null,
      }));
      return result.map((row) =>
        stripProjectionHelpers(
          row,
          openHouseFieldPresets.detail,
          options,
          helperFields,
          ["property"],
        ),
      );
    },
  );

  const simpleList = <Field extends string, Filter>(
    name: string,
    table: PgTable,
    columns: FieldMap<Field>,
    defaults: RowSelect<Field>,
    where?: SQL,
    options?: ListOptions<Field, Filter, unknown>,
    hiddenFields: RowSelect<Field> = [],
  ) =>
    Effect.gen(function* () {
      yield* validateListOptions(name, options);
      let query = db
        .select(selectionFor(columns, defaults, options, hiddenFields))
        .from(table)
        .$dynamic();
      if (where !== undefined) query = query.where(where);
      if (options?.limit !== undefined) query = query.limit(options.limit);
      if (options?.offset !== undefined) query = query.offset(options.offset);
      const orders = orderExpressions(columns, options?.orderBy);
      if (orders !== undefined && orders.length > 0)
        query = query.orderBy(...orders);
      return yield* query.pipe(Effect.mapError(mapClientError(name)));
    });

  return {
    properties: {
      get: Effect.fn("DdfDbClient.properties.get")(function* (
        listingKey: string,
        options?: GetOptions<PropertyField, PropertyInclude>,
      ) {
        const rows = yield* queryProperties(
          { ...options, limit: 1 },
          listingKey,
        );
        return rows[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.properties.list")(function* (
        options?: ListOptions<PropertyField, PropertyFilters, PropertyInclude>,
      ) {
        return yield* queryProperties(options);
      }),
    },
    members: {
      get: Effect.fn("DdfDbClient.members.get")(function* (
        memberKey: string,
        options?: GetOptions<MemberField, MemberInclude>,
      ) {
        const include = options?.include;
        const hidden: MemberField[] = ["memberKey", "officeKey"];
        if (include?.media !== undefined) hidden.push("media");
        if (include?.socialMedia !== undefined) hidden.push("memberSocialMedia");
        if (include?.languages !== undefined) hidden.push("memberLanguages");
        if (include?.designations !== undefined) hidden.push("memberDesignation");

        const rows = yield* simpleList(
          "members.get",
          ddfMembers,
          memberColumns,
          memberFieldPresets.detail,
          eq(ddfMembers.memberKey, memberKey),
          {
            ...options,
            limit: 1,
            select: options?.select,
            includeRaw: options?.includeRaw,
            include: undefined,
          },
          hidden,
        );
        const included = yield* withMemberIncludes(rows, options, hidden);
        return included[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.members.list")(function* (
        options?: ListOptions<
          MemberField,
          { readonly active?: boolean; readonly officeKey?: string },
          MemberInclude
        >,
      ) {
        const filters = options?.filters;
        const clauses: SQL[] = [];
        if (filters?.active !== undefined)
          clauses.push(eq(ddfMembers.active, filters.active));
        if (filters?.officeKey !== undefined)
          clauses.push(eq(ddfMembers.officeKey, filters.officeKey));
        const include = options?.include;
        const hidden: MemberField[] = ["memberKey", "officeKey"];
        if (include?.media !== undefined) hidden.push("media");
        if (include?.socialMedia !== undefined) hidden.push("memberSocialMedia");
        if (include?.languages !== undefined) hidden.push("memberLanguages");
        if (include?.designations !== undefined) hidden.push("memberDesignation");

        const rows = yield* simpleList(
          "members.list",
          ddfMembers,
          memberColumns,
          memberFieldPresets.card,
          clauses.length > 0 ? and(...clauses) : undefined,
          { ...options, include: undefined },
          hidden,
        );
        return yield* withMemberIncludes(rows, options, hidden);
      }),
    },
    offices: {
      get: Effect.fn("DdfDbClient.offices.get")(function* (
        officeKey: string,
        options?: GetOptions<OfficeField, OfficeInclude>,
      ) {
        const include = options?.include;
        const hidden: OfficeField[] = ["officeKey"];
        if (include?.media !== undefined) hidden.push("media");
        if (include?.socialMedia !== undefined) hidden.push("officeSocialMedia");

        const rows = yield* simpleList(
          "offices.get",
          ddfOffices,
          officeColumns,
          officeFieldPresets.detail,
          eq(ddfOffices.officeKey, officeKey),
          { ...options, limit: 1, include: undefined },
          hidden,
        );
        const included = yield* withOfficeIncludes(rows, options, hidden);
        return included[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.offices.list")(function* (
        options?: ListOptions<
          OfficeField,
          {
            readonly active?: boolean;
            readonly city?: string;
            readonly province?: string;
          },
          OfficeInclude
        >,
      ) {
        const filters = options?.filters;
        const clauses: SQL[] = [];
        if (filters?.active !== undefined)
          clauses.push(eq(ddfOffices.active, filters.active));
        if (filters?.city !== undefined)
          clauses.push(eq(ddfOffices.city, filters.city));
        if (filters?.province !== undefined)
          clauses.push(eq(ddfOffices.province, filters.province));
        const include = options?.include;
        const hidden: OfficeField[] = ["officeKey"];
        if (include?.media !== undefined) hidden.push("media");
        if (include?.socialMedia !== undefined) hidden.push("officeSocialMedia");

        const rows = yield* simpleList(
          "offices.list",
          ddfOffices,
          officeColumns,
          officeFieldPresets.card,
          clauses.length > 0 ? and(...clauses) : undefined,
          { ...options, include: undefined },
          hidden,
        );
        return yield* withOfficeIncludes(rows, options, hidden);
      }),
    },
    openHouses: {
      get: Effect.fn("DdfDbClient.openHouses.get")(function* (
        openHouseKey: string,
        options?: GetOptions<OpenHouseField, OpenHouseInclude>,
      ) {
        const rows = yield* simpleList(
          "openHouses.get",
          ddfOpenHouses,
          openHouseColumns,
          openHouseFieldPresets.detail,
          eq(ddfOpenHouses.openHouseKey, openHouseKey),
          { ...options, limit: 1, include: undefined },
          ["listingKey"],
        );
        const included = yield* withOpenHouseIncludes(rows, options, [
          "listingKey",
        ]);
        return included[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.openHouses.list")(function* (
        options?: ListOptions<
          OpenHouseField,
          { readonly listingKey?: string },
          OpenHouseInclude
        >,
      ) {
        const where =
          options?.filters?.listingKey === undefined
            ? undefined
            : eq(ddfOpenHouses.listingKey, options.filters.listingKey);
        const rows = yield* simpleList(
          "openHouses.list",
          ddfOpenHouses,
          openHouseColumns,
          openHouseFieldPresets.card,
          where,
          { ...options, include: undefined },
          ["listingKey"],
        );
        return yield* withOpenHouseIncludes(rows, options, ["listingKey"]);
      }),
    },
    destinations: {
      get: Effect.fn("DdfDbClient.destinations.get")(function* (
        destinationId: number,
        options?: GetOptions<DestinationField, never>,
      ) {
        const rows = yield* simpleList(
          "destinations.get",
          ddfDestinations,
          destinationColumns,
          [
            "destinationId",
            "destinationName",
            "destinationUrl",
            "destinationType",
            "destinationStatus",
          ],
          eq(ddfDestinations.destinationId, destinationId),
          { ...options, limit: 1 },
        );
        return rows[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.destinations.list")(function* (
        options?: ListOptions<
          DestinationField,
          { readonly destinationStatus?: string },
          never
        >,
      ) {
        const where =
          options?.filters?.destinationStatus === undefined
            ? undefined
            : eq(
                ddfDestinations.destinationStatus,
                options.filters.destinationStatus,
              );
        return yield* simpleList(
          "destinations.list",
          ddfDestinations,
          destinationColumns,
          [
            "destinationId",
            "destinationName",
            "destinationUrl",
            "destinationType",
            "destinationStatus",
          ],
          where,
          options,
        );
      }),
    },
  };
});

export class DdfDbClient extends Context.Service<DdfDbClient>()(
  "crea-ddf-effect-sdk/db/client/DdfDbClient",
  { make: makeDdfDbClient() },
) {
  static readonly layer = Layer.effect(this, this.make);
}
