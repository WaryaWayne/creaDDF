import { Data, Effect, Schema } from "effect";
import { DdfHttp, encodeODataQuery } from "./client";
import type { DdfResponseSchema } from "./client";
import { MemberResponseSchema, MemberSchema } from "./schema/memberSchema";
import {
  DestinationResponseSchema,
  DestinationSchema,
} from "./schema/destinationSchema";
import { OfficeResponseSchema, OfficeSchema } from "./schema/officeSchema";
import { OpenHouseResponseSchema, OpenHouseSchema } from "./schema/openHouse";
import {
  MultiplePropertyListingResponseSchema,
  PropertyListingSchema,
  SinglePropertyListingResponseSchema,
} from "./schema/propertyListingsSchema";
import {
  MemberReplicationIdentifierResponseSchema,
  ODataListEnvelopeSchema,
  OfficeReplicationIdentifierResponseSchema,
  PropertyReplicationIdentifierResponseSchema,
} from "./schema/odata";
import type {
  LeadInput,
  ODataGetQuery,
  ODataListQuery,
  ReplicationQuery,
} from "./types";

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

const schemaForSelect = <Full>(
  query: SelectQuery | undefined,
  selectedSchema: DdfResponseSchema<unknown>,
  fullSchema: DdfResponseSchema<Full>,
) =>
  (hasSelect(query) ? selectedSchema : fullSchema) as DdfResponseSchema<Full>;

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

const SelectedPropertyListingSchema = selectedEntitySchema(
  PropertyListingSchema,
);
const SelectedPropertyListingResponseSchema = ODataListEnvelopeSchema(
  SelectedPropertyListingSchema,
);
const SelectedMemberSchema = selectedEntitySchema(MemberSchema);
const SelectedMemberResponseSchema =
  ODataListEnvelopeSchema(SelectedMemberSchema);
const SelectedOfficeSchema = selectedEntitySchema(OfficeSchema);
const SelectedOfficeResponseSchema =
  ODataListEnvelopeSchema(SelectedOfficeSchema);
const SelectedOpenHouseSchema = selectedEntitySchema(OpenHouseSchema);
const SelectedOpenHouseResponseSchema = ODataListEnvelopeSchema(
  SelectedOpenHouseSchema,
);
const SelectedDestinationSchema = selectedEntitySchema(DestinationSchema);
const SelectedDestinationResponseSchema = ODataListEnvelopeSchema(
  SelectedDestinationSchema,
);

export const listProperties = Effect.fn("DdfProperty.listProperties")(
  function* (query?: ODataListQuery) {
    const http = yield* DdfHttp;
    return yield* http.listOData(
      "/odata/v1/Property",
      withDefaultOrder(query, listOrder.Property),
      schemaForSelect(
        query,
        SelectedPropertyListingResponseSchema,
        MultiplePropertyListingResponseSchema,
      ),
    );
  },
);
export const getProperty = Effect.fn("DdfProperty.getProperty")(function* (
  propertyKey: string,
  query?: ODataGetQuery,
) {
  const http = yield* DdfHttp;
  return yield* http.getOData(
    "/odata/v1/Property",
    propertyKey,
    query,
    schemaForSelect(
      query,
      SelectedPropertyListingSchema,
      SinglePropertyListingResponseSchema,
    ),
  );
});

export const replicateProperties = Effect.fn("DdfProperty.replicateProperties")(
  function* (query?: ReplicationQuery) {
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
)(function* (destinationId: number, query?: ReplicationQuery) {
  const http = yield* DdfHttp;
  return yield* http.requestJson(
    `${replicationPath("Property", "PropertyReplication", destinationId)}${encodeODataQuery(withDefaultOrder(query, syncOrder.Property))}`,
    undefined,
    PropertyReplicationIdentifierResponseSchema,
  );
});
export const listMembers = Effect.fn("DdfMember.listMembers")(function* (
  query?: ODataListQuery,
) {
  const http = yield* DdfHttp;
  return yield* http.listOData(
    "/odata/v1/Member",
    withDefaultOrder(query, listOrder.Member),
    schemaForSelect(query, SelectedMemberResponseSchema, MemberResponseSchema),
  );
});
export const getMember = Effect.fn("DdfMember.getMember")(function* (
  memberKey: string,
  query?: ODataGetQuery,
) {
  const http = yield* DdfHttp;
  return yield* http.getOData(
    "/odata/v1/Member",
    memberKey,
    query,
    schemaForSelect(query, SelectedMemberSchema, MemberSchema),
  );
});
export const replicateMembers = Effect.fn("DdfMember.replicateMembers")(
  function* (query?: ReplicationQuery) {
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
)(function* (destinationId: number, query?: ReplicationQuery) {
  const http = yield* DdfHttp;
  return yield* http.requestJson(
    `${replicationPath("Member", "MemberReplication", destinationId)}${encodeODataQuery(withDefaultOrder(query, syncOrder.Member))}`,
    undefined,
    MemberReplicationIdentifierResponseSchema,
  );
});
export const listOffices = Effect.fn("DdfOffice.listOffices")(function* (
  query?: ODataListQuery,
) {
  const http = yield* DdfHttp;
  return yield* http.listOData(
    "/odata/v1/Office",
    withDefaultOrder(query, listOrder.Office),
    schemaForSelect(query, SelectedOfficeResponseSchema, OfficeResponseSchema),
  );
});
export const getOffice = Effect.fn("DdfOffice.getOffice")(function* (
  officeKey: string,
  query?: ODataGetQuery,
) {
  const http = yield* DdfHttp;
  return yield* http.getOData(
    "/odata/v1/Office",
    officeKey,
    query,
    schemaForSelect(query, SelectedOfficeSchema, OfficeSchema),
  );
});
export const replicateOffices = Effect.fn("DdfOffice.replicateOffices")(
  function* (query?: ReplicationQuery) {
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
)(function* (destinationId: number, query?: ReplicationQuery) {
  const http = yield* DdfHttp;
  return yield* http.requestJson(
    `${replicationPath("Office", "OfficeReplication", destinationId)}${encodeODataQuery(withDefaultOrder(query, syncOrder.Office))}`,
    undefined,
    OfficeReplicationIdentifierResponseSchema,
  );
});
export const listOpenHouses = Effect.fn("DdfOpenHouse.listOpenHouses")(
  function* (query?: ODataListQuery) {
    const http = yield* DdfHttp;
    return yield* http.listOData(
      "/odata/v1/OpenHouse",
      withDefaultOrder(query, listOrder.OpenHouse),
      schemaForSelect(
        query,
        SelectedOpenHouseResponseSchema,
        OpenHouseResponseSchema,
      ),
    );
  },
);
export const getOpenHouse = Effect.fn("DdfOpenHouse.getOpenHouse")(function* (
  openHouseKey: string,
  query?: ODataGetQuery,
) {
  const http = yield* DdfHttp;
  return yield* http.getOData(
    "/odata/v1/OpenHouse",
    openHouseKey,
    query,
    schemaForSelect(query, SelectedOpenHouseSchema, OpenHouseSchema),
  );
});
export const listDestinations = Effect.fn("DdfDestination.listDestinations")(
  function* (query?: ODataListQuery) {
    const http = yield* DdfHttp;
    return yield* http.listOData(
      "/odata/v1/Destination",
      withDefaultOrder(query, listOrder.Destination),
      schemaForSelect(
        query,
        SelectedDestinationResponseSchema,
        DestinationResponseSchema,
      ),
    );
  },
);
export const getDestination = Effect.fn("DdfDestination.getDestination")(
  function* (destinationId: number, query?: ODataGetQuery) {
    const http = yield* DdfHttp;
    return yield* http.getOData(
      "/odata/v1/Destination",
      destinationId,
      query,
      schemaForSelect(query, SelectedDestinationSchema, DestinationSchema),
    );
  },
);
export const createLead = Effect.fn("DdfLead.createLead")(function* (
  input: LeadInput,
  options?: { suppressEmail?: boolean },
) {
  const http = yield* DdfHttp;
  const path =
    options?.suppressEmail !== undefined
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
