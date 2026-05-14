import { and, eq } from "drizzle-orm";
import { Data, Effect, Metric } from "effect";
import type { SyncResource } from "../sync";
import { ddfWatermarkLoadCount, ddfWatermarkSaveCount } from "../metrics";
import { DdfDatabase } from "./layer";
import type { DdfWatermarkScope } from "./schema";
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

export const processedReplicationStreamCursorKind = "processed_replication_stream" as const;

const defaultWatermarkScope: DdfWatermarkScope = {
  destinationId: null,
  chosenAorKeys: [],
};

const normalizedWatermarkScope = (
  scope: DdfWatermarkScope = defaultWatermarkScope,
): DdfWatermarkScope => ({
  destinationId: scope.destinationId,
  chosenAorKeys: [...scope.chosenAorKeys].sort(),
});

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const watermarkScopeHash = (scope: DdfWatermarkScope = defaultWatermarkScope) =>
  stableJson(normalizedWatermarkScope(scope));

export const loadDatabaseWatermark = Effect.fn(
  "DdfDatabaseWatermarkStore.load",
)(function* (resource: SyncResource, scope?: DdfWatermarkScope) {
  yield* Metric.update(ddfWatermarkLoadCount, 1);
  const { db } = yield* DdfDatabase;
  const expectedScopeHash = watermarkScopeHash(scope);
  const rows = yield* db
    .select({
      watermark: ddfWatermarks.watermark,
    })
    .from(ddfWatermarks)
    .where(and(
      eq(ddfWatermarks.resource, resource),
      eq(ddfWatermarks.cursorKind, processedReplicationStreamCursorKind),
      eq(ddfWatermarks.scopeHash, expectedScopeHash),
    ))
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
  const row = rows[0];
  if (row === undefined) return null;
  return row.watermark;
});

export const saveDatabaseWatermark = Effect.fn(
  "DdfDatabaseWatermarkStore.save",
)(function* (
  resource: SyncResource,
  watermark: string,
  scope?: DdfWatermarkScope,
) {
  yield* Metric.update(ddfWatermarkSaveCount, 1);
  const { db } = yield* DdfDatabase;
  const normalizedScope = normalizedWatermarkScope(scope);
  const scopeHash = watermarkScopeHash(normalizedScope);
  yield* db
    .insert(ddfWatermarks)
    .values({
      resource,
      watermark,
      cursorKind: processedReplicationStreamCursorKind,
      scopeHash,
      scope: normalizedScope,
    })
    .onConflictDoUpdate({
      target: [
        ddfWatermarks.resource,
        ddfWatermarks.cursorKind,
        ddfWatermarks.scopeHash,
      ],
      set: {
        watermark,
        cursorKind: processedReplicationStreamCursorKind,
        scopeHash,
        scope: normalizedScope,
        ...touchUpdatedAt,
      },
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
