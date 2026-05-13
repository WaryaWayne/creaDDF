import { Data, Effect, Schema } from "effect";
import { DdfHttp, encodeODataQuery } from "./client";
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
  OfficeReplicationIdentifierResponseSchema,
  PropertyReplicationIdentifierResponseSchema,
} from "./schema/odata";
import {
  entitySchemaForSelect,
  listSchemaForSelect,
} from "./schema/select";
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

export const listProperties = Effect.fn("DdfProperty.listProperties")(
  function* (query?: ODataListQuery) {
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
);
export const getProperty = Effect.fn("DdfProperty.getProperty")(function* (
  propertyKey: string,
  query?: ODataGetQuery,
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
});
export const getMember = Effect.fn("DdfMember.getMember")(function* (
  memberKey: string,
  query?: ODataGetQuery,
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
});
export const getOffice = Effect.fn("DdfOffice.getOffice")(function* (
  officeKey: string,
  query?: ODataGetQuery,
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
);
export const getOpenHouse = Effect.fn("DdfOpenHouse.getOpenHouse")(function* (
  openHouseKey: string,
  query?: ODataGetQuery,
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
});
export const listDestinations = Effect.fn("DdfDestination.listDestinations")(
  function* (query?: ODataListQuery) {
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
);
export const getDestination = Effect.fn("DdfDestination.getDestination")(
  function* (destinationId: number, query?: ODataGetQuery) {
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
