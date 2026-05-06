import type { MediaType } from "./schema/mediaSchema"

export const getPropertyRooms = (property: Record<string, any>) => Array.isArray(property.Rooms) ? property.Rooms : []
export const getPropertyMedia = (property: Record<string, any>) => Array.isArray(property.Media) ? property.Media : []
export const getMemberMedia = (member: Record<string, any>) => Array.isArray(member.Media) ? member.Media : []
export const getOfficeMedia = (office: Record<string, any>) => Array.isArray(office.Media) ? office.Media : []

export const normalizePropertyRooms = (property: Record<string, any>) =>
  getPropertyRooms(property).map((room: Record<string, any>) => ({ ...room, ListingKey: room.ListingKey ?? property.ListingKey ?? null }))

export const normalizeMedia = (resourceName: "Property" | "Member" | "Office", parentKey: string, media: MediaType[number]) => ({
  ...media,
  ResourceName: media.ResourceName ?? resourceName,
  ResourceRecordKey: media.ResourceRecordKey ?? parentKey,
})
