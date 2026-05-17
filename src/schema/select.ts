import { Effect, Schema } from "effect";
import { DdfInvalidODataQueryError } from "#/client/http/odata";
import type { DdfResponseSchema } from "#/client/http/types";
import { ODataListEnvelopeSchema } from "#/schema/odata";

export type SelectQuery = { readonly select?: ReadonlyArray<string> };

export const hasSelect = (query?: SelectQuery) =>
  query?.select !== undefined && query.select.length > 0;

const ODataContextField = {
  "@odata.context": Schema.optionalKey(Schema.NullOr(Schema.String)),
} as const;

const unknownSelectFieldError = (resource: string, field: string) =>
  new DdfInvalidODataQueryError({
    option: "$select",
    messageText: `DDF OData $select field "${field}" is not part of the ${resource} schema`,
  });

export const selectedEntitySchema = Effect.fn(
  "DdfSchema.selectedEntitySchema",
)(function* <Fields extends Schema.Struct.Fields>(
  resource: string,
  schema: Schema.Struct<Fields>,
  select: ReadonlyArray<string>,
  options?: { readonly includeODataContext?: boolean },
) {
  const pickedFields: Record<string, Schema.Top> = {};

  for (const field of select) {
    if (!Object.hasOwn(schema.fields, field)) {
      return yield* unknownSelectFieldError(resource, field);
    }
    pickedFields[field] = schema.fields[field as keyof Fields] as Schema.Top;
  }

  return Schema.Struct(
    options?.includeODataContext === true
      ? { ...ODataContextField, ...pickedFields }
      : pickedFields,
  );
});

export const selectedListResponseSchema = Effect.fn(
  "DdfSchema.selectedListResponseSchema",
)(function* <Fields extends Schema.Struct.Fields>(
  resource: string,
  schema: Schema.Struct<Fields>,
  select: ReadonlyArray<string>,
) {
  const selected = yield* selectedEntitySchema(resource, schema, select);
  return ODataListEnvelopeSchema(selected);
});

export const entitySchemaForSelect = Effect.fn(
  "DdfSchema.entitySchemaForSelect",
)(function* <Full, Fields extends Schema.Struct.Fields>(
  resource: string,
  query: SelectQuery | undefined,
  fullSchema: DdfResponseSchema<Full>,
  resourceSchema: Schema.Struct<Fields>,
) {
  const select = query?.select;
  if (select === undefined || select.length === 0) return fullSchema;
  return (yield* selectedEntitySchema(resource, resourceSchema, select, {
    includeODataContext: true,
  })) as unknown as DdfResponseSchema<Full>;
});

export const listSchemaForSelect = Effect.fn("DdfSchema.listSchemaForSelect")(
  function* <Full, Fields extends Schema.Struct.Fields>(
    resource: string,
    query: SelectQuery | undefined,
    fullSchema: DdfResponseSchema<Full>,
    resourceSchema: Schema.Struct<Fields>,
  ) {
    const select = query?.select;
    if (select === undefined || select.length === 0) return fullSchema;
    return (yield* selectedListResponseSchema(
      resource,
      resourceSchema,
      select,
    )) as unknown as DdfResponseSchema<Full>;
  },
);
