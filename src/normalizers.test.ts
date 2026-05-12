import { assert, describe, it } from "@effect/vitest";
import { Cause, DateTime, Effect, Exit, Schema } from "effect";
import {
  normalizeMedia,
  normalizePropertyGraph,
  normalizePropertyRooms,
} from "./normalizers";
import { MediaSchema, type MediaType } from "./schema/mediaSchema";

const media = (
  overrides: Record<string, unknown> = {},
): MediaType[number] => ({
  MediaKey: "media-1",
  LongDescription: null,
  MediaURL: null,
  ModificationTimestamp: null,
  Order: null,
  PreferredPhotoYN: null,
  ResourceRecordId: null,
  ResourceRecordKey: "resource-1",
  ResourceName: null,
  MediaCategory: null,
  ...overrides,
}) as MediaType[number];

describe("normalizers", () => {
  it.effect(
    "normalizes room listing keys without overwriting existing values",
    () =>
      Effect.gen(function* () {
        const rows = yield* normalizePropertyRooms({
          ListingKey: "parent-listing",
          Rooms: [
            { RoomKey: "room-1", ListingKey: null },
            { RoomKey: "room-2", ListingKey: "room-listing" },
          ],
        });

        assert.deepStrictEqual(
          rows.map((row) => row.ListingKey),
          ["parent-listing", "room-listing"],
        );
      }),
  );

  it.effect(
    "normalizes property graphs into property, room, and media groups",
    () =>
      Effect.gen(function* () {
        const graph = yield* normalizePropertyGraph({
          ListingKey: "listing-graph",
          Rooms: [{ RoomKey: "room-1", ListingKey: null }],
          Media: [
            media({
              MediaKey: "media-1",
              ResourceName: null,
              ResourceRecordKey: null,
            }),
          ],
        });

        assert.strictEqual(graph.property.ListingKey, "listing-graph");
        assert.strictEqual(graph.rooms[0]?.ListingKey, "listing-graph");
        assert.strictEqual(graph.media[0]?.ResourceName, "Property");
        assert.strictEqual(graph.media[0]?.ResourceRecordKey, "listing-graph");
      }),
  );

  it.effect(
    "normalizes media parent values without overwriting existing values",
    () =>
      Effect.sync(() => {
        const missingParent = normalizeMedia(
          "Property",
          "listing-1",
          media({
            MediaKey: "media-1",
            ResourceName: null,
            ResourceRecordKey: null,
          }),
        );
        const existingParent = normalizeMedia(
          "Office",
          "office-1",
          media({
            MediaKey: "media-2",
            ResourceName: "Member",
            ResourceRecordKey: "member-1",
          }),
        );

        assert.strictEqual(missingParent.ResourceName, "Property");
        assert.strictEqual(missingParent.ResourceRecordKey, "listing-1");
        assert.strictEqual(existingParent.ResourceName, "Member");
        assert.strictEqual(existingParent.ResourceRecordKey, "member-1");
      }),
  );

  it.effect("decodes media records and reports invalid enum values", () =>
    Effect.gen(function* () {
      const decodeMedia = Schema.decodeUnknownEffect(MediaSchema);

      const mediaRecord = {
        MediaKey: "media-1",
        LongDescription: null,
        MediaURL: "https://example.test/photo.jpg",
        ModificationTimestamp: "2026-05-04T12:34:56.000Z",
        Order: 1,
        PreferredPhotoYN: true,
        ResourceRecordId: "A1",
        ResourceRecordKey: "listing-1",
        ResourceName: "Property",
        MediaCategory: "Property Photo",
      } satisfies (typeof MediaSchema.Encoded)[number];

      const decoded = yield* decodeMedia([mediaRecord]);
      const timestamp = decoded[0]?.ModificationTimestamp;

      assert.strictEqual(
        DateTime.isDateTime(timestamp) && DateTime.isUtc(timestamp),
        true,
      );

      const invalid = yield* Effect.exit(
        decodeMedia([{ ...mediaRecord, ResourceName: "Listing" }]),
      );
      assert.strictEqual(Exit.isFailure(invalid), true);
      if (Exit.isFailure(invalid)) {
        assert.match(Cause.pretty(invalid.cause), /ResourceName/);
      }
    }),
  );
});
