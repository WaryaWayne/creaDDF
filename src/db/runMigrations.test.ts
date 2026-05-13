import { assert, describe, it } from "@effect/vitest";
import {
  migrationIdFromFile,
  postgresIntegerMax,
  splitSqlStatements,
} from "./runMigrations";

describe("database migrations runner", () => {
  it("splits drizzle SQL statement breakpoints without executing a database", () => {
    assert.deepEqual(
      splitSqlStatements("create table a(id text);\n--> statement-breakpoint\ncreate index b on a(id);\n"),
      ["create table a(id text);", "create index b on a(id);"],
    );
  });

  it("keeps bundled migration ids compatible with existing sequential records", () => {
    assert.equal(migrationIdFromFile("20260511164803_careless_tana_nile"), 1);
    assert.equal(migrationIdFromFile("20260511215957_strong_richard_fisk"), 2);
    assert.equal(migrationIdFromFile("20260512041644_cooing_masked_marvel"), 3);
    assert.equal(migrationIdFromFile("20260512120000_fix_ddf_schema_drift"), 4);
  });

  it("derives compact timestamp ids within Postgres integer range for future migrations", () => {
    const id = migrationIdFromFile("20260513140506_future_schema_change");

    assert.equal(typeof id, "number");
    assert.equal(id !== null && id > 4, true);
    assert.equal(id !== null && id <= postgresIntegerMax, true);
    assert.equal(id, migrationIdFromFile("20260513140506_future_schema_change.sql"));
    assert.equal(migrationIdFromFile("not-a-migration"), null);
  });
});
