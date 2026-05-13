import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";
import { ODataListEnvelopeSchema } from "./odata";

const TestEnvelope = ODataListEnvelopeSchema(
  Schema.Struct({ id: Schema.String }),
);
const decodeTestEnvelope = Schema.decodeUnknownEffect(TestEnvelope);

describe("ODataListEnvelopeSchema", () => {
  it.effect("decodes an absent @odata.count", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeTestEnvelope({ value: [{ id: "one" }] });

      assert.deepEqual(decoded.value, [{ id: "one" }]);
      assert.equal(decoded["@odata.count"], undefined);
    }),
  );

  it.effect("decodes a present integer @odata.count", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeTestEnvelope({
        "@odata.count": 1,
        value: [{ id: "one" }],
      });

      assert.equal(decoded["@odata.count"], 1);
    }),
  );

  it.effect("decodes a nullable @odata.count", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeTestEnvelope({
        "@odata.count": null,
        value: [],
      });

      assert.equal(decoded["@odata.count"], null);
    }),
  );


  it.effect("decodes a directly represented empty value array", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeTestEnvelope({ value: [] });

      assert.deepEqual(decoded.value, []);
    }),
  );

  it.effect("rejects envelopes with missing or non-array value fields", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.exit(decodeTestEnvelope({}));
      const nonArray = yield* Effect.exit(decodeTestEnvelope({ value: null }));

      assert.equal(Exit.isFailure(missing), true);
      assert.equal(Exit.isFailure(nonArray), true);
    }),
  );

  it.effect("rejects a non-integer @odata.count", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        decodeTestEnvelope({ "@odata.count": 1.5, value: [] }),
      );

      assert.equal(Exit.isFailure(exit), true);
    }),
  );
});
