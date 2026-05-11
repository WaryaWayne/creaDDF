import { Schema } from "effect"

const NullableString = Schema.NullOr(Schema.String)
const NullableDateTime = Schema.NullOr(Schema.DateTimeUtcFromString)

export const ODataListEnvelopeSchema = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({
    "@odata.context": Schema.optionalKey(NullableString),
    "@odata.count": Schema.optionalKey(Schema.Number),
    "@odata.nextLink": Schema.optionalKey(NullableString),
    value: Schema.Array(item),
  })

export const ODataUnknownListEnvelopeSchema = ODataListEnvelopeSchema(Schema.Unknown)

export const PropertyReplicationIdentifierSchema = Schema.Struct({
  ListingKey: Schema.String,
  ModificationTimestamp: Schema.optionalKey(NullableDateTime),
})

export const MemberReplicationIdentifierSchema = Schema.Struct({
  MemberKey: Schema.String,
  ModificationTimestamp: Schema.optionalKey(NullableDateTime),
})

export const OfficeReplicationIdentifierSchema = Schema.Struct({
  OfficeKey: Schema.String,
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

export type ODataListEnvelope<Item> = typeof ODataUnknownListEnvelopeSchema.Type & {
  readonly value: ReadonlyArray<Item>
}
export type PropertyReplicationIdentifier = typeof PropertyReplicationIdentifierSchema.Type
export type MemberReplicationIdentifier = typeof MemberReplicationIdentifierSchema.Type
export type OfficeReplicationIdentifier = typeof OfficeReplicationIdentifierSchema.Type
