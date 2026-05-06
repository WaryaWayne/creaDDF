import type { MediaType } from "./schema/mediaSchema"
import type { RoomsType } from "./schema/roomsSchema"

type UnknownRecord = Record<string, unknown>

type ResourceWithMedia = UnknownRecord & {
  readonly Media?: unknown
}

type PropertyWithNestedResources = ResourceWithMedia & {
  readonly ListingKey?: string | null
  readonly Rooms?: unknown
}

const emptyRooms: RoomsType = []
const emptyMedia: MediaType = []

export const getPropertyRooms = (property: PropertyWithNestedResources): RoomsType =>
  Array.isArray(property.Rooms) ? property.Rooms as RoomsType : emptyRooms

export const getPropertyMedia = (property: ResourceWithMedia): MediaType =>
  Array.isArray(property.Media) ? property.Media as MediaType : emptyMedia

export const getMemberMedia = (member: ResourceWithMedia): MediaType =>
  getPropertyMedia(member)

export const getOfficeMedia = (office: ResourceWithMedia): MediaType =>
  getPropertyMedia(office)

export const normalizePropertyRooms = (property: PropertyWithNestedResources): RoomsType =>
  getPropertyRooms(property).map((room) => ({
    ...room,
    ListingKey: room.ListingKey ?? property.ListingKey ?? null,
  })) as RoomsType

export const normalizeMedia = (
  resourceName: "Property" | "Member" | "Office",
  parentKey: string,
  media: MediaType[number],
): MediaType[number] => ({
  ...media,
  ResourceName: media.ResourceName ?? resourceName,
  ResourceRecordKey: media.ResourceRecordKey ?? parentKey,
})

export const normalizePropertyGraph = <Property extends PropertyWithNestedResources>(
  property: Property,
) => {
  const listingKey = typeof property.ListingKey === "string" ? property.ListingKey : ""
  return {
    property,
    rooms: normalizePropertyRooms(property),
    media: getPropertyMedia(property).map((media) =>
      normalizeMedia("Property", listingKey, media),
    ),
  }
}
