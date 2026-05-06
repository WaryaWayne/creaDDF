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

export interface DdfWatermarkStoreApi {
  readonly load: (resource: WatermarkResource) => Effect.Effect<string | null, DdfWatermarkError>;
  readonly save: (resource: WatermarkResource, watermark: string) => Effect.Effect<void, DdfWatermarkError>;
}

export const DdfWatermarkStore = Context.Service<DdfWatermarkStoreApi>("DdfWatermarkStore");

const keyFor = (resource: WatermarkResource) => `crea-ddf:watermark:${resource}`;

export const makeDdfWatermarkStore = Effect.fn("DdfWatermarkStore.make")(function* () {
  const kv = yield* KeyValueStore.KeyValueStore;
  return {
    load: Effect.fn("DdfWatermarkStore.load")(function* (resource: WatermarkResource) {
      yield* Metric.update(ddfWatermarkLoadCount, 1);
      const value = yield* kv.get(keyFor(resource)).pipe(
        Effect.mapError((cause) => new DdfWatermarkError({ resource, operation: "load", cause })),
      );
      return value ?? null;
    }),
    save: Effect.fn("DdfWatermarkStore.save")(function* (resource: WatermarkResource, watermark: string) {
      yield* Metric.update(ddfWatermarkSaveCount, 1);
      yield* kv.set(keyFor(resource), watermark).pipe(
        Effect.mapError((cause) => new DdfWatermarkError({ resource, operation: "save", cause })),
      );
    }),
  } satisfies DdfWatermarkStoreApi;
});

export const DdfWatermarkStoreLive = Layer.effect(DdfWatermarkStore, makeDdfWatermarkStore()).pipe(
  Layer.provide(KeyValueStore.layerMemory),
);

export const DdfWatermarkStoreFromKeyValueStore = Layer.effect(DdfWatermarkStore, makeDdfWatermarkStore());
