import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgColumn, PgTable, SelectedFields } from "drizzle-orm/pg-core";
import { Context, Data, Effect, Layer } from "effect";
import { DdfDatabase } from "./layer";
import {
  ddfDestinations,
  ddfMedia,
  ddfMemberDesignations,
  ddfMemberLanguages,
  ddfMembers,
  ddfOffices,
  ddfOpenHouses,
  ddfProperties,
  ddfPropertyRooms,
  ddfSocialMedia,
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
  readonly orderBy?: ReadonlyArray<{ readonly field: Field; readonly direction: Direction }>;
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
  new DdfDbClientError({ operation, message: "DDF database query failed", cause });

const rawField = "raw";

const propertyColumns = {
  ...getTableColumns(ddfProperties),
} satisfies FieldMap<string>;
export type PropertyField = keyof typeof propertyColumns;

const memberColumns = {
  ...getTableColumns(ddfMembers),
  phone: ddfMembers.officePhone,
} satisfies FieldMap<string>;
export type MemberField = keyof typeof memberColumns;

const officeColumns = {
  ...getTableColumns(ddfOffices),
} satisfies FieldMap<string>;
export type OfficeField = keyof typeof officeColumns;

const openHouseColumns = {
  ...getTableColumns(ddfOpenHouses),
} satisfies FieldMap<string>;
export type OpenHouseField = keyof typeof openHouseColumns;

const mediaColumns = {
  ...getTableColumns(ddfMedia),
} satisfies FieldMap<string>;
export type MediaField = keyof typeof mediaColumns;

const roomColumns = {
  ...getTableColumns(ddfPropertyRooms),
} satisfies FieldMap<string>;
export type PropertyRoomField = keyof typeof roomColumns;

const socialMediaColumns = {
  ...getTableColumns(ddfSocialMedia),
} satisfies FieldMap<string>;
export type SocialMediaField = keyof typeof socialMediaColumns;

const memberLanguageColumns = {
  ...getTableColumns(ddfMemberLanguages),
} satisfies FieldMap<string>;
export type MemberLanguageField = keyof typeof memberLanguageColumns;

const memberDesignationColumns = {
  ...getTableColumns(ddfMemberDesignations),
} satisfies FieldMap<string>;
export type MemberDesignationField = keyof typeof memberDesignationColumns;

const destinationColumns = {
  ...getTableColumns(ddfDestinations),
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
    "listAgentKey",
    "listOfficeKey",
    "modificationTimestamp",
  ],
} as const satisfies Record<string, RowSelect<PropertyField>>;

export const memberFieldPresets = {
  card: ["memberKey", "firstName", "lastName", "phone", "officeKey"],
  detail: ["memberKey", "firstName", "lastName", "phone", "city", "province", "officeKey"],
} as const satisfies Record<string, RowSelect<MemberField>>;

export const officeFieldPresets = {
  card: ["officeKey", "officeName", "phone", "city", "province"],
  detail: ["officeKey", "officeName", "phone", "city", "province", "modificationTimestamp"],
} as const satisfies Record<string, RowSelect<OfficeField>>;

export const openHouseFieldPresets = {
  card: ["openHouseKey", "listingKey", "openHouseDate", "openHouseStartTime"],
  detail: ["openHouseKey", "listingKey", "openHouseDate", "openHouseStartTime", "openHouseEndTime"],
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
  return { fields: Array.from(fields), includesRaw: fields.has(rawField as Field) };
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
  if (filters?.active !== undefined) clauses.push(eq(ddfProperties.active, filters.active));
  if (filters?.standardStatus !== undefined) clauses.push(eq(ddfProperties.standardStatus, filters.standardStatus));
  if (filters?.city !== undefined) clauses.push(eq(ddfProperties.city, filters.city));
  if (filters?.province !== undefined) clauses.push(eq(ddfProperties.province, filters.province));
  if (filters?.propertySubType !== undefined) clauses.push(eq(ddfProperties.propertySubType, filters.propertySubType));
  if (filters?.minPrice !== undefined) clauses.push(sql`${ddfProperties.listPrice} >= ${filters.minPrice}`);
  if (filters?.maxPrice !== undefined) clauses.push(sql`${ddfProperties.listPrice} <= ${filters.maxPrice}`);
  if (filters?.minBedrooms !== undefined) clauses.push(sql`${ddfProperties.bedroomsTotal} >= ${filters.minBedrooms}`);
  if (filters?.minBathrooms !== undefined) clauses.push(sql`${ddfProperties.bathroomsTotalInteger} >= ${filters.minBathrooms}`);
  return clauses.length === 0 ? undefined : and(...clauses);
};

const validatePage = Effect.fn("DdfDbClient.validatePage")(function* (operation: string, limit?: number, offset?: number) {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
    return yield* new DdfDbClientValidationError({ operation, message: "limit must be an integer from 1 to 500" });
  }
  if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
    return yield* new DdfDbClientValidationError({ operation, message: "offset must be a non-negative integer" });
  }
});

export const validateListOptions = Effect.fn("DdfDbClient.validateListOptions")(function* <Field extends string, Filter, Include>(
  operation: string,
  options?: ListOptions<Field, Filter, Include>,
) {
  yield* validatePage(operation, options?.limit, options?.offset);
});

const orderExpressions = <Field extends string>(
  columns: FieldMap<Field>,
  orderBy?: ReadonlyArray<{ readonly field: Field; readonly direction: Direction }>,
) => orderBy?.map((order) => order.direction === "asc" ? asc(columns[order.field]) : desc(columns[order.field]));

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
  Array.from(new Set(rows.flatMap((row) => typeof row[key] === "string" ? [row[key]] : [])));

const withoutHiddenRaw = <Row extends DbRow>(row: Row, includeRaw?: boolean): DbRow => {
  if (includeRaw === true || !(rawField in row)) return row;
  const { raw: _raw, ...rest } = row;
  return rest;
};

const appendGroup = (rows: DbRows, property: string, grouped: Map<string, DbRows>, key = "listingKey") =>
  rows.map((row) => ({ ...row, [property]: typeof row[key] === "string" ? grouped.get(row[key]) ?? [] : [] }));

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

const coListAgentFields = ["coListAgentKey", "coListAgentKey2", "coListAgentKey3"] as const;
const coListOfficeFields = ["coListOfficeKey", "coListOfficeKey2", "coListOfficeKey3"] as const;

const uniqueStringFields = (row: DbRow, fields: ReadonlyArray<string>) => {
  const values = new Set<string>();
  for (const field of fields) {
    const value = row[field];
    if (typeof value === "string" && value.length > 0) values.add(value);
  }
  return Array.from(values);
};

export const coListAgentKeysFromRow = (row: DbRow) => uniqueStringFields(row, coListAgentFields);

export const coListOfficeKeysFromRow = (row: DbRow) => uniqueStringFields(row, coListOfficeFields);

const valuesForKeys = (keys: ReadonlyArray<string>, rowsByKey: Map<DbValue, DbRow>) =>
  keys.flatMap((key) => {
    const row = rowsByKey.get(key);
    return row === undefined ? [] : [row];
  });

const makeDdfDbClient = Effect.fn("DdfDbClient.make")(function* () {
  const { db } = yield* DdfDatabase;

  const queryProperties = Effect.fn("DdfDbClient.properties.query")(function* (options?: ListOptions<PropertyField, PropertyFilters, PropertyInclude>, whereKey?: string) {
    yield* validateListOptions("properties.list", options);
    const include = options?.include;
    const hidden: PropertyField[] = [];
    if (include?.openHouses !== undefined || include?.media !== undefined || include?.rooms !== undefined) hidden.push("listingKey");
    if (include?.listAgent !== undefined) hidden.push("listAgentKey");
    if (include?.listOffice !== undefined) hidden.push("listOfficeKey");
    if (include?.coListAgents !== undefined) hidden.push("coListAgentKey", "coListAgentKey2", "coListAgentKey3");
    if (include?.coListOffices !== undefined) hidden.push("coListOfficeKey", "coListOfficeKey2", "coListOfficeKey3");
    let query = db.select(selectionFor(propertyColumns, propertyFieldPresets.detail, options, hidden)).from(ddfProperties).$dynamic();
    const filters = whereKey === undefined ? propertyWhere(options?.filters) : eq(ddfProperties.listingKey, whereKey);
    if (filters !== undefined) query = query.where(filters);
    if (options?.limit !== undefined) query = query.limit(options.limit);
    if (options?.offset !== undefined) query = query.offset(options.offset);
    const orders = orderExpressions(propertyColumns, options?.orderBy);
    if (orders !== undefined && orders.length > 0) query = query.orderBy(...orders);
    const rows = yield* query.pipe(Effect.mapError(mapClientError("properties.query")));
    return yield* withPropertyIncludes(rows, include, options?.includeRaw);
  });

  const withPropertyIncludes = Effect.fn("DdfDbClient.properties.include")(function* (rows: DbRows, include?: PropertyInclude, includeRaw?: boolean) {
    let result = rows;
    if (rows.length === 0 || include === undefined) return result.map((row) => withoutHiddenRaw(row, includeRaw));
    const listingKeys = stringValues(rows, "listingKey");
    if (include.media !== undefined && listingKeys.length > 0) {
      const mediaRows = yield* db.select(selectionFor(mediaColumns, ["mediaKey", "mediaUrl", "sortOrder"], include.media, ["resourceKey"])).from(ddfMedia).where(and(eq(ddfMedia.resource, "Property"), inArray(ddfMedia.resourceKey, listingKeys))).orderBy(asc(ddfMedia.sortOrder)).pipe(Effect.mapError(mapClientError("properties.media")));
      result = appendGroup(result, "media", groupByKey(mediaRows, "resourceKey"));
    }
    if (include.openHouses !== undefined && listingKeys.length > 0) {
      const openHouseRows = yield* db.select(selectionFor(openHouseColumns, openHouseFieldPresets.card, include.openHouses, ["listingKey"])).from(ddfOpenHouses).where(inArray(ddfOpenHouses.listingKey, listingKeys)).pipe(Effect.mapError(mapClientError("properties.openHouses")));
      result = appendGroup(result, "openHouses", groupByKey(openHouseRows, "listingKey"));
    }
    if (include.rooms !== undefined && listingKeys.length > 0) {
      const roomRows = yield* db.select(selectionFor(roomColumns, ["roomKey", "roomType", "roomLevel"], include.rooms, ["listingKey"])).from(ddfPropertyRooms).where(inArray(ddfPropertyRooms.listingKey, listingKeys)).pipe(Effect.mapError(mapClientError("properties.rooms")));
      result = appendGroup(result, "rooms", groupByKey(roomRows, "listingKey"));
    }
    if (include.listAgent !== undefined) {
      const agentKeys = stringValues(rows, "listAgentKey");
      const agents = agentKeys.length === 0 ? [] : yield* db.select(selectionFor(memberColumns, memberFieldPresets.card, include.listAgent, ["memberKey"])).from(ddfMembers).where(inArray(ddfMembers.memberKey, agentKeys)).pipe(Effect.mapError(mapClientError("properties.listAgent")));
      const byKey = new Map(agents.map((agent) => [agent.memberKey, agent]));
      result = result.map((row) => ({ ...row, listAgent: typeof row.listAgentKey === "string" ? byKey.get(row.listAgentKey) ?? null : null }));
    }
    if (include.listOffice !== undefined) {
      const officeKeys = stringValues(rows, "listOfficeKey");
      const offices = officeKeys.length === 0 ? [] : yield* db.select(selectionFor(officeColumns, officeFieldPresets.card, include.listOffice, ["officeKey"])).from(ddfOffices).where(inArray(ddfOffices.officeKey, officeKeys)).pipe(Effect.mapError(mapClientError("properties.listOffice")));
      const byKey = new Map(offices.map((office) => [office.officeKey, office]));
      result = result.map((row) => ({ ...row, listOffice: typeof row.listOfficeKey === "string" ? byKey.get(row.listOfficeKey) ?? null : null }));
    }
    if (include.coListAgents !== undefined) {
      const agentKeys = Array.from(new Set(rows.flatMap((row) => coListAgentKeysFromRow(row))));
      const agents = agentKeys.length === 0 ? [] : yield* db.select(selectionFor(memberColumns, memberFieldPresets.card, include.coListAgents, ["memberKey"])).from(ddfMembers).where(inArray(ddfMembers.memberKey, agentKeys)).pipe(Effect.mapError(mapClientError("properties.coListAgents")));
      const byKey = new Map(agents.map((agent) => [agent.memberKey, agent]));
      result = result.map((row) => ({ ...row, coListAgents: valuesForKeys(coListAgentKeysFromRow(row), byKey) }));
    }
    if (include.coListOffices !== undefined) {
      const officeKeys = Array.from(new Set(rows.flatMap((row) => coListOfficeKeysFromRow(row))));
      const offices = officeKeys.length === 0 ? [] : yield* db.select(selectionFor(officeColumns, officeFieldPresets.card, include.coListOffices, ["officeKey"])).from(ddfOffices).where(inArray(ddfOffices.officeKey, officeKeys)).pipe(Effect.mapError(mapClientError("properties.coListOffices")));
      const byKey = new Map(offices.map((office) => [office.officeKey, office]));
      result = result.map((row) => ({ ...row, coListOffices: valuesForKeys(coListOfficeKeysFromRow(row), byKey) }));
    }
    return result.map((row) => withoutHiddenRaw(row, includeRaw));
  });

  const withMemberIncludes = Effect.fn("DdfDbClient.members.include")(function* (rows: DbRows, include?: MemberInclude, includeRaw?: boolean) {
    let result = rows;
    if (rows.length === 0 || include === undefined) return result.map((row) => withoutHiddenRaw(row, includeRaw));
    const memberKeys = stringValues(rows, "memberKey");
    if (include.media !== undefined && memberKeys.length > 0) {
      const mediaRows = yield* db.select(selectionFor(mediaColumns, ["mediaKey", "mediaUrl", "sortOrder"], include.media, ["resourceKey"])).from(ddfMedia).where(and(eq(ddfMedia.resource, "Member"), inArray(ddfMedia.resourceKey, memberKeys))).orderBy(asc(ddfMedia.sortOrder)).pipe(Effect.mapError(mapClientError("members.media")));
      result = appendGroup(result, "media", groupByKey(mediaRows, "resourceKey"), "memberKey");
    }
    if (include.office !== undefined) {
      const officeKeys = stringValues(rows, "officeKey");
      const offices = officeKeys.length === 0 ? [] : yield* db.select(selectionFor(officeColumns, officeFieldPresets.card, include.office, ["officeKey"])).from(ddfOffices).where(inArray(ddfOffices.officeKey, officeKeys)).pipe(Effect.mapError(mapClientError("members.office")));
      const byKey = new Map(offices.map((office) => [office.officeKey, office]));
      result = result.map((row) => ({ ...row, office: typeof row.officeKey === "string" ? byKey.get(row.officeKey) ?? null : null }));
    }
    if (include.socialMedia !== undefined && memberKeys.length > 0) {
      const socialRows = yield* db
        .select(selectionFor(socialMediaColumns, ["socialMediaKey", "socialMediaType", "socialMediaUrlOrId"], include.socialMedia, ["resourceKey"]))
        .from(ddfSocialMedia)
        .where(and(eq(ddfSocialMedia.resource, "Member"), inArray(ddfSocialMedia.resourceKey, memberKeys)))
        .pipe(Effect.mapError(mapClientError("members.socialMedia")));
      result = appendGroup(result, "socialMedia", groupByKey(socialRows, "resourceKey"), "memberKey");
    }
    if (include.languages !== undefined && memberKeys.length > 0) {
      const languageRows = yield* db
        .select(selectionFor(memberLanguageColumns, ["memberKey", "language"], include.languages, ["memberKey"]))
        .from(ddfMemberLanguages)
        .where(inArray(ddfMemberLanguages.memberKey, memberKeys))
        .pipe(Effect.mapError(mapClientError("members.languages")));
      result = appendGroup(result, "languages", groupByKey(languageRows, "memberKey"), "memberKey");
    }
    if (include.designations !== undefined && memberKeys.length > 0) {
      const designationRows = yield* db
        .select(selectionFor(memberDesignationColumns, ["memberKey", "designation"], include.designations, ["memberKey"]))
        .from(ddfMemberDesignations)
        .where(inArray(ddfMemberDesignations.memberKey, memberKeys))
        .pipe(Effect.mapError(mapClientError("members.designations")));
      result = appendGroup(result, "designations", groupByKey(designationRows, "memberKey"), "memberKey");
    }
    return result.map((row) => withoutHiddenRaw(row, includeRaw));
  });

  const withOfficeIncludes = Effect.fn("DdfDbClient.offices.include")(function* (rows: DbRows, include?: OfficeInclude, includeRaw?: boolean) {
    let result = rows;
    if (rows.length === 0 || include === undefined) return result.map((row) => withoutHiddenRaw(row, includeRaw));
    const officeKeys = stringValues(rows, "officeKey");
    if (include.media !== undefined && officeKeys.length > 0) {
      const mediaRows = yield* db.select(selectionFor(mediaColumns, ["mediaKey", "mediaUrl", "sortOrder"], include.media, ["resourceKey"])).from(ddfMedia).where(and(eq(ddfMedia.resource, "Office"), inArray(ddfMedia.resourceKey, officeKeys))).orderBy(asc(ddfMedia.sortOrder)).pipe(Effect.mapError(mapClientError("offices.media")));
      result = appendGroup(result, "media", groupByKey(mediaRows, "resourceKey"), "officeKey");
    }
    if (include.members !== undefined && officeKeys.length > 0) {
      const memberRows = yield* db.select(selectionFor(memberColumns, memberFieldPresets.card, include.members, ["officeKey"])).from(ddfMembers).where(inArray(ddfMembers.officeKey, officeKeys)).pipe(Effect.mapError(mapClientError("offices.members")));
      result = appendGroup(result, "members", groupByKey(memberRows, "officeKey"), "officeKey");
    }
    if (include.properties !== undefined && officeKeys.length > 0) {
      const propertyRows = yield* db.select(selectionFor(propertyColumns, propertyFieldPresets.card, include.properties, ["listOfficeKey"])).from(ddfProperties).where(inArray(ddfProperties.listOfficeKey, officeKeys)).pipe(Effect.mapError(mapClientError("offices.properties")));
      result = appendGroup(result, "properties", groupByKey(propertyRows, "listOfficeKey"), "officeKey");
    }
    if (include.socialMedia !== undefined && officeKeys.length > 0) {
      const socialRows = yield* db
        .select(selectionFor(socialMediaColumns, ["socialMediaKey", "socialMediaType", "socialMediaUrlOrId"], include.socialMedia, ["resourceKey"]))
        .from(ddfSocialMedia)
        .where(and(eq(ddfSocialMedia.resource, "Office"), inArray(ddfSocialMedia.resourceKey, officeKeys)))
        .pipe(Effect.mapError(mapClientError("offices.socialMedia")));
      result = appendGroup(result, "socialMedia", groupByKey(socialRows, "resourceKey"), "officeKey");
    }
    return result.map((row) => withoutHiddenRaw(row, includeRaw));
  });

  const withOpenHouseIncludes = Effect.fn("DdfDbClient.openHouses.include")(function* (rows: DbRows, include?: OpenHouseInclude, includeRaw?: boolean) {
    let result = rows;
    if (rows.length === 0 || include?.property === undefined) return result.map((row) => withoutHiddenRaw(row, includeRaw));
    const listingKeys = stringValues(rows, "listingKey");
    const propertyRows = listingKeys.length === 0 ? [] : yield* db.select(selectionFor(propertyColumns, propertyFieldPresets.card, include.property, ["listingKey"])).from(ddfProperties).where(inArray(ddfProperties.listingKey, listingKeys)).pipe(Effect.mapError(mapClientError("openHouses.property")));
    const byKey = new Map(propertyRows.map((property) => [property.listingKey, property]));
    result = result.map((row) => ({ ...row, property: typeof row.listingKey === "string" ? byKey.get(row.listingKey) ?? null : null }));
    return result.map((row) => withoutHiddenRaw(row, includeRaw));
  });


  const simpleList = <Field extends string, Filter>(name: string, table: PgTable, columns: FieldMap<Field>, defaults: RowSelect<Field>, where?: SQL, options?: ListOptions<Field, Filter, unknown>, hiddenFields: RowSelect<Field> = []) =>
    Effect.gen(function* () {
      yield* validateListOptions(name, options);
      let query = db.select(selectionFor(columns, defaults, options, hiddenFields)).from(table).$dynamic();
      if (where !== undefined) query = query.where(where);
      if (options?.limit !== undefined) query = query.limit(options.limit);
      if (options?.offset !== undefined) query = query.offset(options.offset);
      const orders = orderExpressions(columns, options?.orderBy);
      if (orders !== undefined && orders.length > 0) query = query.orderBy(...orders);
      return yield* query.pipe(Effect.mapError(mapClientError(name)));
    });

  const getOne = <Field extends string>(name: string, table: PgTable, columns: FieldMap<Field>, defaults: RowSelect<Field>, keyColumn: PgColumn, key: string, options?: BaseOptions<Field>) =>
    Effect.gen(function* () {
      const rows = yield* simpleList(name, table, columns, defaults, eq(keyColumn, key), { ...options, limit: 1 });
      return rows[0] ?? null;
    });

  const mediaList = Effect.fn("DdfDbClient.media.list")(function* (options?: ListOptions<MediaField, { readonly resource?: "Office" | "Property" | "Member" | "OpenHouse"; readonly resourceKey?: string }, never>) {
    const filters = options?.filters;
    const clauses: SQL[] = [];
    if (filters?.resource !== undefined) clauses.push(eq(ddfMedia.resource, filters.resource));
    if (filters?.resourceKey !== undefined) clauses.push(eq(ddfMedia.resourceKey, filters.resourceKey));
    return yield* simpleList("media.list", ddfMedia, mediaColumns, ["mediaKey", "resource", "resourceKey", "mediaUrl", "sortOrder"], clauses.length > 0 ? and(...clauses) : undefined, options);
  });

  return {
    properties: {
      get: Effect.fn("DdfDbClient.properties.get")(function* (listingKey: string, options?: GetOptions<PropertyField, PropertyInclude>) {
        const rows = yield* queryProperties({ ...options, limit: 1 }, listingKey);
        return rows[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.properties.list")(function* (options?: ListOptions<PropertyField, PropertyFilters, PropertyInclude>) {
        return yield* queryProperties(options);
      }),
    },
    members: {
      get: Effect.fn("DdfDbClient.members.get")(function* (memberKey: string, options?: GetOptions<MemberField, MemberInclude>) {
        const include = options?.include;
        const hidden: MemberField[] = ["memberKey", "officeKey"];

        const rows = yield* simpleList("members.get", ddfMembers, memberColumns, memberFieldPresets.detail, eq(ddfMembers.memberKey, memberKey), { ...options, limit: 1, select: options?.select, includeRaw: options?.includeRaw, include: undefined }, hidden);
        const included = yield* withMemberIncludes(rows, include, options?.includeRaw);
        return included[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.members.list")(function* (options?: ListOptions<MemberField, { readonly active?: boolean; readonly officeKey?: string }, MemberInclude>) {
        const filters = options?.filters;
        const clauses: SQL[] = [];
        if (filters?.active !== undefined) clauses.push(eq(ddfMembers.active, filters.active));
        if (filters?.officeKey !== undefined) clauses.push(eq(ddfMembers.officeKey, filters.officeKey));
        const include = options?.include;
        const hidden: MemberField[] = ["memberKey", "officeKey"];

        const rows = yield* simpleList("members.list", ddfMembers, memberColumns, memberFieldPresets.card, clauses.length > 0 ? and(...clauses) : undefined, { ...options, include: undefined }, hidden);
        return yield* withMemberIncludes(rows, include, options?.includeRaw);
      }),
    },
    offices: {
      get: Effect.fn("DdfDbClient.offices.get")(function* (officeKey: string, options?: GetOptions<OfficeField, OfficeInclude>) {
        const include = options?.include;
        const hidden: OfficeField[] = ["officeKey"];

        const rows = yield* simpleList("offices.get", ddfOffices, officeColumns, officeFieldPresets.detail, eq(ddfOffices.officeKey, officeKey), { ...options, limit: 1, include: undefined }, hidden);
        const included = yield* withOfficeIncludes(rows, include, options?.includeRaw);
        return included[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.offices.list")(function* (options?: ListOptions<OfficeField, { readonly active?: boolean; readonly city?: string; readonly province?: string }, OfficeInclude>) {
        const filters = options?.filters;
        const clauses: SQL[] = [];
        if (filters?.active !== undefined) clauses.push(eq(ddfOffices.active, filters.active));
        if (filters?.city !== undefined) clauses.push(eq(ddfOffices.city, filters.city));
        if (filters?.province !== undefined) clauses.push(eq(ddfOffices.province, filters.province));
        const include = options?.include;
        const hidden: OfficeField[] = ["officeKey"];

        const rows = yield* simpleList("offices.list", ddfOffices, officeColumns, officeFieldPresets.card, clauses.length > 0 ? and(...clauses) : undefined, { ...options, include: undefined }, hidden);
        return yield* withOfficeIncludes(rows, include, options?.includeRaw);
      }),
    },
    openHouses: {
      get: Effect.fn("DdfDbClient.openHouses.get")(function* (openHouseKey: string, options?: GetOptions<OpenHouseField, OpenHouseInclude>) {
        const rows = yield* simpleList("openHouses.get", ddfOpenHouses, openHouseColumns, openHouseFieldPresets.detail, eq(ddfOpenHouses.openHouseKey, openHouseKey), { ...options, limit: 1, include: undefined }, ["listingKey"]);
        const included = yield* withOpenHouseIncludes(rows, options?.include, options?.includeRaw);
        return included[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.openHouses.list")(function* (options?: ListOptions<OpenHouseField, { readonly listingKey?: string }, OpenHouseInclude>) {
        const where = options?.filters?.listingKey === undefined ? undefined : eq(ddfOpenHouses.listingKey, options.filters.listingKey);
        const rows = yield* simpleList("openHouses.list", ddfOpenHouses, openHouseColumns, openHouseFieldPresets.card, where, { ...options, include: undefined }, ["listingKey"]);
        return yield* withOpenHouseIncludes(rows, options?.include, options?.includeRaw);
      }),
    },
    media: {
      get: Effect.fn("DdfDbClient.media.get")(function* (mediaKey: string, options?: GetOptions<MediaField, never>) {
        return yield* getOne("media.get", ddfMedia, mediaColumns, ["mediaKey", "resource", "resourceKey", "mediaUrl", "sortOrder"], ddfMedia.mediaKey, mediaKey, options);
      }),
      list: mediaList,
    },
    propertyRooms: {
      get: Effect.fn("DdfDbClient.propertyRooms.get")(function* (roomKey: string, options?: GetOptions<PropertyRoomField, never>) {
        return yield* getOne("propertyRooms.get", ddfPropertyRooms, roomColumns, ["roomKey", "roomType", "roomLevel"], ddfPropertyRooms.roomKey, roomKey, options);
      }),
      list: Effect.fn("DdfDbClient.propertyRooms.list")(function* (options?: ListOptions<PropertyRoomField, { readonly listingKey?: string }, never>) {
        const where = options?.filters?.listingKey === undefined ? undefined : eq(ddfPropertyRooms.listingKey, options.filters.listingKey);
        return yield* simpleList("propertyRooms.list", ddfPropertyRooms, roomColumns, ["roomKey", "roomType", "roomLevel"], where, options);
      }),
    },
    socialMedia: {
      get: Effect.fn("DdfDbClient.socialMedia.get")(function* (socialMediaKey: string, options?: GetOptions<SocialMediaField, never>) {
        return yield* getOne("socialMedia.get", ddfSocialMedia, socialMediaColumns, ["socialMediaKey", "resource", "resourceKey", "socialMediaType", "socialMediaUrlOrId"], ddfSocialMedia.socialMediaKey, socialMediaKey, options);
      }),
      list: Effect.fn("DdfDbClient.socialMedia.list")(function* (options?: ListOptions<SocialMediaField, { readonly resource?: "Member" | "Office"; readonly resourceKey?: string }, never>) {
        const filters = options?.filters;
        const clauses: SQL[] = [];
        if (filters?.resource !== undefined) clauses.push(eq(ddfSocialMedia.resource, filters.resource));
        if (filters?.resourceKey !== undefined) clauses.push(eq(ddfSocialMedia.resourceKey, filters.resourceKey));
        return yield* simpleList("socialMedia.list", ddfSocialMedia, socialMediaColumns, ["socialMediaKey", "resource", "resourceKey", "socialMediaType", "socialMediaUrlOrId"], clauses.length > 0 ? and(...clauses) : undefined, options);
      }),
    },
    memberLanguages: {
      get: Effect.fn("DdfDbClient.memberLanguages.get")(function* (memberKey: string, options?: GetOptions<MemberLanguageField, never>) {
        const rows = yield* simpleList("memberLanguages.get", ddfMemberLanguages, memberLanguageColumns, ["memberKey", "language"], eq(ddfMemberLanguages.memberKey, memberKey), { ...options, limit: 1 });
        return rows[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.memberLanguages.list")(function* (options?: ListOptions<MemberLanguageField, { readonly memberKey?: string }, never>) {
        const where = options?.filters?.memberKey === undefined ? undefined : eq(ddfMemberLanguages.memberKey, options.filters.memberKey);
        return yield* simpleList("memberLanguages.list", ddfMemberLanguages, memberLanguageColumns, ["memberKey", "language"], where, options);
      }),
    },
    memberDesignations: {
      get: Effect.fn("DdfDbClient.memberDesignations.get")(function* (memberKey: string, options?: GetOptions<MemberDesignationField, never>) {
        const rows = yield* simpleList("memberDesignations.get", ddfMemberDesignations, memberDesignationColumns, ["memberKey", "designation"], eq(ddfMemberDesignations.memberKey, memberKey), { ...options, limit: 1 });
        return rows[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.memberDesignations.list")(function* (options?: ListOptions<MemberDesignationField, { readonly memberKey?: string }, never>) {
        const where = options?.filters?.memberKey === undefined ? undefined : eq(ddfMemberDesignations.memberKey, options.filters.memberKey);
        return yield* simpleList("memberDesignations.list", ddfMemberDesignations, memberDesignationColumns, ["memberKey", "designation"], where, options);
      }),
    },
    destinations: {
      get: Effect.fn("DdfDbClient.destinations.get")(function* (destinationId: number, options?: GetOptions<DestinationField, never>) {
        const rows = yield* simpleList("destinations.get", ddfDestinations, destinationColumns, ["destinationId", "destinationName", "destinationUrl", "destinationType", "destinationStatus"], eq(ddfDestinations.destinationId, destinationId), { ...options, limit: 1 });
        return rows[0] ?? null;
      }),
      list: Effect.fn("DdfDbClient.destinations.list")(function* (options?: ListOptions<DestinationField, { readonly destinationStatus?: string }, never>) {
        const where = options?.filters?.destinationStatus === undefined ? undefined : eq(ddfDestinations.destinationStatus, options.filters.destinationStatus);
        return yield* simpleList("destinations.list", ddfDestinations, destinationColumns, ["destinationId", "destinationName", "destinationUrl", "destinationType", "destinationStatus"], where, options);
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
