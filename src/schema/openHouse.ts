import { Schema } from "effect"

export const OpenHouseSchema = Schema.Struct({
  OpenHouseKey: Schema.Union(Schema.String, Schema.Null).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for OpenHouseKey. Reason: ${_tag}.`,
    description:
      "A unique identifier for this record from the immediate source.",
    title: "OpenHouse Key",
    identifier: "OpenHouseKey",
    examples: ["28335177"], // TODO: Add Examples
  }),
  ListingKey: Schema.Union(Schema.String, Schema.Null).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for ListingKey. Reason: ${_tag}.`,
    description:
      "A unique identifier for the listing record related to this Open House.",
    title: "Listing Key",
    identifier: "ListingKey",
    examples: ["26034183", "26507412", "26935822"],
  }),
  ListingId: Schema.Union(Schema.String, Schema.Null).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for ListingId. Reason: ${_tag}.`,
    description:
      "The well known identifier for the listing related to this Open House.",
    title: "Listing Id",
    identifier: "ListingId",
    examples: ["X9465223", "SK015977", "X12348197"],
  }),
  OpenHouseDate: Schema.Union(Schema.DateFromString, Schema.Null).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for OpenHouseDate. Reason: ${_tag}.`,
    description: "The date on which the open house will occur.",
    title: "Open House Date",
    identifier: "OpenHouseDate",
    examples: [
      new Date("2025-07-15"),
      new Date("2025-12-12"),
      new Date("2026-09-12"),
    ],
  }),
  OpenHouseStartTime: Schema.Union(Schema.String, Schema.Null).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for OpenHouseStartTime. Reason: ${_tag}.`,
    description: "The time the open house begins (in local time).",
    title: "OpenHouse Start Time",
    identifier: "OpenHouseStartTime",
    examples: ["12:00:00.00", "11:00:00.00", "15:00:00.00"],
  }),
  OpenHouseEndTime: Schema.Union(Schema.String, Schema.Null).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for OpenHouseEndTime. Reason: ${_tag}.`,
    description: "The time the open house end (in local time).",
    title: "OpenHouse End Time",
    identifier: "OpenHouseEndTime",
    examples: ["15:00:00.00", "16:00:00.00", "13:00:00.00"],
  }),
  OpenHouseRemarks: Schema.Union(Schema.String, Schema.Null).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for OpenHouseRemarks. Reason: ${_tag}.`,
    description: "Comments, instructions or information about the open house.",
    title: "OpenHouse Remarks",
    identifier: "OpenHouseRemarks",
    examples: [
      "Over 2800 sq ft of living space in this awesome bungalow townhouse. 4 bedrooms 3 bathrooms and a pile of upgrades. Excellent gated community that is self managed and run very well.",
    ],
  }),
  OpenHouseType: Schema.Union(
    Schema.Literal(
      "Open House",
      "Tour",
      "Showing",
      "Conference",
      "Meeting",
      "Seminar",
      "Training",
      "Live Stream Open House",
    ),
    Schema.Null,
  ).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for OpenHouseType. Reason: ${_tag}.`,
    description:
      "The type of open house. i.e. Public, Broker, Office, Association, Private (invitation or targeted publication).",
    title: "OpenHouse Type",
    identifier: "OpenHouseType",
    examples: ["Conference", "Open House", "Tour"],
  }),
  OpenHouseStatus: Schema.Union(
    Schema.Literal("Active", "Canceled", "Ended"),
    Schema.Null,
  ).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for OpenHouseStatus. Reason: ${_tag}.`,
    description: "Status of the open house, i.e. Active, Cancelled, Ended.",
    title: "OpenHouse Status",
    identifier: "OpenHouseStatus",
    examples: ["Active", "Canceled", "Ended"],
  }),
  LivestreamOpenHouseURL: Schema.Union(Schema.String, Schema.Null).annotations({
    message: ({ _tag, actual }) =>
      `Value '${actual}' is invalid for LivestreamOpenHouseURL. Reason: ${_tag}.`,
    description: "A link to an open house livestream event.",
    title: "Livestream Open House URL",
    identifier: "LivestreamOpenHouseURL",
    examples: [null], // TODO: Add examples
  }),
})

export const OpenHouseType = OpenHouseSchema.Type

export const OpenHouseResponseSchema = Schema.Struct({
  "@odata.context": Schema.Union(Schema.String, Schema.Null),
  "@odata.nextLink": Schema.Union(Schema.String, Schema.Null),
  value: Schema.Array(OpenHouseSchema),
})
