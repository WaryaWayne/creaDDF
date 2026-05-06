import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect, Metric } from "effect";
import {
  DdfWatermarkStore,
  DdfWatermarkStoreLive,
} from "./watermark";
import { ddfWatermarkLoadCount, ddfWatermarkSaveCount } from "./metrics";

describe("watermark persistence", () => {
  it("loads and saves watermarks through the Effect KeyValueStore service", async () => {
    const beforeLoads = await Effect.runPromise(Metric.value(ddfWatermarkLoadCount));
    const beforeSaves = await Effect.runPromise(Metric.value(ddfWatermarkSaveCount));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* DdfWatermarkStore;
        const empty = yield* store.load("Property");
        yield* store.save("Property", "2024-01-01T00:00:00.000Z");
        const saved = yield* store.load("Property");
        const member = yield* store.load("Member");
        return { empty, saved, member };
      }).pipe(Effect.provide(DdfWatermarkStoreLive)),
    );

    const afterLoads = await Effect.runPromise(Metric.value(ddfWatermarkLoadCount));
    const afterSaves = await Effect.runPromise(Metric.value(ddfWatermarkSaveCount));

    assert.deepEqual(result, {
      empty: null,
      saved: "2024-01-01T00:00:00.000Z",
      member: null,
    });
    assert.equal(afterLoads.count - beforeLoads.count, 3);
    assert.equal(afterSaves.count - beforeSaves.count, 1);
  });
});
