import { assert, describe, it } from "@effect/vitest";
import { Effect, Metric } from "effect";
import { DdfWatermarkStore } from "./watermark";
import { ddfWatermarkLoadCount, ddfWatermarkSaveCount } from "./metrics";

describe("watermark persistence", () => {
  it.effect(
    "loads and saves watermarks through the Effect KeyValueStore service",
    () =>
      Effect.gen(function* () {
        const beforeLoads = yield* Metric.value(ddfWatermarkLoadCount);
        const beforeSaves = yield* Metric.value(ddfWatermarkSaveCount);

        const result = yield* Effect.gen(function* () {
          const store = yield* DdfWatermarkStore;
          const empty = yield* store.load("Property");
          yield* store.save("Property", "2024-01-01T00:00:00.000Z");
          const saved = yield* store.load("Property");
          const member = yield* store.load("Member");
          return { empty, saved, member };
        }).pipe(Effect.provide(DdfWatermarkStore.layerMemory));

        const afterLoads = yield* Metric.value(ddfWatermarkLoadCount);
        const afterSaves = yield* Metric.value(ddfWatermarkSaveCount);

        assert.deepEqual(result, {
          empty: null,
          saved: "2024-01-01T00:00:00.000Z",
          member: null,
        });
        assert.equal(afterLoads.count - beforeLoads.count, 3);
        assert.equal(afterSaves.count - beforeSaves.count, 1);
      }),
  );
});
