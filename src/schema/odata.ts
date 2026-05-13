import { Schema } from "effect"

const NullableString = Schema.NullOr(Schema.String)
const NullableDateTime = Schema.NullOr(Schema.DateTimeUtcFromString)

export type ODataListEnvelope<Item> = {
  readonly "@odata.context"?: string | null
  readonly "@odata.count"?: number
  readonly "@odata.nextLink"?: string | null
  readonly value: ReadonlyArray<Item>
}

export const ODataListEnvelopeSchema = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({
    "@odata.context": Schema.optionalKey(NullableString),
    "@odata.count": Schema.optionalKey(Schema.Number),
    "@odata.nextLink": Schema.optionalKey(NullableString),
    value: Schema.Array(item),
  }) as unknown as Schema.Decoder<ODataListEnvelope<Item["Type"]>, never>

export const ODataUnknownListEnvelopeSchema = ODataListEnvelopeSchema(Schema.Unknown)

export const PropertyReplicationIdentifierSchema = Schema.Struct({
  ListingKey: Schema.optionalKey(NullableString),
  ModificationTimestamp: Schema.optionalKey(NullableDateTime),
})

export const MemberReplicationIdentifierSchema = Schema.Struct({
  MemberKey: Schema.optionalKey(NullableString),
  ModificationTimestamp: Schema.optionalKey(NullableDateTime),
})

export const OfficeReplicationIdentifierSchema = Schema.Struct({
  OfficeKey: Schema.optionalKey(NullableString),
  ModificationTimestamp: Schema.optionalKey(NullableDateTime),
})

export const PropertyReplicationIdentifierResponseSchema = ODataListEnvelopeSchema(
  PropertyReplicationIdentifierSchema,
)

export const MemberReplicationIdentifierResponseSchema = ODataListEnvelopeSchema(
  MemberReplicationIdentifierSchema,
)

export const OfficeReplicationIdentifierResponseSchema = ODataListEnvelopeSchema(
  OfficeReplicationIdentifierSchema,
)

export type PropertyReplicationIdentifier = typeof PropertyReplicationIdentifierSchema.Type
export type MemberReplicationIdentifier = typeof MemberReplicationIdentifierSchema.Type
export type OfficeReplicationIdentifier = typeof OfficeReplicationIdentifierSchema.Type
