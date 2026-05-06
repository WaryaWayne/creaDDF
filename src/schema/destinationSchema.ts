import { Schema } from "effect";
import { ODataListEnvelopeSchema } from "./odata";

const NullableString = Schema.NullOr(Schema.String);
const NullableDateTime = Schema.NullOr(Schema.DateFromString);
const NullableDestinationType = Schema.NullOr(Schema.String);
const NullableDestinationStatus = Schema.NullOr(Schema.String);

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
