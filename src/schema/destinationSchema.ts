import { Schema } from "effect";
import { ODataListEnvelopeSchema } from "./odata";

const NullableString = Schema.NullOr(Schema.String);
const NullableDateTime = Schema.NullOr(Schema.DateTimeUtcFromString);
const NullableDestinationType = Schema.NullOr(
  Schema.Literals([
    "National Shared Pool",
    "National Franchisor Pool",
    "Member Website Feed - My Listings",
    "Private IDX",
    "Third Party",
    "Member Website Feed - One or More Offices",
    "CREA",
    "Real Estate Advertising Website",
    "Technology Provider",
    "Franchisor Direct Feed",
    "Board Association Websites",
    "CREA Partner Sites",
    "Sample Data",
  ]),
);
const NullableDestinationStatus = Schema.NullOr(
  Schema.Literals(["Active", "Inactive", "Suspended"]),
);

export const DestinationSchema = Schema.Struct({
  "@odata.context": Schema.optionalKey(NullableString),
  DestinationId: Schema.Number,
  DestinationName: NullableString,
  DestinationUrl: NullableString,
  DestinationType: NullableDestinationType,
  DestinationStatus: NullableDestinationStatus,
  MemberFirstName: NullableString,
  MemberLastName: NullableString,
  MemberKey: NullableString,
  OriginalEntryTimestamp: NullableDateTime,
  ModificationTimestamp: NullableDateTime,
  FullNSP: Schema.Boolean,
});

export const DestinationResponseSchema =
  ODataListEnvelopeSchema(DestinationSchema);

export type Destination = typeof DestinationSchema.Type;
