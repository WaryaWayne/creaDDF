import { effect as itEffect } from "@effect/vitest";
import { assert, describe } from "vitest";
import { Effect, Exit, Schema } from "effect";
import { ODataListEnvelopeSchema } from "./odata.js";

const TestEnvelope = ODataListEnvelopeSchema(
  Schema.Struct({ id: Schema.String }),
);
const decodeTestEnvelope = Schema.decodeUnknownEffect(TestEnvelope);

describe("ODataListEnvelopeSchema", () => {
  itEffect("decodes an absent @odata.count", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeTestEnvelope({ value: [{ id: "one" }] });

      assert.deepEqual(decoded.value, [{ id: "one" }]);
      assert.equal(decoded["@odata.count"], undefined);
    }),
  );

  itEffect("decodes a present integer @odata.count", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeTestEnvelope({
        "@odata.count": 1,
        value: [{ id: "one" }],
      });

      assert.equal(decoded["@odata.count"], 1);
    }),
  );

  itEffect("decodes a nullable @odata.count", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeTestEnvelope({
        "@odata.count": null,
        value: [],
      });

      assert.equal(decoded["@odata.count"], null);
    }),
  );

  itEffect("rejects a non-integer @odata.count", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        decodeTestEnvelope({ "@odata.count": 1.5, value: [] }),
      );

      assert.equal(Exit.isFailure(exit), true);
    }),
  );
});
