import { Schema } from "effect";
import { ODataListEnvelopeSchema } from "./odata";

const NullableString = Schema.NullOr(Schema.String);
const NullableDateTime = Schema.NullOr(Schema.DateTimeUtcFromString);

export const DestinationTypeSchema = Schema.Literals([
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
]);

export const DestinationStatusSchema = Schema.Literals([1, 2, 3]);

const NullableDestinationType = Schema.NullOr(DestinationTypeSchema);
const NullableDestinationStatus = Schema.NullOr(DestinationStatusSchema);

export const DestinationSchema = Schema.Struct({
  "@odata.context": Schema.optionalKey(NullableString),
  DestinationId: Schema.Number,
  DestinationName: Schema.optionalKey(NullableString),
  DestinationUrl: Schema.optionalKey(NullableString),
  DestinationType: Schema.optionalKey(NullableDestinationType),
  DestinationStatus: Schema.optionalKey(NullableDestinationStatus),
  MemberFirstName: Schema.optionalKey(NullableString),
  MemberLastName: Schema.optionalKey(NullableString),
  MemberKey: Schema.optionalKey(NullableString),
  OriginalEntryTimestamp: Schema.optionalKey(NullableDateTime),
  ModificationTimestamp: Schema.optionalKey(NullableDateTime),
  FullNSP: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
});

export const DestinationResponseSchema =
  ODataListEnvelopeSchema(DestinationSchema);

export type Destination = typeof DestinationSchema.Type;
