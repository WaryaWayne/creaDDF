import { Schema } from "effect"

export const MediaSchema = Schema.Array(
  Schema.Struct({
    MediaKey: Schema.Union(Schema.String, Schema.Null).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for MediaKey. Reason: ${_tag}.`,
      description:
        "A unique identifier for this record from the immediate source. This may be a number, or string that can include URI or other forms. This is the system you are connecting to and not necessarily the original source of the record.",
      title: "Media Key",
      identifier: "MediaKey",
      examples: ["6308829675", "6308843527", "6357376500"],
    }),
    LongDescription: Schema.Union(Schema.String, Schema.Null).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for LongDescription. Reason: ${_tag}.`,
      description: "The full description of the object.",
      title: "Long Description",
      identifier: "LongDescription",
      examples: ["Multi Use space", "Carpeted Den"],
    }),
    MediaURL: Schema.Union(Schema.String, Schema.Null).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for MediaURL. Reason: ${_tag}.`,
      description: "The URI to the media file referenced by this record.",
      title: "Media URL",
      identifier: "MediaURL",
      examples: [
        "https://ddfcdn.realtor.ca/listing/TS638726359494400000/reb76/highres/2/x9465222_2.jpg",
        "https://ddfcdn.realtor.ca/listing/TS638682536282530000/reb76/highres/2/x9462522_17.jpg",
        "https://ddfcdn.realtor.ca/listing/TS638684868443800000/reb76/highres/4/x9462414_10.jpg",
      ],
    }),
    ModificationTimestamp: Schema.Union(
      Schema.Null,
      Schema.DateFromString,
    ).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for ModificationTimestamp. Reason: ${_tag}.`,
      description:
        "Date/time this record was last modified (in Zulu time (UTC)).",
      title: "Modification Timestamp",
      identifier: "ModificationTimestamp",
      examples: [
        new Date("2023-11-08T19:12:55.580Z"),
        new Date("2024-11-27T02:33:48.250Z"),
        new Date("2025-12-05T19:24:51.550Z"),
      ],
    }),
    Order: Schema.Union(Schema.Int, Schema.Null).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for Order. Reason: ${_tag}.`,
      description:
        "The order in which the media object is displayed. Zero is the primary photo per RETS convention.",
      title: "Order",
      identifier: "Order",
      examples: [1, 17, 4, 9],
    }),
    PreferredPhotoYN: Schema.Union(Schema.Boolean, Schema.Null).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for PreferredPhotoYN. Reason: ${_tag}.`,
      description:
        "When set to true, the media record in question is the preferred photo. This will typically mean the photo to be shown when only one of the photos is to be displayed.",
      title: "Preferred Photo Yes or No",
      identifier: "PreferredPhotoYN",
      examples: [true, false],
    }),
    ResourceRecordId: Schema.Union(Schema.String, Schema.Null).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for ResourceRecordId. Reason: ${_tag}.`,
      description:
        "The well known identifier of the related record from the source resource.",
      title: "Resource Record ID",
      identifier: "ResourceRecordId",
      examples: ["X9465222", "X9462522", "X9462414"],
    }),

    ResourceRecordKey: Schema.Union(Schema.String, Schema.Null).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for ResourceRecordKey. Reason: ${_tag}.`,
      description:
        "The primary key of the related record from the source resource. For example the ListingKey, MemberKey, OfficeKey, etc. This is a foreign key from the resource selected in the ResourceName field.",
      title: "Resource Record Key",
      identifier: "ResourceRecordKey",
      examples: ["26034185", "26368062", "26197350"],
    }),
    ResourceName: Schema.Union(
      Schema.Literal("Property", "Member", "Office"),
      Schema.Null,
    ).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for ResourceName. Reason: ${_tag}.`,
      description:
        "The resource or table of the listing or other record the media relates to. i.e. Property, Member, Office, etc.",
      title: "Resource Name",
      identifier: "ResourceName",
      examples: ["Member", "Office", "Property"],
    }),
    MediaCategory: Schema.Union(
      Schema.Literal(
        "Alternate Feature Sheet Website",
        "Video Tour Website",
        "Sound Bite Website",
        "Sales Brochure Website",
        "Additional Pictures Website",
        "Other",
        "Map Website",
        "Floorplan",
        "Member Photo",
        "Property Photo",
        "Office Logo",
      ),
      Schema.Null,
    ).annotations({
      message: ({ _tag, actual }) =>
        `Value '${actual}' is invalid for MediaCategory. Reason: ${_tag}.`,
      description:
        "Category describing the media type: Photos, Documents, Video, Unbranded Virtual Tour, Branded Virtual Tour, Floor Plan, Logo",
      title: "Media Category",
      identifier: "MediaCategory",
      examples: ["Floorplan", "Member Photo", "Office Logo", "Property Photo"],
    }),
  }),
)

export type MediaType = typeof MediaSchema.Type
