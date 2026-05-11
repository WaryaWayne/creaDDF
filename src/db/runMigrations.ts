import { Config, Data, Effect } from "effect";
import * as Migrator from "effect/unstable/sql/Migrator";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DdfDatabase } from "./layer";
import { embeddedDdfDatabaseMigrations } from "./migrations";
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

const loadDdfDatabaseMigrations = Effect.fn(
  "DdfDatabaseMigrations.load",
)(function* (directory: string) {
  const files = yield* Effect.tryPromise({
    try: () => readdir(directory),
    catch: (cause) => new Migrator.MigrationError({ kind: "Failed", message: `Failed to load DDF database migrations from ${directory}`, cause }),
  });

  const migrationFiles = files
    .filter((file) => /^\d+_.+/.test(file))
    .sort((left, right) => left.localeCompare(right));

  return yield* Effect.forEach(migrationFiles.map((file, index) => ({ file, id: index + 1 })), ({ file, id }) =>
    Effect.gen(function* () {
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
      const content = yield* Effect.tryPromise({
        try: () => readFile(sqlPath, "utf8"),
        catch: (cause) =>
          new Migrator.MigrationError({ kind: "Failed", message: `Failed to load DDF database migrations from ${directory}`, cause }),
      });
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
  const loader = options?.migrationsDirectory === undefined
    ? embeddedDdfDatabaseMigrations
    : loadDdfDatabaseMigrations(options.migrationsDirectory);
  return yield* Migrator.make({})({
    loader,
    table: "ddf_effect_migrations",
  });
});

const cli = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL");
  return yield* runDdfDatabaseMigrations().pipe(
    Effect.provide(DdfDatabase.layerFromUrl(databaseUrl)),
  );
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  Effect.runPromise(cli);
}
