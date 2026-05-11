import { eq } from "drizzle-orm";
import { Data, Effect, Metric } from "effect";
import type { SyncResource } from "../sync";
import { ddfWatermarkLoadCount, ddfWatermarkSaveCount } from "../metrics";
import { DdfDatabase } from "./layer";
import { ddfWatermarks, touchUpdatedAt } from "./schema";

export class DdfDatabaseWatermarkError extends Data.TaggedError(
  "DdfDatabaseWatermarkError",
)<{
  readonly resource: SyncResource;
  readonly operation: "load" | "save";
  readonly cause: unknown;
}> {
  override get message() {
    return `Failed to ${this.operation} ${this.resource} database watermark`;
  }
}

export const loadDatabaseWatermark = Effect.fn(
  "DdfDatabaseWatermarkStore.load",
)(function* (resource: SyncResource) {
  yield* Metric.update(ddfWatermarkLoadCount, 1);
  const { db } = yield* DdfDatabase;
  const rows = yield* db
    .select({ watermark: ddfWatermarks.watermark })
    .from(ddfWatermarks)
    .where(eq(ddfWatermarks.resource, resource))
    .limit(1)
    .pipe(
      Effect.mapError(
        (cause) =>
          new DdfDatabaseWatermarkError({
            resource,
            operation: "load",
            cause,
          }),
      ),
    );
  return rows[0]?.watermark ?? null;
});

export const saveDatabaseWatermark = Effect.fn(
  "DdfDatabaseWatermarkStore.save",
)(function* (resource: SyncResource, watermark: string) {
  yield* Metric.update(ddfWatermarkSaveCount, 1);
  const { db } = yield* DdfDatabase;
  yield* db
    .insert(ddfWatermarks)
    .values({ resource, watermark })
    .onConflictDoUpdate({
      target: ddfWatermarks.resource,
      set: { watermark, ...touchUpdatedAt },
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new DdfDatabaseWatermarkError({
            resource,
            operation: "save",
            cause,
          }),
      ),
    );
});

export const makeDatabaseWatermarkStore = () => ({
  load: loadDatabaseWatermark,
  save: saveDatabaseWatermark,
});
