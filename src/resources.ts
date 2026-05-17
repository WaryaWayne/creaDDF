import { Data, Effect, Schema } from "effect";
import { DdfHttp, encodeODataQuery } from "#/client";
import type { DdfHttpError, DdfResponseSchema } from "#/client";
import { MemberResponseSchema, MemberSchema } from "#/schema/memberSchema";
import {
  DestinationResponseSchema,
  DestinationSchema,
} from "#/schema/destinationSchema";
import { OfficeResponseSchema, OfficeSchema } from "#/schema/officeSchema";
import { OpenHouseResponseSchema, OpenHouseSchema } from "#/schema/openHouse";
import {
  MultiplePropertyListingResponseSchema,
  PropertyListingSchema,
  SinglePropertyListingResponseSchema,
} from "#/schema/propertyListingsSchema";
import {
  MemberReplicationIdentifierResponseSchema,
  OfficeReplicationIdentifierResponseSchema,
  PropertyReplicationIdentifierResponseSchema,
  type ODataListEnvelope,
} from "#/schema/odata";
import {
  entitySchemaForSelect,
  listSchemaForSelect,
} from "#/schema/select";
import type {
  LeadInput,
  ODataGetQuery,
  ODataListQuery,
  ReplicationQuery,
} from "#/types";

const replicationPath = (
  resource: "Property" | "Member" | "Office",
  replicationName: string,
  destinationId?: number,
) =>
  destinationId === undefined
    ? `/odata/v1/${resource}/${replicationName}`
    : `/odata/v1/${resource}/${replicationName}(DestinationId=${destinationId})`;

type SelectQuery = { readonly select?: ReadonlyArray<string> };

const hasSelect = (query?: SelectQuery) =>
  query?.select !== undefined && query.select.length > 0;

const partialStruct = <Fields extends Schema.Struct.Fields>(
  schema: Schema.Struct<Fields>,
) =>
  schema.mapFields(
    (fields) =>
      Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [
          key,
          Schema.optionalKey(field),
        ]),
      ) as { readonly [Key in keyof Fields]: Schema.optionalKey<Fields[Key]> },
  );

const selectedEntitySchema = <Fields extends Schema.Struct.Fields>(
  schema: Schema.Struct<Fields>,
) =>
  Schema.Struct({
    "@odata.context": Schema.optionalKey(Schema.NullOr(Schema.String)),
    ...partialStruct(schema).fields,
  });

const schemaForSelect = <Full, Selected>(
  query: SelectQuery | undefined,
  selectedSchema: DdfResponseSchema<Selected>,
  fullSchema: DdfResponseSchema<Full>,
): DdfResponseSchema<Full> | DdfResponseSchema<Selected> =>
  hasSelect(query) ? selectedSchema : fullSchema;

const withDefaultOrder = <Query extends ODataListQuery | ReplicationQuery>(
  query: Query | undefined,
  orderby: string,
): Query => ({ ...query, orderby: query?.orderby ?? orderby }) as Query;

const listOrder = {
  Property: "ModificationTimestamp desc,ListingKey asc",
  Member: "ModificationTimestamp desc,MemberKey asc",
  Office: "ModificationTimestamp desc,OfficeKey asc",
  OpenHouse: "OpenHouseDate desc,OpenHouseKey asc",
  Destination: "DestinationId asc",
} as const;

const syncOrder = {
  Property: "ModificationTimestamp asc,ListingKey asc",
  Member: "ModificationTimestamp asc,MemberKey asc",
  Office: "ModificationTimestamp asc,OfficeKey asc",
} as const;


type ResourceEffect<Success> = Effect.Effect<Success, DdfHttpError, DdfHttp>;
type SelectedEntity<Full, Field extends keyof Full & string> = Partial<
  Pick<Full, Field>
> & {
  readonly "@odata.context"?: string | null;
};
type SelectedQuery<Field extends string, Select extends ReadonlyArray<Field>> =
  Omit<ODataListQuery<Field>, "select"> & { readonly select: Select };
type SelectedGetQuery<Field extends string, Select extends ReadonlyArray<Field>> =
  Omit<ODataGetQuery<Field>, "select"> & { readonly select: Select };
type ListResource<Full, Field extends keyof Full & string> = {
  <const Select extends ReadonlyArray<Field>>(
    query: SelectedQuery<Field, Select>,
  ): ResourceEffect<ODataListEnvelope<SelectedEntity<Full, Select[number]>>>;
  (query?: ODataListQuery<Field>): ResourceEffect<ODataListEnvelope<Full>>;
};
type GetResource<Key extends string | number, Full, Field extends keyof Full & string> = {
  <const Select extends ReadonlyArray<Field>>(
    key: Key,
    query: SelectedGetQuery<Field, Select>,
  ): ResourceEffect<SelectedEntity<Full, Select[number]>>;
  (key: Key, query?: ODataGetQuery<Field>): ResourceEffect<Full>;
};

type PropertyListing = typeof PropertyListingSchema.Type;
type SinglePropertyListing = typeof SinglePropertyListingResponseSchema.Type;
type Member = typeof MemberSchema.Type;
type Office = typeof OfficeSchema.Type;
type OpenHouse = typeof OpenHouseSchema.Type;
type Destination = typeof DestinationSchema.Type;
type PropertyField = keyof PropertyListing & string;
type SinglePropertyField = keyof SinglePropertyListing & string;
type MemberField = keyof Member & string;
type OfficeField = keyof Office & string;
type OpenHouseField = keyof OpenHouse & string;
type DestinationField = keyof Destination & string;

const LeadInputSchema = Schema.Struct({
  Culture: Schema.Literals(["en-CA", "fr-CA"]),
  MemberKey: Schema.String,
  ListingKey: Schema.String,
  SenderName: Schema.String,
  SenderEmailAddress: Schema.String,
  SenderPhoneNumber: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  PreferredMethodContact: Schema.Literals(["email", "phone", "text"]),
  SenderPhoneExtension: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  Message: Schema.String.check(Schema.isMaxLength(500)),
});

export const LeadResponseSchema = Schema.Struct({
  details: Schema.optionalKey(Schema.NullOr(Schema.String)),
  message: Schema.optionalKey(Schema.NullOr(Schema.String)),
  code: Schema.optionalKey(Schema.NullOr(Schema.String)),
  success: Schema.Boolean,
});

export class DdfLeadInputEncodeError extends Data.TaggedError(
  "DdfLeadInputEncodeError",
)<{
  readonly cause: unknown;
}> {
  override get message() {
    return "Failed to encode DDF lead input as JSON";
  }
}

const encodeLeadInputJsonSchema = Schema.encodeEffect(
  Schema.fromJsonString(Schema.toCodecJson(LeadInputSchema)),
);

const encodeLeadInputJson = (input: LeadInput) =>
  encodeLeadInputJsonSchema(input).pipe(
    Effect.mapError((cause) => new DdfLeadInputEncodeError({ cause })),
  );

export const listProperties = Effect.fn("DdfProperty.listProperties")(
  function* (query?: ODataListQuery<PropertyField>) {
    const http = yield* DdfHttp;
    const schema = yield* listSchemaForSelect(
      "Property",
      query,
      MultiplePropertyListingResponseSchema,
      PropertyListingSchema,
    );
    return yield* http.listOData(
      "/odata/v1/Property",
      withDefaultOrder(query, listOrder.Property),
      schema,
    );
  },
) as ListResource<PropertyListing, PropertyField>;
export const getProperty = Effect.fn("DdfProperty.getProperty")(function* (
  propertyKey: string,
  query?: ODataGetQuery<SinglePropertyField>,
) {
  const http = yield* DdfHttp;
  const schema = yield* entitySchemaForSelect(
    "Property",
    query,
    SinglePropertyListingResponseSchema,
    PropertyListingSchema,
  );
  return yield* http.getOData(
    "/odata/v1/Property",
    propertyKey,
    query,
    schema,
  );
}) as GetResource<string, SinglePropertyListing, SinglePropertyField>;

export const replicateProperties = Effect.fn("DdfProperty.replicateProperties")(
  function* (query?: ReplicationQuery<PropertyField>) {
    const http = yield* DdfHttp;
    return yield* http.requestJson(
      `${replicationPath("Property", "PropertyReplication")}${encodeODataQuery(withDefaultOrder(query, syncOrder.Property))}`,
      undefined,
      PropertyReplicationIdentifierResponseSchema,
    );
  },
);
export const replicatePropertiesForDestination = Effect.fn(
  "DdfProperty.replicatePropertiesForDestination",
)(function* (destinationId: number, query?: ReplicationQuery<PropertyField>) {
  const http = yield* DdfHttp;
  return yield* http.requestJson(
    `${replicationPath("Property", "PropertyReplication", destinationId)}${encodeODataQuery(withDefaultOrder(query, syncOrder.Property))}`,
    undefined,
    PropertyReplicationIdentifierResponseSchema,
  );
});
export const listMembers = Effect.fn("DdfMember.listMembers")(function* (
  query?: ODataListQuery<MemberField>,
) {
  const http = yield* DdfHttp;
  const schema = yield* listSchemaForSelect(
    "Member",
    query,
    MemberResponseSchema,
    MemberSchema,
  );
  return yield* http.listOData(
    "/odata/v1/Member",
    withDefaultOrder(query, listOrder.Member),
    schema,
  );
}) as ListResource<Member, MemberField>;
export const getMember = Effect.fn("DdfMember.getMember")(function* (
  memberKey: string,
  query?: ODataGetQuery<MemberField>,
) {
  const http = yield* DdfHttp;
  const schema = yield* entitySchemaForSelect(
    "Member",
    query,
    MemberSchema,
    MemberSchema,
  );
  return yield* http.getOData(
    "/odata/v1/Member",
    memberKey,
    query,
    schema,
  );
}) as GetResource<string, Member, MemberField>;
export const replicateMembers = Effect.fn("DdfMember.replicateMembers")(
  function* (query?: ReplicationQuery<MemberField>) {
    const http = yield* DdfHttp;
    return yield* http.requestJson(
      `${replicationPath("Member", "MemberReplication")}${encodeODataQuery(withDefaultOrder(query, syncOrder.Member))}`,
      undefined,
      MemberReplicationIdentifierResponseSchema,
    );
  },
);
export const replicateMembersForDestination = Effect.fn(
  "DdfMember.replicateMembersForDestination",
)(function* (destinationId: number, query?: ReplicationQuery<MemberField>) {
  const http = yield* DdfHttp;
  return yield* http.requestJson(
    `${replicationPath("Member", "MemberReplication", destinationId)}${encodeODataQuery(withDefaultOrder(query, syncOrder.Member))}`,
    undefined,
    MemberReplicationIdentifierResponseSchema,
  );
});
export const listOffices = Effect.fn("DdfOffice.listOffices")(function* (
  query?: ODataListQuery<OfficeField>,
) {
  const http = yield* DdfHttp;
  const schema = yield* listSchemaForSelect(
    "Office",
    query,
    OfficeResponseSchema,
    OfficeSchema,
  );
  return yield* http.listOData(
    "/odata/v1/Office",
    withDefaultOrder(query, listOrder.Office),
    schema,
  );
}) as ListResource<Office, OfficeField>;
export const getOffice = Effect.fn("DdfOffice.getOffice")(function* (
  officeKey: string,
  query?: ODataGetQuery<OfficeField>,
) {
  const http = yield* DdfHttp;
  const schema = yield* entitySchemaForSelect(
    "Office",
    query,
    OfficeSchema,
    OfficeSchema,
  );
  return yield* http.getOData(
    "/odata/v1/Office",
    officeKey,
    query,
    schema,
  );
}) as GetResource<string, Office, OfficeField>;
export const replicateOffices = Effect.fn("DdfOffice.replicateOffices")(
  function* (query?: ReplicationQuery<OfficeField>) {
    const http = yield* DdfHttp;
    return yield* http.requestJson(
      `${replicationPath("Office", "OfficeReplication")}${encodeODataQuery(withDefaultOrder(query, syncOrder.Office))}`,
      undefined,
      OfficeReplicationIdentifierResponseSchema,
    );
  },
);
export const replicateOfficesForDestination = Effect.fn(
  "DdfOffice.replicateOfficesForDestination",
)(function* (destinationId: number, query?: ReplicationQuery<OfficeField>) {
  const http = yield* DdfHttp;
  return yield* http.requestJson(
    `${replicationPath("Office", "OfficeReplication", destinationId)}${encodeODataQuery(withDefaultOrder(query, syncOrder.Office))}`,
    undefined,
    OfficeReplicationIdentifierResponseSchema,
  );
});
export const listOpenHouses = Effect.fn("DdfOpenHouse.listOpenHouses")(
  function* (query?: ODataListQuery<OpenHouseField>) {
    const http = yield* DdfHttp;
    const schema = yield* listSchemaForSelect(
      "OpenHouse",
      query,
      OpenHouseResponseSchema,
      OpenHouseSchema,
    );
    return yield* http.listOData(
      "/odata/v1/OpenHouse",
      withDefaultOrder(query, listOrder.OpenHouse),
      schema,
    );
  },
) as ListResource<OpenHouse, OpenHouseField>;
export const getOpenHouse = Effect.fn("DdfOpenHouse.getOpenHouse")(function* (
  openHouseKey: string,
  query?: ODataGetQuery<OpenHouseField>,
) {
  const http = yield* DdfHttp;
  const schema = yield* entitySchemaForSelect(
    "OpenHouse",
    query,
    OpenHouseSchema,
    OpenHouseSchema,
  );
  return yield* http.getOData(
    "/odata/v1/OpenHouse",
    openHouseKey,
    query,
    schema,
  );
}) as GetResource<string, OpenHouse, OpenHouseField>;
export const listDestinations = Effect.fn("DdfDestination.listDestinations")(
  function* (query?: ODataListQuery<DestinationField>) {
    const http = yield* DdfHttp;
    const schema = yield* listSchemaForSelect(
      "Destination",
      query,
      DestinationResponseSchema,
      DestinationSchema,
    );
    return yield* http.listOData(
      "/odata/v1/Destination",
      withDefaultOrder(query, listOrder.Destination),
      schema,
    );
  },
) as ListResource<Destination, DestinationField>;
export const getDestination = Effect.fn("DdfDestination.getDestination")(
  function* (destinationId: number, query?: ODataGetQuery<DestinationField>) {
    const http = yield* DdfHttp;
    const schema = yield* entitySchemaForSelect(
      "Destination",
      query,
      DestinationSchema,
      DestinationSchema,
    );
    return yield* http.getOData(
      "/odata/v1/Destination",
      destinationId,
      query,
      schema,
    );
  },
) as GetResource<number, Destination, DestinationField>;
export const createLead = Effect.fn("DdfLead.createLead")(function* (
  input: LeadInput,
  options?: { suppressEmail?: boolean },
) {
  const http = yield* DdfHttp;
  const path =
    options?.suppressEmail === true
      ? "/v1/Lead/CreateLead?SuppressEmail=true"
      : "/v1/Lead/CreateLead";
  const body = yield* encodeLeadInputJson(input);

  return yield* http.requestJson(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
    LeadResponseSchema,
  );
});
