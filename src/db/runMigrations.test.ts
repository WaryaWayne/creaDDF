import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { splitSqlStatements } from "./runMigrations";
import { embeddedDdfDatabaseMigrations } from "./migrations";

describe("database migrations runner", () => {
  it("splits drizzle SQL statement breakpoints without executing a database", () => {
    assert.deepEqual(
      splitSqlStatements("create table a(id text);\n--> statement-breakpoint\ncreate index b on a(id);\n"),
      ["create table a(id text);", "create index b on a(id);"],
    );
  });

  it.effect("ships embedded migrations for compiled runtimes", () =>
    embeddedDdfDatabaseMigrations.pipe(
      Effect.map((migrations) => {
        assert.deepEqual(
          migrations.map(([id, name]) => [id, name]),
          [[1, "initial_schema"]],
        );
      }),
    ),
  );
});
