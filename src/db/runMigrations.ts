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

const loadDdfDatabaseMigrations = Effect.fn(
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

  return yield* Effect.forEach(migrationFiles.map((file, index) => ({ file, id: index + 1 })), ({ file, id }) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const match = /^(\d+)_(.+?)(?:\.sql)?$/.exec(file);
      if (match === null) {
        return yield* new Migrator.MigrationError({
          kind: "Failed",
          message: `Invalid migration filename: ${file}`,
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
