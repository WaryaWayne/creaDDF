import { assert, describe, it } from "@effect/vitest";
import { splitSqlStatements } from "./runMigrations";

describe("database migrations runner", () => {
  it("splits drizzle SQL statement breakpoints without executing a database", () => {
    assert.deepEqual(
      splitSqlStatements("create table a(id text);\n--> statement-breakpoint\ncreate index b on a(id);\n"),
      ["create table a(id text);", "create index b on a(id);"],
    );
  });
});
