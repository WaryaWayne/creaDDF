import { Schema } from "effect";
import { MediaSchema } from "./mediaSchema";
import { ODataListEnvelopeSchema } from "./odata";

export const SocialMediaSchema = Schema.Struct({
  SocialMediaKey: Schema.String,
  ResourceRecordKey: Schema.String,
  SocialMediaType: Schema.Union([Schema.String, Schema.Null]),
  ModificationTimestamp: Schema.Union([Schema.Null, Schema.DateTimeUtcFromString]),
  ResourceName: Schema.Union([
    Schema.Literals(["Office", "Member", "Property"]),
    Schema.Null,
  ]),
  SocialMediaUrlOrId: Schema.String,
});

export const OfficeSchema = Schema.Struct({
  OfficeKey: Schema.String,
  OfficeMlsId: Schema.Union([Schema.String, Schema.Null]),
  OfficeAORKey: Schema.Union([Schema.String, Schema.Null]),
  OfficeNationalAssociationId: Schema.Union([Schema.String, Schema.Null]),
  FranchiseNationalAssociationId: Schema.Union([Schema.String, Schema.Null]),
  OfficeBrokerNationalAssociationId: Schema.Union([Schema.String, Schema.Null]),
  OfficeAddress1: Schema.Union([Schema.String, Schema.Null]),
  OfficeAddress2: Schema.Union([Schema.String, Schema.Null]),
  OfficeCity: Schema.Union([Schema.String, Schema.Null]),
  OfficeFax: Schema.Union([Schema.String, Schema.Null]),
  OfficeName: Schema.Union([Schema.String, Schema.Null]),
  OfficePhone: Schema.Union([Schema.String, Schema.Null]),
  OfficePhoneExt: Schema.Union([Schema.String, Schema.Null]),
  OfficePostalCode: Schema.Union([Schema.String, Schema.Null]),
  Media: MediaSchema,
  OfficeSocialMedia: Schema.Array(SocialMediaSchema),
  ModificationTimestamp: Schema.Union([Schema.Null, Schema.DateTimeUtcFromString]),
  OriginalEntryTimestamp: Schema.Union([Schema.Null, Schema.DateTimeUtcFromString]),
  OfficeType: Schema.Union([Schema.String, Schema.Null]),
  OfficeStateOrProvince: Schema.Union([Schema.String, Schema.Null]),
  OfficeAOR: Schema.Union([Schema.String, Schema.Null]),
  OfficeStatus: Schema.Union([Schema.String, Schema.Null]),
  OfficeCountry: Schema.Union([Schema.String, Schema.Null]),
});

export const OfficeResponseSchema = ODataListEnvelopeSchema(OfficeSchema);

export type Office = typeof OfficeSchema.Type;
export type SocialMedia = typeof SocialMediaSchema.Type;
