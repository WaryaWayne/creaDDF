import { Schema } from "effect";

export const optionalStruct = <Fields extends Schema.Struct.Fields>(
  schema: Schema.Struct<Fields>,
) =>
  schema.mapFields(
    (fields) =>
      Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [
          key,
          Schema.optionalKey(Schema.NullOr(field as Schema.Top)),
        ]),
      ) as unknown as { readonly [Key in keyof Fields]: Schema.optionalKey<Schema.NullOr<Fields[Key]>> },
  );
