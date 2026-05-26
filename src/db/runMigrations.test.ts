import { assert, describe, it } from "vitest";
import {
  migrationFilesWithIds,
  splitSqlStatements,
} from "./runMigrations.js";

describe("database migrations runner", () => {
  it("splits drizzle SQL statement breakpoints without executing a database", () => {
    assert.deepEqual(
      splitSqlStatements("create table a(id text);\n--> statement-breakpoint\ncreate index b on a(id);\n"),
      ["create table a(id text);", "create index b on a(id);"],
    );
  });

  it("assigns sorted migration files sequential ids", () => {
    assert.deepEqual(
      migrationFilesWithIds([
        "not-a-migration",
        "20260512041644_cooing_masked_marvel",
        "20260511164803_careless_tana_nile",
        "20260511215957_strong_richard_fisk",
        "20260512120000_fix_ddf_schema_drift.sql",
      ]),
      [
        { file: "20260511164803_careless_tana_nile", id: 1 },
        { file: "20260511215957_strong_richard_fisk", id: 2 },
        { file: "20260512041644_cooing_masked_marvel", id: 3 },
        { file: "20260512120000_fix_ddf_schema_drift.sql", id: 4 },
      ],
    );
  });
});
