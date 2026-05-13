import { Schema } from "effect";

export const optionalStruct = <Fields extends Schema.Struct.Fields>(
  schema: Schema.Struct<Fields>,
) =>
  schema.mapFields(
    (fields) =>
      Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [
          key,
          Schema.optionalKey(field as Schema.Top),
        ]),
      ) as { readonly [Key in keyof Fields]: Schema.optionalKey<Fields[Key]> },
  );
