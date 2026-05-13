import { Schema, SchemaTransformation } from "effect";
import { ODataListEnvelopeSchema } from "./odata";

const NullableString = Schema.NullOr(Schema.String);
const NullableDateTime = Schema.NullOr(Schema.DateTimeUtcFromString);

const destinationTypeByCode = {
  1: "National Shared Pool",
  2: "National Franchisor Pool",
  3: "Member Website Feed - My Listings",
  4: "Private IDX",
  5: "Third Party",
  6: "Member Website Feed - One or More Offices",
  7: "CREA",
  8: "Real Estate Advertising Website",
  9: "Technology Provider",
  10: "Franchisor Direct Feed",
  11: "Board Association Websites",
  12: "CREA Partner Sites",
  13: "Sample Data",
} as const;

const destinationStatusByCode = {
  1: "Active",
  2: "Inactive",
  3: "Suspended",
} as const;

const destinationTypeLabels = Object.values(destinationTypeByCode);
const destinationStatusLabels = Object.values(destinationStatusByCode);

const destinationTypeCodeByLabel = Object.fromEntries(
  Object.entries(destinationTypeByCode).map(([code, label]) => [
    label,
    Number(code),
  ]),
) as Record<(typeof destinationTypeLabels)[number], number>;

const destinationStatusCodeByLabel = Object.fromEntries(
  Object.entries(destinationStatusByCode).map(([code, label]) => [
    label,
    Number(code),
  ]),
) as Record<(typeof destinationStatusLabels)[number], number>;

const DestinationTypeLabelSchema = Schema.Literals(destinationTypeLabels);
const DestinationStatusLabelSchema = Schema.Literals(destinationStatusLabels);

const DestinationTypeCodeSchema = Schema.Literals([
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
const DestinationStatusCodeSchema = Schema.Literals([1, 2, 3]);

type DestinationTypeInput =
  | typeof DestinationTypeLabelSchema.Type
  | typeof DestinationTypeCodeSchema.Type;
type DestinationStatusInput =
  | typeof DestinationStatusLabelSchema.Type
  | typeof DestinationStatusCodeSchema.Type;

const DestinationTypeSchema = Schema.Union([
  DestinationTypeLabelSchema,
  DestinationTypeCodeSchema,
]).pipe(
  Schema.decodeTo(
    DestinationTypeLabelSchema,
    SchemaTransformation.transform({
      decode: (value) =>
        typeof value === "number" ? destinationTypeByCode[value] : value,
      encode: (value) =>
        destinationTypeCodeByLabel[value] as DestinationTypeInput,
    }),
  ),
);

const DestinationStatusSchema = Schema.Union([
  DestinationStatusLabelSchema,
  DestinationStatusCodeSchema,
]).pipe(
  Schema.decodeTo(
    DestinationStatusLabelSchema,
    SchemaTransformation.transform({
      decode: (value) =>
        typeof value === "number" ? destinationStatusByCode[value] : value,
      encode: (value) =>
        destinationStatusCodeByLabel[value] as DestinationStatusInput,
    }),
  ),
);
const NullableDestinationType = Schema.NullOr(DestinationTypeSchema);
const NullableDestinationStatus = Schema.NullOr(DestinationStatusSchema);

export const DestinationSchema = Schema.Struct({
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
