import { Config, Data, Effect, FileSystem, Layer } from "effect";
import * as Migrator from "effect/unstable/sql/Migrator";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { fileURLToPath } from "node:url";
import { DdfDatabase } from "./layer";
import { splitSqlStatements } from "./migrationUtils";
export { splitSqlStatements } from "./migrationUtils";


export class DdfDatabaseMigrationLoadError extends Data.TaggedError(
  "DdfDatabaseMigrationLoadError",
)<{
  readonly directory: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `Failed to load DDF database migrations from ${this.directory}`;
  }
}

export interface RunDdfDatabaseMigrationsOptions {
  readonly migrationsDirectory?: string;
}

const defaultMigrationsDirectory = () =>
  fileURLToPath(new URL("./migrations", import.meta.url));

export const postgresIntegerMax = 2_147_483_647;

const bundledMigrationIds = new Map<string, number>([
  ["20260511164803_careless_tana_nile", 1],
  ["20260511215957_strong_richard_fisk", 2],
  ["20260512041644_cooing_masked_marvel", 3],
  ["20260512120000_fix_ddf_schema_drift", 4],
]);

const daysBeforeMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;

const isLeapYear = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const compactTimestampId = (timestamp: string): number | null => {
  if (!/^\d{14}$/.test(timestamp)) return null;

  const year = Number.parseInt(timestamp.slice(0, 4), 10);
  const month = Number.parseInt(timestamp.slice(4, 6), 10);
  const day = Number.parseInt(timestamp.slice(6, 8), 10);
  const hour = Number.parseInt(timestamp.slice(8, 10), 10);
  const minute = Number.parseInt(timestamp.slice(10, 12), 10);
  const second = Number.parseInt(timestamp.slice(12, 14), 10);

  if (year < 2020 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const monthIndex = month - 1;
  const maxDay = month === 2 && isLeapYear(year)
    ? 29
    : (daysBeforeMonth[month] ?? 365) - daysBeforeMonth[monthIndex];
  if (day < 1 || day > maxDay) return null;

  const dayOfYear = daysBeforeMonth[monthIndex] + (month > 2 && isLeapYear(year) ? 1 : 0) + day - 1;
  const secondsOfYear = dayOfYear * 86_400 + hour * 3_600 + minute * 60 + second;
  const id = (year - 2020) * 32_000_000 + secondsOfYear;
  return id > 0 && id <= postgresIntegerMax ? id : null;
};

export const migrationIdFromFile = (file: string): number | null => {
  const match = /^(\d{14}_.+?)(?:\.sql)?$/.exec(file);
  if (match === null) return null;

  const name = match[1] ?? "";
  const bundledId = bundledMigrationIds.get(name);
  if (bundledId !== undefined) return bundledId;

  return compactTimestampId(name.slice(0, 14));
};

export const loadDdfDatabaseMigrations = Effect.fn(
  "DdfDatabaseMigrations.load",
)(function* (directory: string) {
  const fileSystem = yield* FileSystem.FileSystem;

  const files = yield* fileSystem.readDirectory(directory).pipe(
    Effect.mapError(
      (cause) =>
        new Migrator.MigrationError({
          kind: "Failed",
          message: `Failed to load DDF database migrations from ${directory}`,
          cause,
        }),
    ),
  );

  const migrationFiles = files
    .filter((file) => /^\d+_.+/.test(file))
    .sort((left, right) => left.localeCompare(right));

  return yield* Effect.forEach(migrationFiles, (file) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const match = /^(\d+)_(.+?)(?:\.sql)?$/.exec(file);
      if (match === null) {
        return yield* new Migrator.MigrationError({
          kind: "Failed",
          message: `Invalid migration filename: ${file}`,
        });
      }
      const id = migrationIdFromFile(file);
      if (id === null) {
        return yield* new Migrator.MigrationError({
          kind: "Failed",
          message: `Invalid migration id in filename: ${file}`,
        });
      }
      const sqlPath = file.endsWith(".sql")
        ? `${directory}/${file}`
        : `${directory}/${file}/migration.sql`;

      const content = yield* fileSystem.readFileString(sqlPath).pipe(
        Effect.mapError(
          (cause) =>
            new Migrator.MigrationError({
              kind: "Failed",
              message: `Failed to read DDF database migration file: ${sqlPath}`,
              cause,
            }),
        ),
      );
      const name = match[2] ?? "migration";
      return [
        id,
        name,
        Effect.succeed(
          Effect.gen(function* () {
            const sql = yield* SqlClient;
            yield* Effect.forEach(
              splitSqlStatements(content),
              (statement) => sql.unsafe(statement),
              { discard: true },
            );
          }),
        ),
      ] as const;
    }),
  );
});

export const runDdfDatabaseMigrations = Effect.fn(
  "DdfDatabaseMigrations.run",
)(function* (options?: RunDdfDatabaseMigrationsOptions) {
  const loader = loadDdfDatabaseMigrations(
    options?.migrationsDirectory ?? defaultMigrationsDirectory(),
  );
  return yield* Migrator.make({})({
    loader,
    table: "ddf_effect_migrations",
  });
});


const cli = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL");
  const { BunFileSystem } = yield* Effect.promise(() =>
    import("@effect/platform-bun"),
  );
  const mergedLayer = Layer.merge(
    DdfDatabase.layerFromUrl(databaseUrl),
    BunFileSystem.layer,
  );
  return yield* runDdfDatabaseMigrations().pipe(
    Effect.provide(mergedLayer),
  );
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { BunRuntime } = await import("@effect/platform-bun");
  BunRuntime.runMain(cli);
}
