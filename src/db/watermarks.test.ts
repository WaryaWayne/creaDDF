import { assert, describe, it } from "@effect/vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { ddfWatermarks } from "./schema";
import { watermarkScopeHash } from "./watermarks";

describe("database watermark scope", () => {
  it("hashes AOR keys in a stable order and separates destination scopes", () => {
    const left = watermarkScopeHash({
      destinationId: 7,
      chosenAorKeys: ["93", "76"],
    });
    const right = watermarkScopeHash({
      destinationId: 7,
      chosenAorKeys: ["76", "93"],
    });
    const otherDestination = watermarkScopeHash({
      destinationId: 8,
      chosenAorKeys: ["76", "93"],
    });

    assert.equal(left, right);
    assert.notEqual(left, otherDestination);
  });

  it("keys stored watermarks by resource, cursor kind, and scope hash", () => {
    const [primaryKey] = getTableConfig(ddfWatermarks).primaryKeys;

    assert.deepEqual(
      primaryKey?.columns.map((column) => column.name),
      ["resource", "cursor_kind", "scope_hash"],
    );
  });
});
