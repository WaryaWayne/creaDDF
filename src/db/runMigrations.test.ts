import { assert, describe, it } from "@effect/vitest";
import { migrationIdFromFile, splitSqlStatements } from "./runMigrations";

describe("database migrations runner", () => {
  it("splits drizzle SQL statement breakpoints without executing a database", () => {
    assert.deepEqual(
      splitSqlStatements("create table a(id text);\n--> statement-breakpoint\ncreate index b on a(id);\n"),
      ["create table a(id text);", "create index b on a(id);"],
    );
  });

  it("uses the timestamp filename prefix as the stable migration id", () => {
    assert.equal(migrationIdFromFile("20260512120000_fix_ddf_schema_drift"), 20260512120000);
    assert.equal(migrationIdFromFile("20260512120000_fix_ddf_schema_drift.sql"), 20260512120000);
    assert.equal(migrationIdFromFile("not-a-migration"), null);
  });
});
