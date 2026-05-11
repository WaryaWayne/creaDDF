import { Effect } from "effect";
import type { MediaType } from "./schema/mediaSchema";
import type { RoomsType } from "./schema/roomsSchema";

type UnknownRecord = Record<string, unknown>;

type ResourceWithMedia = UnknownRecord & {
  readonly Media?: unknown;
};

type PropertyWithNestedResources = ResourceWithMedia & {
  readonly ListingKey?: string | null;
  readonly Rooms?: unknown;
};

const emptyRooms: RoomsType = [];
const emptyMedia: MediaType = [];

export const getPropertyRooms = (
  property: PropertyWithNestedResources,
): RoomsType =>
  Array.isArray(property.Rooms) ? (property.Rooms as RoomsType) : emptyRooms;

export const getPropertyMedia = (property: ResourceWithMedia): MediaType =>
  Array.isArray(property.Media) ? (property.Media as MediaType) : emptyMedia;

export const getMemberMedia = Effect.fn("getMemberMedia")(function* (
  member: ResourceWithMedia,
) {
  return getPropertyMedia(member);
});

export const getOfficeMedia = Effect.fn("getOfficeMedia")(function* (
  office: ResourceWithMedia,
) {
  return getPropertyMedia(office);
});

export const normalizePropertyRooms = Effect.fn("normalizePropertyRooms")(
  function* (property: PropertyWithNestedResources) {
    const propertyRooms = getPropertyRooms(property);
    return propertyRooms.map((room) => ({
      ...room,
      ListingKey: room.ListingKey ?? property.ListingKey ?? null,
    }));
  },
);

export const normalizeMedia = (
  resourceName: "Property" | "Member" | "Office",
  parentKey: string,
  media: MediaType[number],
) => ({
  ...media,
  ResourceName: media.ResourceName ?? resourceName,
  ResourceRecordKey: media.ResourceRecordKey ?? parentKey,
});

export const normalizePropertyGraph = Effect.fn("normalizePropertyGraph")(
  function* <Property extends PropertyWithNestedResources>(property: Property) {
    const listingKey =
      typeof property.ListingKey === "string" ? property.ListingKey : "";
    const media = getPropertyMedia(property);

    return {
      property,
      rooms: yield* normalizePropertyRooms(property),
      media: media.map((item) => normalizeMedia("Property", listingKey, item)),
    };
  },
);
