import { Context, Data, Effect, Layer, Metric } from "effect";
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore";
import type { SyncResource } from "./sync";
import { ddfWatermarkLoadCount, ddfWatermarkSaveCount } from "./metrics";

export type WatermarkResource = SyncResource;

export class DdfWatermarkError extends Data.TaggedError("DdfWatermarkError")<{
  readonly resource: WatermarkResource;
  readonly operation: "load" | "save";
  readonly cause: unknown;
}> {
  override get message() {
    return `Failed to ${this.operation} ${this.resource} watermark`;
  }
}

const keyFor = (resource: WatermarkResource) =>
  `crea-ddf:watermark:${resource}`;

export class DdfWatermarkStore extends Context.Service<DdfWatermarkStore>()(
  "crea-ddf-effect-sdk/watermark/DdfWatermarkStore",
  {
    make: Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore;

      const load = Effect.fn("DdfWatermarkStore.load")(function* (
        resource: WatermarkResource,
      ) {
        yield* Metric.update(ddfWatermarkLoadCount, 1);
        const value = yield* kv.get(keyFor(resource)).pipe(
          Effect.mapError(
            (cause) =>
              new DdfWatermarkError({
                resource,
                operation: "load",
                cause,
              }),
          ),
        );
        return value ?? null;
      });

      const save = Effect.fn("DdfWatermarkStore.save")(function* (
        resource: WatermarkResource,
        watermark: string,
      ) {
        yield* Metric.update(ddfWatermarkSaveCount, 1);
        yield* kv.set(keyFor(resource), watermark).pipe(
          Effect.mapError(
            (cause) =>
              new DdfWatermarkError({
                resource,
                operation: "save",
                cause,
              }),
          ),
        );
      });

      return {
        load,
        save,
      };
    }),
  },
) {
  static layer = Layer.effect(this, this.make);

  static readonly layerMemory = this.layer.pipe(
    Layer.provide(KeyValueStore.layerMemory),
  );
}
