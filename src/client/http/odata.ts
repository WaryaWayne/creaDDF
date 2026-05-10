import { Data } from "effect";
import type { ODataGetQuery, ODataListQuery, ReplicationQuery } from "@/types";

const ODATA_TOP_MAX = 100;

export class DdfInvalidODataQueryError extends Data.TaggedError(
  "DdfInvalidODataQueryError",
)<{
  readonly option: string;
  readonly messageText: string;
}> {
  override get message() {
    return this.messageText;
  }
}

const validateODataQuery = (
  query?: ODataListQuery | ODataGetQuery | ReplicationQuery,
) => {
  if (query !== undefined && "top" in query && query.top !== undefined) {
    if (
      !Number.isInteger(query.top) ||
      query.top < 0 ||
      query.top > ODATA_TOP_MAX
    ) {
      throw new DdfInvalidODataQueryError({
        option: "$top",
        messageText: `DDF OData $top must be an integer between 0 and ${ODATA_TOP_MAX}`,
      });
    }
  }
};

const odataStringLiteral = (value: string) =>
  `'${value.replaceAll("'", "''")}'`;

const odataDateLiteral = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : value;

export type ODataPrimitive = string | number | boolean | Date | null;

const odataValueLiteral = (value: ODataPrimitive) => {
  if (value === null) return "null";
  if (typeof value === "string") return odataStringLiteral(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

export const filters = {
  eq: (field: string, value: ODataPrimitive) =>
    `${field} eq ${odataValueLiteral(value)}`,
  ne: (field: string, value: ODataPrimitive) =>
    `${field} ne ${odataValueLiteral(value)}`,
  gt: (field: string, value: Exclude<ODataPrimitive, null>) =>
    `${field} gt ${odataValueLiteral(value)}`,
  lt: (field: string, value: Exclude<ODataPrimitive, null>) =>
    `${field} lt ${odataValueLiteral(value)}`,
  ge: (field: string, value: Exclude<ODataPrimitive, null>) =>
    `${field} ge ${odataValueLiteral(value)}`,
  le: (field: string, value: Exclude<ODataPrimitive, null>) =>
    `${field} le ${odataValueLiteral(value)}`,
  in: (field: string, values: ReadonlyArray<ODataPrimitive>) =>
    `${field} in (${values.map(odataValueLiteral).join(",")})`,
  has: (field: string, value: string) => `${field} has ${value}`,
  not: (clause: string) => `not (${clause})`,
  any: (
    collection: string,
    variable: string,
    clause: string | ((variable: string) => string),
  ) =>
    `${collection}/any(${variable}: ${typeof clause === "function" ? clause(variable) : clause})`,
  modifiedAfter: (field: string, dateOrString: Date | string) =>
    `${field} gt ${odataDateLiteral(dateOrString)}`,
  and: (...clauses: ReadonlyArray<string>) =>
    clauses
      .filter(Boolean)
      .map((clause) => `(${clause})`)
      .join(" and "),
  or: (...clauses: ReadonlyArray<string>) =>
    clauses
      .filter(Boolean)
      .map((clause) => `(${clause})`)
      .join(" or "),
} as const;

export const encodeODataQuery = (
  query?: ODataListQuery | ODataGetQuery | ReplicationQuery,
): string => {
  validateODataQuery(query);
  if (query === undefined) return "";

  const p = new URLSearchParams();
  if (
    "select" in query &&
    query.select !== undefined &&
    query.select.length > 0
  )
    p.set("$select", query.select.join(","));
  if ("count" in query && query.count !== undefined)
    p.set("$count", String(query.count));
  if (
    "filter" in query &&
    query.filter !== undefined &&
    query.filter.length > 0
  )
    p.set("$filter", query.filter);
  if ("top" in query && query.top !== undefined)
    p.set("$top", String(query.top));
  if ("skip" in query && query.skip !== undefined)
    p.set("$skip", String(query.skip));
  if ("orderby" in query && query.orderby !== undefined) {
    const orderby = query.orderby;
    if (typeof orderby === "string") {
      if (orderby.length > 0) p.set("$orderby", orderby);
    } else if (orderby.length > 0) {
      p.set("$orderby", orderby.join(","));
    }
  }

  const s = p.toString();
  return s.length > 0 ? `?${s}` : "";
};

export const keyLiteral = (key: string | number) =>
  typeof key === "number" ? String(key) : `'${key.replaceAll("'", "''")}'`;
