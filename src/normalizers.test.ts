import { assert, describe, it } from "@effect/vitest";
import { Cause, DateTime, Effect, Exit, Schema } from "effect";
import {
  getPropertyMedia,
  normalizeMedia,
  normalizePropertyGraph,
  normalizePropertyRooms,
} from "./normalizers";
import { MediaSchema, type MediaType } from "./schema/mediaSchema";
import { MemberSchema } from "./schema/memberSchema";
import { OfficeSchema } from "./schema/officeSchema";
import { PropertyListingSchema } from "./schema/propertyListingsSchema";
import { RoomsSchema } from "./schema/roomsSchema";

const media = (
  overrides: Partial<MediaType[number]> = {},
): MediaType[number] => ({
  MediaKey: "media-1",
  LongDescription: null,
  MediaURL: null,
  ModificationTimestamp: null,
  Order: null,
  PreferredPhotoYN: null,
  ResourceRecordId: null,
  ResourceRecordKey: null,
  ResourceName: null,
  MediaCategory: null,
  ...overrides,
});

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

  it.effect("returns no embedded media when media fails schema decoding", () =>
    Effect.sync(() => {
      const decoded = getPropertyMedia({
        Media: [media({ MediaKey: "bad", ResourceName: "Listing" as never })],
      });

      assert.deepStrictEqual(decoded, []);
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

  it.effect(
    "decodes nullable parent keys before normalization fills them",
    () =>
      Effect.gen(function* () {
        const decodeMedia = Schema.decodeUnknownEffect(MediaSchema);
        const decodedMedia = yield* decodeMedia([
          media({
            MediaKey: "media-null-parent",
            ResourceName: null,
            ResourceRecordKey: null,
          }),
        ]);

        const decoded = decodedMedia[0];
        assert.notStrictEqual(decoded, undefined);
        if (decoded === undefined) return;

        const normalized = normalizeMedia("Property", "listing-1", decoded);

        assert.strictEqual(normalized.ResourceName, "Property");
        assert.strictEqual(normalized.ResourceRecordKey, "listing-1");
      }),
  );

  it.effect("decodes nullable CoListOfficeKey values", () =>
    Effect.gen(function* () {
      const decodeCoListOfficeKey = Schema.decodeUnknownEffect(
        Schema.Struct({
          CoListOfficeKey: PropertyListingSchema.fields.CoListOfficeKey,
        }),
      );

      const decoded = yield* decodeCoListOfficeKey({ CoListOfficeKey: null });

      assert.strictEqual(decoded.CoListOfficeKey, null);
    }),
  );

  it.effect("decodes nullable Media collections", () =>
    Effect.gen(function* () {
      const decodePropertyMedia = Schema.decodeUnknownEffect(
        Schema.Struct({ Media: PropertyListingSchema.fields.Media }),
      );
      const decodeMemberMedia = Schema.decodeUnknownEffect(
        Schema.Struct({ Media: MemberSchema.fields.Media }),
      );
      const decodeOfficeMedia = Schema.decodeUnknownEffect(
        Schema.Struct({ Media: OfficeSchema.fields.Media }),
      );

      const property = yield* decodePropertyMedia({ Media: null });
      const member = yield* decodeMemberMedia({ Media: null });
      const office = yield* decodeOfficeMedia({ Media: null });

      assert.strictEqual(property.Media, null);
      assert.strictEqual(member.Media, null);
      assert.strictEqual(office.Media, null);
    }),
  );

  it.effect("decodes nullable social media collections", () =>
    Effect.gen(function* () {
      const decodeMemberSocial = Schema.decodeUnknownEffect(
        Schema.Struct({
          MemberSocialMedia: MemberSchema.fields.MemberSocialMedia,
        }),
      );
      const decodeOfficeSocial = Schema.decodeUnknownEffect(
        Schema.Struct({
          OfficeSocialMedia: OfficeSchema.fields.OfficeSocialMedia,
        }),
      );

      const member = yield* decodeMemberSocial({ MemberSocialMedia: null });
      const office = yield* decodeOfficeSocial({ OfficeSocialMedia: null });

      assert.strictEqual(member.MemberSocialMedia, null);
      assert.strictEqual(office.OfficeSocialMedia, null);
    }),
  );

  it.effect("decodes nullable child keys before fallback row key derivation", () =>
    Effect.gen(function* () {
      const decodeMedia = Schema.decodeUnknownEffect(MediaSchema);
      const decodeRooms = Schema.decodeUnknownEffect(RoomsSchema);

      const decodedMedia = yield* decodeMedia([
        media({
          MediaKey: null,
          MediaURL: "https://example.test/fallback.jpg",
          Order: 1,
        }),
      ]);
      const decodedRooms = yield* decodeRooms([
        {
          RoomKey: null,
          ListingId: null,
          ListingKey: null,
          ModificationTimestamp: "2026-05-12T00:00:00.000Z",
          RoomDescription: null,
          RoomDimensions: null,
          RoomLength: null,
          RoomLevel: "Main level",
          RoomWidth: null,
          RoomLengthWidthUnits: null,
          RoomType: "Kitchen",
        },
      ]);

      assert.strictEqual(decodedMedia[0]?.MediaKey, null);
      assert.strictEqual(decodedRooms[0]?.RoomKey, null);

      const normalizedRooms = yield* normalizePropertyRooms({
        ListingKey: "listing-1",
        Rooms: decodedRooms,
      });

      assert.strictEqual(normalizedRooms[0]?.ListingKey, "listing-1");
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
