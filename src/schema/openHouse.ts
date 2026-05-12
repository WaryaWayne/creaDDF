import { Schema } from "effect";
import { ODataListEnvelopeSchema } from "./odata";

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const daysInMonth = (year: number, month: number) =>
  month === 2
    ? isLeapYear(year)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

const isEdmDateString = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;

  const year = Number(match[1] ?? Number.NaN);
  const month = Number(match[2] ?? Number.NaN);
  const day = Number(match[3] ?? Number.NaN);

  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
};

const EdmDateString = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      isEdmDateString(value)
        ? undefined
        : { path: [], issue: "Expected an Edm.Date string in YYYY-MM-DD format." },
    ),
  ),
);

export const OpenHouseSchema = Schema.Struct({
  OpenHouseKey: Schema.String.annotate({
    message: "Value is invalid for OpenHouseKey.",
    description:
      "A unique identifier for this record from the immediate source.",
    title: "OpenHouse Key",
    identifier: "OpenHouseKey",
    examples: ["28335177"], // TODO: Add Examples
  }),
  ListingKey: Schema.Union([Schema.String, Schema.Null]).annotate({
    message: "Value is invalid for ListingKey.",
    description:
      "A unique identifier for the listing record related to this Open House.",
    title: "Listing Key",
    identifier: "ListingKey",
    examples: ["26034183", "26507412", "26935822"],
  }),
  ListingId: Schema.Union([Schema.String, Schema.Null]).annotate({
    message: "Value is invalid for ListingId.",
    description:
      "The well known identifier for the listing related to this Open House.",
    title: "Listing Id",
    identifier: "ListingId",
    examples: ["X9465223", "SK015977", "X12348197"],
  }),
  OpenHouseDate: Schema.NullOr(EdmDateString).annotate({
    message: "Value is invalid for OpenHouseDate.",
    description: "The date on which the open house will occur.",
    title: "Open House Date",
    identifier: "OpenHouseDate",
    examples: ["2025-07-15", "2025-12-12", "2026-09-12"],
  }),
  OpenHouseStartTime: Schema.Union([Schema.String, Schema.Null]).annotate({
    message: "Value is invalid for OpenHouseStartTime.",
    description: "The time the open house begins (in local time).",
    title: "OpenHouse Start Time",
    identifier: "OpenHouseStartTime",
    examples: ["12:00:00.00", "11:00:00.00", "15:00:00.00"],
  }),
  OpenHouseEndTime: Schema.Union([Schema.String, Schema.Null]).annotate({
    message: "Value is invalid for OpenHouseEndTime.",
    description: "The time the open house end (in local time).",
    title: "OpenHouse End Time",
    identifier: "OpenHouseEndTime",
    examples: ["15:00:00.00", "16:00:00.00", "13:00:00.00"],
  }),
  OpenHouseRemarks: Schema.Union([Schema.String, Schema.Null]).annotate({
    message: "Value is invalid for OpenHouseRemarks.",
    description: "Comments, instructions or information about the open house.",
    title: "OpenHouse Remarks",
    identifier: "OpenHouseRemarks",
    examples: [
      "Over 2800 sq ft of living space in this awesome bungalow townhouse. 4 bedrooms 3 bathrooms and a pile of upgrades. Excellent gated community that is self managed and run very well.",
    ],
  }),
  OpenHouseType: Schema.Union([
    Schema.Literals([
      "Open House",
      "Tour",
      "Showing",
      "Conference",
      "Meeting",
      "Seminar",
      "Training",
      "Live Stream Open House",
    ]),
    Schema.Null,
  ]).annotate({
    message: "Value is invalid for OpenHouseType.",
    description:
      "The type of open house. i.e. Public, Broker, Office, Association, Private (invitation or targeted publication).",
    title: "OpenHouse Type",
    identifier: "OpenHouseType",
    examples: ["Conference", "Open House", "Tour"],
  }),
  OpenHouseStatus: Schema.Union([
    Schema.Literals(["Active", "Canceled", "Ended"]),
    Schema.Null,
  ]).annotate({
    message: "Value is invalid for OpenHouseStatus.",
    description: "Status of the open house, i.e. Active, Cancelled, Ended.",
    title: "OpenHouse Status",
    identifier: "OpenHouseStatus",
    examples: ["Active", "Canceled", "Ended"],
  }),
  LivestreamOpenHouseURL: Schema.Union([Schema.String, Schema.Null]).annotate({
    message: "Value is invalid for LivestreamOpenHouseURL.",
    description: "A link to an open house livestream event.",
    title: "Livestream Open House URL",
    identifier: "LivestreamOpenHouseURL",
    examples: [null], // TODO: Add examples
  }),
});

export const OpenHouseType = OpenHouseSchema.Type;

export const OpenHouseResponseSchema = ODataListEnvelopeSchema(OpenHouseSchema);
